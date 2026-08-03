// Payment business rules (BR-04, BR-05, BR-06, BR-12).
import crypto from 'crypto';
import { parsePaymentMethod, parsePaymentStatus } from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import * as paymentsRepository from '@/modules/payments/repository';
import * as usersService from '@/modules/users/service';
import * as communicationsService from '@/modules/communications/service';
import * as attendanceService from '@/modules/attendance/service';
import * as opportunitiesService from '@/modules/opportunities/service';
import * as leadsService from '@/modules/leads/service';
import * as r2Client from '@/lib/r2/client';
// Permitted cross-module call, same posture as leads/opportunities/
// attendance below — commission accrual only ever fires once a payment
// actually clears (Knowsia Growth Partner Programme, 2026-08-02).
import * as partnersService from '@/modules/partners/service';
import type {
  Installment,
  Payment,
  PaymentDiscountInput,
  PaymentSubmission,
  PaymentSubmissionInput,
  PaymentSubmissionView,
  PaymentUpdate,
} from '@/modules/payments/types';
import type { Database } from '@/lib/supabase/database.types';

const TWO_INSTALLMENT_DUE_LEAD_DAYS = 7;

function toPayment(row: Database['public']['Tables']['payments']['Row']): Payment {
  return {
    id: row.id,
    registrationId: row.registration_id,
    courseFee: Number(row.course_fee),
    amountPaid: Number(row.amount_paid),
    balance: Number(row.balance),
    paymentStatus: parsePaymentStatus(row.payment_status),
    paymentMethod: row.payment_method ? parsePaymentMethod(row.payment_method) : null,
    transactionId: row.transaction_id,
    paymentDate: row.payment_date,
    verifiedBy: row.verified_by,
    paymentNotes: row.payment_notes,
  };
}

function toInstallment(
  row: Database['public']['Tables']['payment_installments']['Row'],
): Installment {
  return {
    id: row.id,
    installmentNumber: row.installment_number,
    amountDue: Number(row.amount_due),
    amountPaid: Number(row.amount_paid),
    dueDate: row.due_date,
    paymentStatus: row.payment_status === 'Paid' ? 'Paid' : 'Pending',
    paidAt: row.paid_at,
  };
}

type PaymentUpdateResult = {
  registrationId: string;
  amountPaid: number;
  balance: number;
  paymentStatus: Payment['paymentStatus'];
  registrationStatus: 'Registered' | 'Confirmed' | 'Attended' | 'Cancelled';
  verifiedBy: string;
};

// Shared by every path where a payment transitions to Paid — staff manual
// entry, the Paystack webhook, and staff-granted discounts that close the
// balance. E07: confirmation email/WhatsApp/SMS + a personal Zoom join link
// (BR-07 makes a repeat call harmless regardless). Each side effect is
// independently non-blocking — one failing must never sink the others or
// the caller's write, which has already committed by the time this runs.
export async function runPaidTransitionSideEffects(
  registrationId: string,
  amountPaid?: number,
): Promise<void> {
  if (amountPaid !== undefined) {
    try {
      await partnersService.accrueCommissionOnPaymentSystem(registrationId, amountPaid);
    } catch (err) {
      console.error('[payment_confirmation partner commission accrual]', err);
    }
  }
  try {
    await communicationsService.sendEmailOnce(registrationId, 'payment_confirmation');
  } catch (err) {
    console.error('[payment_confirmation email]', err);
  }
  try {
    await communicationsService.sendWhatsappOnce(registrationId, 'payment_confirmation');
  } catch (err) {
    console.error('[payment_confirmation whatsapp]', err);
  }
  try {
    await communicationsService.sendSmsOnce(registrationId, 'payment_confirmation');
  } catch (err) {
    console.error('[payment_confirmation sms]', err);
  }
  await runSettledEnrollmentSideEffects(registrationId);
}

