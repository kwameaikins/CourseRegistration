// Knowsia Core Payments, from this app (Doc 22 §7 Phase 5; Doc 25 §1,
// 2026-09-20).
//
// A checkout is initialised by Core — it quotes the batch's SKU through the
// catalogue, initialises with Paystack and records the reference and the
// expected amount — and this app resumes the access code in Paystack's
// inline. The balance on a part-paid registration is this app's own fact,
// so it is sent as `amount_minor` and Core records it as such. Only when
// CORE_CHECKOUT=1; off, the old client-side flow runs unchanged. The webhook
// comes to Core and is forwarded to this app's own handler, so nothing here
// changes how a payment is confirmed. Best effort: Core down means the old
// flow, never a student who cannot pay.
import { captureToSentry } from '@/lib/errors';

export function isCoreCheckoutOn(): boolean {
  return process.env.CORE_CHECKOUT === '1' && Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export interface CoreCheckoutRecord {
  id: string;
  reference: string;
  authorization_url: string;
  access_code: string;
  amount_minor: number;
  currency: string;
  sku_code: string | null;
  status: string;
}

export async function createCheckoutOnCore(input: {
  registrationId: string;
  participantId: string;
  participantEmail: string;
  skuCode: string | null;
  balanceMinor: number;
  isBalance: boolean;
  callbackUrl?: string | null;
}): Promise<CoreCheckoutRecord | null> {
  if (!isCoreCheckoutOn()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/payments/checkout`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        payer_email: input.participantEmail,
        payer_ref: input.participantId,
        sku_code: input.skuCode,
        qty: 1,
        external_ref: input.registrationId,
        amount_minor: input.isBalance || !input.skuCode ? input.balanceMinor : null,
        callback_url: input.callbackUrl ?? null,
        metadata: { registration_id: input.registrationId },
        channels: ['card', 'mobile_money'],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`core payments checkout answered ${response.status}`);
    return (await response.json()) as CoreCheckoutRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-payments:checkout', registrationId: input.registrationId });
    return null;
  }
}

export async function refundOnCore(input: { reference: string; amountMinor: number | null; reason: string; atProvider?: boolean }): Promise<boolean> {
  if (!(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY)) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/payments/refunds`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ product: 'registration', reference: input.reference, amount_minor: input.amountMinor, reason: input.reason, at_provider: input.atProvider ?? true }),
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch (err) {
    captureToSentry(err, { job: 'core-payments:refund', reference: input.reference });
    return false;
  }
}
