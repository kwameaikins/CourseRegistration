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

/** What the next instalment still needs, in pesewas: the first instalment
 * not yet covered, less what has been allocated to it, never more than the
 * balance. Null when there is no plan (or every instalment is covered). Pure. */
export function nextInstallmentMinor(
  installments: Array<{ amount_due: number | string; amount_paid: number | string }>,
  balanceMinor: number,
): number | null {
  for (const i of installments) {
    const left = Math.round((Number(i.amount_due) - Number(i.amount_paid)) * 100);
    if (left > 0) return Math.min(left, balanceMinor);
  }
  return null;
}

export async function balanceCheckout(
  registrationId: string,
  options: { participantId?: string; callbackUrl?: string | null; part?: 'balance' | 'installment' } = {},
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
  let amountMinor = balanceMinor;
  // Phase 3b: on a payment plan, the student may pay just the next
  // instalment. The webhook adds whatever is paid and reconcileInstallments
  // re-allocates, so a part payment settles exactly like the portal's.
  if (options.part === 'installment') {
    const next = nextInstallmentMinor(await paymentsRepository.selectInstallmentsForRegistration(registrationId), balanceMinor);
    if (next !== null) amountMinor = next;
  }
  const checkout = await createCheckoutOnCore({
    registrationId,
    participantId: context.participantId,
    participantEmail: context.participantEmail,
    skuCode: batchSkuCode(context.courseCode, context.cohortLabel),
    balanceMinor: amountMinor,
    isBalance: Number(payment.amount_paid) > 0 || Math.round(Number(payment.course_fee) * 100) !== amountMinor,
    callbackUrl: options.callbackUrl ?? null,
  });
  return checkout ? { outcome: 'ok', checkout } : { outcome: 'disabled' };
}