// A Registration that owes nothing from the moment it is created: a free
// event/webinar (batches.is_free), a 100% code discount, or a full staff fee
// waiver granted before any money arrived. It is Paid and Confirmed by the
// database triggers, but no payment ever "transitioned", so it needs the same
// enrollment side effects WITHOUT the two that only make sense against real
// money:
//   * payment_confirmation — would read "we received your payment of GHS 0.00"
//   * commission accrual    — nothing was collected to commission on, and
//     institutional partners earn a FLAT fee that ignores the amount paid
//     (see partners/service.ts computeCommissionAmount), so calling it here
//     would pay out real cash for a free signup.
export async function runZeroFeeEnrollmentSideEffects(registrationId: string): Promise<void> {
  await runSettledEnrollmentSideEffects(registrationId);
}

// The enrollment side effects that apply however the balance reached zero.
async function runSettledEnrollmentSideEffects(registrationId: string): Promise<void> {
  // WhatsApp group invitation (founder-flagged gap closed 2026-08-01) — fires
  // exactly once per registration alongside payment_confirmation, since this
  // function is the one funnel every Paid-transition path goes through.
  try {
    await communicationsService.sendEmailOnce(registrationId, 'whatsapp_invite');
  } catch (err) {
    console.error('[whatsapp_invite email]', err);
  }
  try {
    await communicationsService.sendWhatsappOnce(registrationId, 'whatsapp_invite');
  } catch (err) {
    console.error('[whatsapp_invite whatsapp]', err);
  }
  try {
    await communicationsService.sendSmsOnce(registrationId, 'whatsapp_invite');
  } catch (err) {
    console.error('[whatsapp_invite sms]', err);
  }
  // Zoom attendance Option 2: a confirmed seat gets a personal join link.
  try {
    await attendanceService.ensureZoomRegistration(registrationId);
  } catch (err) {
    console.error('[payment_confirmation zoom registration]', err);
  }
  // Sales pipeline: a Paid registration wins its opportunity (Revenue OS
  // Phase 1 roadmap). Same non-blocking posture as the side effects above.
  try {
    await opportunitiesService.markWonByRegistrationId(registrationId);
  } catch (err) {
    console.error('[payment_confirmation opportunity stage sync]', err);
  }
  // Lead lifecycle sync (2026-07-26): a lead never used to become
  // "Enrolled" automatically even after its registration was fully paid.
  // Same non-blocking posture as every other side effect here.
  try {
    await leadsService.markEnrolledByRegistrationId(registrationId);
  } catch (err) {
    console.error('[payment_confirmation lead status sync]', err);
  }
}

// Shared write+comms body for a manual payment update. Exported (unlike
// updatePaymentByStaff's role gate) so callers that have already authorized
// the write at a broader entry point — e.g. bulk import, which allows
// marketing/management to set amountPaid as part of adding a row — can apply
// a payment without re-requiring finance/admin here.
export async function applyPaymentUpdate(
  registrationId: string,
  update: PaymentUpdate,
  verifiedByStaff: { id: string; fullName: string; role: string },
): Promise<PaymentUpdateResult> {
  const existing = await paymentsRepository.selectPaymentByRegistrationId(registrationId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'No payment record exists for this registration.', 404);
  }
  const statusBefore = existing.payment_status;

  // BR-12: verified_by is ALWAYS the current session's staff id, set
  // server-side — any client-supplied value was already discarded upstream.
  const updated = await paymentsRepository.updatePaymentByRegistrationId(registrationId, {
    amount_paid: update.amountPaid,
    payment_method: update.paymentMethod,
    transaction_id: update.transactionId ?? existing.transaction_id,
    payment_date: update.paymentDate
      ? new Date(update.paymentDate).toISOString()
      : new Date().toISOString(),
    payment_notes: update.paymentNotes ?? existing.payment_notes,
    verified_by: verifiedByStaff.id,
  });

  if (updated.payment_status === 'Paid' && statusBefore !== 'Paid') {
    // Settling a zero-fee registration (a free event, or a fee already waived
    // to nothing) records no money, so it skips the receipt and commission.
    if (Number(updated.amount_paid) <= 0) {
      await runZeroFeeEnrollmentSideEffects(registrationId);
    } else {
      await runPaidTransitionSideEffects(registrationId, Number(updated.amount_paid));
    }
  }

  // Keep any payment-plan schedule in sync with the new total — never lets
  // a reconciliation hiccup fail the payment write itself, which has
  // already committed by this point.
  try {
    await reconcileInstallments(registrationId, Number(updated.amount_paid));
  } catch (err) {
    console.error('[payment update installment reconcile]', err);
  }

  // BR-06's trigger has already advanced the Registration by the time the
  // update returns; report Confirmed when the payment is now Paid.
  const payment = toPayment(updated);
  return {
    registrationId,
    amountPaid: payment.amountPaid,
    balance: payment.balance,
    paymentStatus: payment.paymentStatus,
    registrationStatus: payment.paymentStatus === 'Paid' ? 'Confirmed' : 'Registered',
    verifiedBy: `${verifiedByStaff.fullName} (${verifiedByStaff.role})`,
  };
}

