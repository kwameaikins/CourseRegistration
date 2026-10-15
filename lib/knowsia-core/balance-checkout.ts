// A Core checkout for what is still owed on one registration (Doc 25 §1,
// decision 3). Shared by the portal's own Pay button (/api/checkout) and
// KnowsiaApp's (/api/integration/participants/[id]/checkout/[registrationId],
// one-portal merge Phase 3a, 2026-10-15). The amount is always this app's own
// payment row, read here on the server; nobody else names it.
import { batchSkuCode } from '@/lib/knowsia-core/catalogue';
import { createCheckoutOnCore, isCoreCheckoutOn, type CoreCheckoutRecord } from '@/lib/knowsia-core/payments';
import * as knowsiaAppRepository from '@/modules/knowsia-app/repository';
import * as paymentsRepository from '@/modules/payments/repository';

export type BalanceCheckout =
  | { outcome: 'ok'; checkout: CoreCheckoutRecord }
  | { outcome: 'disabled' }
  | { outcome: 'not_found' }
  | { outcome: 'nothing_owed' };

/** Where a student may be sent back after paying: knowsia.com only (and
 * localhost outside production) — the door is never an open redirect. */
export function allowedCallback(url: string | null | undefined): boolean {
  if (!url) return true;
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' && (u.hostname === 'knowsia.com' || u.hostname.endsWith('.knowsia.com'))) return true;
    return process.env.NODE_ENV !== 'production' && u.hostname === 'localhost';
  } catch {
    return false;
  }
}

export async function balanceCheckout(
  registrationId: string,
  options: { participantId?: string; callbackUrl?: string | null } = {},
): Promise<BalanceCheckout> {
  if (!isCoreCheckoutOn()) return { outcome: 'disabled' };
  const [payment, context] = await Promise.all([
    paymentsRepository.selectPaymentByRegistrationIdSystem(registrationId),
    knowsiaAppRepository.selectPaymentSettledContextSystem(registrationId),
  ]);
  if (!payment || !context || context.participantDeleted) return { outcome: 'not_found' };
  // Asked for a named participant: a registration that is not theirs does not exist.
  if (options.participantId && context.participantId !== options.participantId) return { outcome: 'not_found' };
  const balanceMinor = Math.round(Number(payment.balance) * 100);
  if (balanceMinor <= 0) return { outcome: 'nothing_owed' };
  const checkout = await createCheckoutOnCore({
    registrationId,
    participantId: context.participantId,
    participantEmail: context.participantEmail,
    skuCode: batchSkuCode(context.courseCode, context.cohortLabel),
    balanceMinor,
    isBalance: Number(payment.amount_paid) > 0 || Math.round(Number(payment.course_fee) * 100) !== balanceMinor,
    callbackUrl: options.callbackUrl ?? null,
  });
  return checkout ? { outcome: 'ok', checkout } : { outcome: 'disabled' };
}
