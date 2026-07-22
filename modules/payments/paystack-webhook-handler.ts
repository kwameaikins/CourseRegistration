// F1.05 — Paystack webhook processing (BR-13 signature validation happens in
// the route before this handler runs; BR-14 idempotency happens here).
import { parsePaymentStatus } from '@/lib/domain/parsers';
import { pesewasToGhs } from '@/lib/paystack/client';
import * as paymentsRepository from '@/modules/payments/repository';
import * as paymentsService from '@/modules/payments/service';
import * as portalService from '@/modules/portal/service';
import {
  paystackWebhookSchema,
  type WebhookOutcome,
} from '@/modules/payments/types';
import type { PaymentMethod } from '@/lib/domain/types';

function channelToPaymentMethod(channel: string | undefined): PaymentMethod {
  if (channel === 'mobile_money') return 'MTN MoMo';
  return 'Paystack Card';
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

export async function processWebhookEvent(payload: unknown): Promise<WebhookOutcome> {
  const parsed = paystackWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    // Understood-but-unusable payloads are logged for review, never retried
    // into a failure loop (EC-02 posture).
    console.error('[paystack webhook] payload failed schema validation', parsed.error);
    return { status: 'unmatched_logged_for_review' };
  }

  const { event, data } = parsed.data;
  if (event !== 'charge.success') {
    return { status: 'ignored_event' };
  }

  // BR-14 fast path: transaction reference already recorded → idempotent skip.
  const existing = await paymentsRepository.selectPaymentByTransactionIdSystem(
    data.reference,
  );
  if (existing) {
    return { status: 'already_processed' };
  }

  // EC-02: a payment we cannot match to a Registration is logged for Admin
  // review and still acknowledged with 200 so Paystack does not retry.
  const registrationId = data.metadata?.registration_id;
  if (!registrationId) {
    console.error(
      `[paystack webhook] charge.success without metadata.registration_id, reference=${data.reference}`,
    );
    return { status: 'unmatched_logged_for_review' };
  }

  const payment =
    await paymentsRepository.selectPaymentByRegistrationIdSystem(registrationId);
  if (!payment) {
    console.error(
      `[paystack webhook] no payment record for registration_id=${registrationId}, reference=${data.reference}`,
    );
    return { status: 'unmatched_logged_for_review' };
  }

  // ⚠️ Paystack amounts arrive in pesewas — GHS 1,200.00 is 120000.
  const amountGhs = pesewasToGhs(data.amount);

  let updated;
  try {
    // A Paystack charge adds to any amount already recorded (e.g. a prior
    // manual part payment). payment_status is derived by trigger (BR-04).
    updated = await paymentsRepository.applyWebhookPaymentSystem(registrationId, {
      amount_paid: Number(payment.amount_paid) + amountGhs,
      payment_method: channelToPaymentMethod(data.channel),
      transaction_id: data.reference,
      payment_date: new Date().toISOString(),
    });
  } catch (err) {
    // BR-14 hard guarantee: two webhooks for the same reference racing past
    // the fast path — the unique(transaction_id) constraint rejects the
    // second, which is treated as already processed.
    if (isUniqueViolation(err)) {
      return { status: 'already_processed' };
    }
    throw err;
  }

  if (updated.payment_status === 'Paid') {
    await paymentsService.runPaidTransitionSideEffects(registrationId);
    // Auto-login (founder-approved 2026-07-22): this is the only Paid
    // transition with a live browser waiting on the other end (the
    // participant's own checkout), so mint a one-time token it can exchange
    // for a portal session. Non-blocking — a mint failure must never fail
    // webhook processing (Paystack would retry the whole event).
    try {
      await portalService.issuePortalLoginToken(registrationId);
    } catch (err) {
      console.error('[paystack webhook portal login token]', err);
    }
  }

  return { status: 'processed', paymentStatus: parsePaymentStatus(updated.payment_status) };
}