// Simple fixed-split payment plan (founder-approved 2026-07-24) — a
// participant on the portal commits to 50% now, 50% by a set date, instead
// of paying in full. Deliberately only offered while still Unpaid (no
// existing partial payment or discount to reconcile against) and only when
// the course starts far enough out that a second installment date means
// something. Called from modules/portal/service.ts, which has already
// verified the registration belongs to the requesting participant and
// resolved courseFee/batchStartDate from its own dashboard read.
export async function setUpTwoInstallmentPlan(
  registrationId: string,
  context: { courseFee: number; batchStartDate: string },
): Promise<void> {
  const payment = await paymentsRepository.selectPaymentByRegistrationIdSystem(registrationId);
  if (!payment) {
    throw new AppError('NOT_FOUND', 'No payment record exists for this registration.', 404);
  }
  if (payment.payment_status !== 'Unpaid') {
    throw new AppError(
      'VALIDATION_ERROR',
      'A payment plan can only be set up before any payment has been made.',
      400,
    );
  }

  const existingCount = await paymentsRepository.selectInstallmentCountForRegistration(
    registrationId,
  );
  if (existingCount > 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A payment plan has already been set up for this registration.',
      400,
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const secondDueDate = new Date(
    new Date(context.batchStartDate).getTime() -
      TWO_INSTALLMENT_DUE_LEAD_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  if (secondDueDate <= todayIso) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This course starts too soon to offer a payment plan — please pay in full.',
      400,
    );
  }

  const firstAmount = Math.round((context.courseFee / 2) * 100) / 100;
  const secondAmount = Math.round((context.courseFee - firstAmount) * 100) / 100;

  await paymentsRepository.insertInstallments([
    {
      payment_id: payment.id,
      registration_id: registrationId,
      installment_number: 1,
      amount_due: firstAmount,
      due_date: todayIso,
    },
    {
      payment_id: payment.id,
      registration_id: registrationId,
      installment_number: 2,
      amount_due: secondAmount,
      due_date: secondDueDate,
    },
  ]);
}

// Staff-facing variant of the same plan (Admin Assistant write action,
// reached only via the propose-then-confirm flow in
// modules/agent-tools/service.ts) — same eligibility rules and row shape
// as the portal's self-service version above, just gated by staff role
// instead of "the requesting participant owns this registration."
export async function setUpInstallmentPlanForRegistration(
  registrationId: string,
  context: { courseFee: number; batchStartDate: string },
): Promise<void> {
  await usersService.requireRole(['admin', 'finance']);
  await setUpTwoInstallmentPlan(registrationId, context);
}

// Redistributes the Payment's current amount_paid across installments in
// order (installment 1 fills before installment 2) — the parent payments
// row stays the sole source of truth for BR-04/BR-05/BR-06 either way; this
// only updates the schedule/progress view layered on top. A no-op when no
// plan exists. Not called from applyDiscount: a discount changes course_fee
// after installment amounts were already fixed, and reconciling that
// combination is deliberately out of scope for this pass (rare in
// practice — the aggregate payments row remains correct regardless).
export async function reconcileInstallments(
  registrationId: string,
  totalAmountPaid: number,
): Promise<void> {
  const installments = await paymentsRepository.selectInstallmentsForRegistration(registrationId);
  if (installments.length === 0) return;

  let remaining = totalAmountPaid;
  for (const installment of installments) {
    const amountDue = Number(installment.amount_due);
    const allocation = Math.max(Math.min(remaining, amountDue), 0);
    if (allocation !== Number(installment.amount_paid)) {
      await paymentsRepository.updateInstallmentAmountPaid(installment.id, allocation);
    }
    remaining -= allocation;
  }
}

