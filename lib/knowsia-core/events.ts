// Knowsia Core Analytics across products, from this app (Doc 22 §7 Phase 4,
// Release 3, 2026-09-19; Doc 24 §3).
//
// Every settled payment here is a row on Core's ledger, so the KPI page over
// there reads revenue BY PRODUCT from one place. Raised from the paid
// transition only (never the zero-fee path — a free seat is not revenue), keyed
// by this registration and the payment event that settled it: the idempotency
// key is the door's key, and a repeat answers `duplicate: true`. Best effort —
// Core down never costs a payment or its side effects.
import { captureToSentry } from '@/lib/errors';

export function isCoreEventsConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export interface PaymentSettledInput {
  registrationId: string;
  paymentEventId: string;
  transactionId: string | null;
  amountMinor: number;
  currency?: string;
  email: string;
  participantId: string;
  skuCode: string | null;
  organisationRef: string | null;
  occurredAt: string;
  source: string;
}

export async function raisePaymentSettledToCore(input: PaymentSettledInput): Promise<{ accepted: boolean; duplicate: boolean } | null> {
  if (!isCoreEventsConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/events`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        event_type: 'PAYMENT_SETTLED',
        idempotency_key: `registration:${input.registrationId}:${input.transactionId ?? input.paymentEventId}`,
        occurred_at: input.occurredAt,
        actor_ref: input.participantId,
        payload: {
          amount_minor: input.amountMinor,
          currency: input.currency ?? 'GHS',
          reference: input.transactionId ?? input.paymentEventId,
          email: input.email,
          participant_id: input.participantId,
          registration_id: input.registrationId,
          sku_code: input.skuCode,
          organisation_ref: input.organisationRef,
          source: input.source,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core events answered ${response.status}`);
    return (await response.json()) as { accepted: boolean; duplicate: boolean };
  } catch (err) {
    captureToSentry(err, { job: 'core-events:payment-settled', registrationId: input.registrationId });
    return null;
  }
}