// Discount rebalancing (fixes the known limitation flagged in PLAN.md) —
// installment amounts are fixed when the plan is set up, but a staff
// discount granted afterward changes the aggregate course_fee. Re-splits
// the new total 50/50 across the (always exactly two) installments, never
// shrinking either one below what has already been paid on it — money
// already received can't retroactively become "not yet due." If the
// discount is large enough that what's already been paid exceeds the new
// total, both installments simply settle at their already-paid amount
// (the discount fully covers what's left); the aggregate payments row's
// balance is the authoritative figure regardless.
export async function rebalanceInstallmentsForDiscount(
  registrationId: string,
  newCourseFee: number,
): Promise<void> {
  const installments = await paymentsRepository.selectInstallmentsForRegistration(registrationId);
  if (installments.length === 0) return; // no payment plan — nothing to rebalance

  const first = installments.find((installment) => installment.installment_number === 1);
  const second = installments.find((installment) => installment.installment_number === 2);
  if (!first) return;

  const firstPaid = Number(first.amount_paid);
  const secondPaid = second ? Number(second.amount_paid) : 0;
  const newTotal = Math.max(newCourseFee, firstPaid + secondPaid);

  const newFirstDue = Math.max(firstPaid, Math.round((newTotal / 2) * 100) / 100);
  if (newFirstDue !== Number(first.amount_due)) {
    await paymentsRepository.updateInstallmentAmountDue(first.id, newFirstDue);
  }

  if (second) {
    const newSecondDue = Math.max(secondPaid, Math.round((newTotal - newFirstDue) * 100) / 100);
    if (newSecondDue !== Number(second.amount_due)) {
      await paymentsRepository.updateInstallmentAmountDue(second.id, newSecondDue);
    }
  }
}

export async function getInstallmentsForRegistration(
  registrationId: string,
): Promise<Installment[]> {
  const rows = await paymentsRepository.selectInstallmentsForRegistration(registrationId);
  return rows.map(toInstallment);
}

// Reminder candidates for the daily cron (modules/communications/
// reminder-scheduler.ts) — see selectDueSecondInstallments's doc comment
// for why only the second installment is considered.
export async function getDueInstallmentReminderCandidates(
  withinDays = 3,
): Promise<Array<{ registrationId: string; amountDue: number; dueDate: string }>> {
  const rows = await paymentsRepository.selectDueSecondInstallments(withinDays);
  return rows.map((row) => ({
    registrationId: row.registration_id,
    amountDue: Number(row.amount_due),
    dueDate: row.due_date,
  }));
}

// F1.04 manual payment update (Document 5, Section 6).
export async function updatePaymentByStaff(
  registrationId: string,
  update: PaymentUpdate,
): Promise<PaymentUpdateResult> {
  const staffUser = await usersService.requireRole(['finance', 'admin']);
  return applyPaymentUpdate(registrationId, update, {
    id: staffUser.id,
    fullName: staffUser.fullName,
    role: staffUser.role,
  });
}

// Staff-granted discretionary discount / full fee waiver (founder-approved
// 2026-07-22). Reduces course_fee directly so it flows through the existing
// fn_derive_payment_status / fn_sync_registration_status triggers: if
// amount_paid covers the new, lower course_fee the payment flips to Paid in
// the same write — including the amount_paid = 0 case, which only became true
// with 202608030048_free_events.sql. Finance and admin can both
// grant a partial discount (free-form amount, mandatory reason — no system
// cap); only admin may grant a discount that brings the remaining balance to
// zero (a full fee waiver), regardless of how much has already been paid.
export async function applyDiscount(
  registrationId: string,
  input: PaymentDiscountInput,
): Promise<PaymentUpdateResult & { originalFee: number; discountAmount: number }> {
  const staffUser = await usersService.requireRole(['finance', 'admin']);
  const existing = await paymentsRepository.selectPaymentByRegistrationId(registrationId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'No payment record exists for this registration.', 404);
  }

  // Lazily snapshot original_fee exactly once, on the first discount ever
  // granted for this row — immutable thereafter.
  const originalFee =
    existing.original_fee !== null ? Number(existing.original_fee) : Number(existing.course_fee);
  const newDiscountAmount = Number(existing.discount_amount) + input.discountAmount;
  if (newDiscountAmount > originalFee) {
    throw new AppError('VALIDATION_ERROR', 'Discount cannot exceed the original course fee.', 400);
  }
  const newCourseFee = originalFee - newDiscountAmount;

  const wouldZeroBalance = newCourseFee - Number(existing.amount_paid) <= 0;
  if (wouldZeroBalance && staffUser.role !== 'admin') {
    throw new AppError(
      'FORBIDDEN',
      'Only an admin can grant a discount that fully waives the remaining balance.',
      403,
    );
  }

  const statusBefore = existing.payment_status;
  const updated = await paymentsRepository.updatePaymentDiscount(registrationId, {
    course_fee: newCourseFee,
    original_fee: originalFee,
    discount_amount: newDiscountAmount,
    discount_reason: input.reason,
    discount_granted_by: staffUser.id,
    discount_granted_at: new Date().toISOString(),
  });

  if (updated.payment_status === 'Paid' && statusBefore !== 'Paid') {
    // Staff-initiated — no browser waiting, so no portal login token here
    // (only the Paystack webhook path mints one). A waiver granted before any
    // money arrived settles the balance without a payment ever existing, so it
    // takes the zero-fee path: no "we received your payment of GHS 0.00"
    // receipt and no commission on nothing collected. Before 202608030048 this
    // branch was unreachable in that case — fn_derive_payment_status left the
    // row 'Unpaid', so a fully-waived registrant silently got no confirmation
    // and no Zoom join link at all.
    if (Number(updated.amount_paid) <= 0) {
      await runZeroFeeEnrollmentSideEffects(registrationId);
    } else {
      await runPaidTransitionSideEffects(registrationId, Number(updated.amount_paid));
    }
  }

  // Keep any payment-plan schedule in sync with the new, discounted fee —
  // non-blocking, same posture as every other side effect here (the
  // discount write has already committed by this point).
  try {
    await rebalanceInstallmentsForDiscount(registrationId, newCourseFee);
  } catch (err) {
    console.error('[discount installment rebalance]', err);
  }

  const payment = toPayment(updated);
  return {
    registrationId,
    amountPaid: payment.amountPaid,
    balance: payment.balance,
    paymentStatus: payment.paymentStatus,
    registrationStatus: payment.paymentStatus === 'Paid' ? 'Confirmed' : 'Registered',
    verifiedBy: `${staffUser.fullName} (${staffUser.role})`,
    originalFee,
    discountAmount: newDiscountAmount,
  };
}

// Commission-as-course-credit redemption (founder-approved 2026-08-02) — a
// partner spends their own 'payable' commission balance to reduce a course
// fee (their own, or a referred student's) instead of a cash payout. This
// function owns the fee mutation (same course_fee/original_fee/
// discount_amount math as applyDiscount above, just system-originated
// rather than staff-originated — discount_granted_by is null); the
// partners-side validation (ownership, status=payable) and bookkeeping
// (marking the spent commissions 'redeemed') live in modules/partners,
// which this function calls into — the same accrual/payout split already
// established between these two modules. No cap on how much of the fee
// credit can cover, but never more than what's actually still owed.
export async function redeemCommissionCreditSystem(
  partnerId: string,
  commissionIds: string[],
  target: { registrationId?: string | null; participantEmail?: string | null },
): Promise<PaymentUpdateResult> {
  const totalCredit = await partnersService.validateAndTotalRedeemableCommissionsSystem(
    partnerId,
    commissionIds,
  );

  let targetRegistrationId = target.registrationId ?? null;
  if (!targetRegistrationId && target.participantEmail) {
    targetRegistrationId = await paymentsRepository.selectMostRecentOpenRegistrationIdByEmailSystem(
      target.participantEmail,
    );
    if (!targetRegistrationId) {
      throw new AppError(
        'NOT_FOUND',
        'No registration with an outstanding balance was found for that email.',
        404,
      );
    }
  }
  if (!targetRegistrationId) {
    throw new AppError('VALIDATION_ERROR', 'A target registration or email is required.', 400);
  }

  const existing = await paymentsRepository.selectPaymentByRegistrationIdSystem(targetRegistrationId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'No payment record exists for this registration.', 404);
  }
  const originalFee =
    existing.original_fee !== null ? Number(existing.original_fee) : Number(existing.course_fee);
  const balance = Number(existing.course_fee) - Number(existing.amount_paid);
  if (totalCredit > balance) {
    throw new AppError(
      'VALIDATION_ERROR',
      `This registration's outstanding balance is only ${balance} — select less commission to redeem.`,
      400,
    );
  }

  const newDiscountAmount = Number(existing.discount_amount) + totalCredit;
  const newCourseFee = originalFee - newDiscountAmount;
  const statusBefore = existing.payment_status;

  const updated = await paymentsRepository.updatePaymentDiscountSystem(targetRegistrationId, {
    course_fee: newCourseFee,
    original_fee: originalFee,
    discount_amount: newDiscountAmount,
    discount_reason: 'Partner commission credit redemption',
    discount_granted_by: null,
    discount_granted_at: new Date().toISOString(),
  });

  if (updated.payment_status === 'Paid' && statusBefore !== 'Paid') {
    // Credit that closes the balance without any cash having been received
    // takes the zero-fee path — accruing commission on a redemption that
    // collected nothing would pay the partner twice for the same referral.
    if (Number(updated.amount_paid) <= 0) {
      await runZeroFeeEnrollmentSideEffects(targetRegistrationId);
    } else {
      await runPaidTransitionSideEffects(targetRegistrationId, Number(updated.amount_paid));
    }
  }

  try {
    await rebalanceInstallmentsForDiscount(targetRegistrationId, newCourseFee);
  } catch (err) {
    console.error('[credit redemption installment rebalance]', err);
  }

  // Only mark the commissions spent once the credit has actually landed —
  // if this throws, the redemption itself already succeeded and the
  // failure needs to surface loudly (money's involved) rather than being
  // silently swallowed.
  await partnersService.markCommissionsRedeemedSystem(commissionIds, targetRegistrationId);

  const payment = toPayment(updated);
  return {
    registrationId: targetRegistrationId,
    amountPaid: payment.amountPaid,
    balance: payment.balance,
    paymentStatus: payment.paymentStatus,
    registrationStatus: payment.paymentStatus === 'Paid' ? 'Confirmed' : 'Registered',
    verifiedBy: 'Partner commission credit redemption',
  };
}

// --- Payment submissions (founder-requested 2026-08-01) ---
// A registrant's claimed MoMo/bank-transfer payment, always starting
// 'pending'. Only a finance/admin review (reviewPaymentSubmission below) can
// ever apply it to `payments` — always via the existing applyPaymentUpdate,
// so BR-04/05/06/12 all keep working exactly as they do for every other
// payment-writing path.

function toPaymentSubmission(
  row: Database['public']['Tables']['payment_submissions']['Row'],
): PaymentSubmission {
  return {
    id: row.id,
    registrationId: row.registration_id,
    method: row.method as PaymentSubmission['method'],
    amount: Number(row.amount),
    transactionReference: row.transaction_reference,
    paymentDate: row.payment_date,
    hasSlip: row.slip_file_path !== null,
    participantNotes: row.participant_notes,
    status: row.status as PaymentSubmission['status'],
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
  };
}

// Called only by modules/portal, after it has verified the registration
// belongs to the calling participant's own session — this function itself
// has no role/session gate, same posture as attendance's
// raiseAttendanceException.
export async function submitPaymentProofSystem(
  input: PaymentSubmissionInput,
  slip?: { buffer: Buffer; contentType: string; extension: string },
): Promise<PaymentSubmission> {
  const existingPending = await paymentsRepository.selectPendingPaymentSubmissionForRegistration(
    input.registrationId,
  );
  if (existingPending) {
    throw new AppError('CONFLICT', 'Your last submission is still under review.', 409);
  }

  let slipFilePath: string | null = null;
  if (slip) {
    if (!r2Client.isR2Configured()) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Slip uploads are not available right now — please submit without one, or contact us.',
        400,
      );
    }
    slipFilePath = `${input.registrationId}/${crypto.randomUUID()}.${slip.extension}`;
    await r2Client.uploadObject({
      key: slipFilePath,
      body: slip.buffer,
      contentType: slip.contentType,
    });
  }

  const row = await paymentsRepository.insertPaymentSubmissionSystem({
    registration_id: input.registrationId,
    method: input.method,
    amount: input.amount,
    transaction_reference: input.transactionReference ?? null,
    payment_date: input.paymentDate,
    slip_file_path: slipFilePath,
    participant_notes: input.participantNotes ?? null,
  });
  return toPaymentSubmission(row);
}

// Portal's own submission history for one registration — called only by
// modules/portal after the same ownership check as the submit path above.
export async function listMyPaymentSubmissionsSystem(
  registrationId: string,
): Promise<PaymentSubmission[]> {
  const rows = await paymentsRepository.selectPaymentSubmissionsForRegistrationSystem(registrationId);
  return rows.map(toPaymentSubmission);
}

export async function listPaymentSubmissions(filters?: {
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<PaymentSubmissionView[]> {
  await usersService.requireRole(['finance', 'admin']);
  const rows = await paymentsRepository.selectPaymentSubmissions(filters);
  const context = await paymentsRepository.selectPaymentSubmissionContext(
    rows.map((row) => row.registration_id),
  );
  return rows.map((row) => {
    const info = context.get(row.registration_id);
    return {
      ...toPaymentSubmission(row),
      participantName: info?.participantName ?? '',
      courseName: info?.courseName ?? '',
      cohortLabel: info?.cohortLabel ?? '',
    };
  });
}

export async function getPaymentSubmissionSlipUrl(submissionId: string): Promise<string> {
  await usersService.requireRole(['finance', 'admin']);
  const submission = await paymentsRepository.selectPaymentSubmissionById(submissionId);
  if (!submission?.slip_file_path) {
    throw new AppError('NOT_FOUND', 'No slip on file for this submission.', 404);
  }
  return r2Client.getSignedDownloadUrl(submission.slip_file_path);
}

export async function reviewPaymentSubmission(
  submissionId: string,
  decision: 'approved' | 'rejected',
  overrides?: { amountPaid?: number; transactionId?: string; paymentDate?: string },
  reviewNote?: string,
): Promise<void> {
  const staffUser = await usersService.requireRole(['finance', 'admin']);
  const submission = await paymentsRepository.selectPaymentSubmissionById(submissionId);
  if (!submission) {
    throw new AppError('NOT_FOUND', 'Submission not found.', 404);
  }
  if (submission.status !== 'pending') {
    throw new AppError('CONFLICT', 'This submission has already been reviewed.', 409);
  }

  if (decision === 'approved') {
    // applyPaymentUpdate SETS amount_paid (it doesn't add) — the value
    // passed must be the registration's new TOTAL, not just this
    // submission's claimed amount, or an existing partial payment would be
    // clobbered instead of added to.
    const existing = await paymentsRepository.selectPaymentByRegistrationId(
      submission.registration_id,
    );
    if (!existing) {
      throw new AppError('NOT_FOUND', 'No payment record exists for this registration.', 404);
    }
    const claimedAmount = overrides?.amountPaid ?? Number(submission.amount);
    const newTotal = Number(existing.amount_paid) + claimedAmount;
    await applyPaymentUpdate(
      submission.registration_id,
      {
        amountPaid: newTotal,
        paymentMethod: submission.method as PaymentUpdate['paymentMethod'],
        transactionId: overrides?.transactionId ?? submission.transaction_reference,
        paymentDate: overrides?.paymentDate ?? submission.payment_date,
        paymentNotes: submission.participant_notes,
      },
      { id: staffUser.id, fullName: staffUser.fullName, role: staffUser.role },
    );
  }

  await paymentsRepository.updatePaymentSubmission(submissionId, {
    status: decision,
    reviewed_by: staffUser.id,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote ?? null,
  });
}
