// Payment business rules (BR-04, BR-05, BR-06, BR-12).
import { parsePaymentMethod, parsePaymentStatus } from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import * as paymentsRepository from '@/modules/payments/repository';
import * as usersService from '@/modules/users/service';
import * as communicationsService from '@/modules/communications/service';
import * as attendanceService from '@/modules/attendance/service';
import * as opportunitiesService from '@/modules/opportunities/service';
import * as leadsService from '@/modules/leads/service';
import type {
  Installment,
  Payment,
  PaymentDiscountInput,
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
export async function runPaidTransitionSideEffects(registrationId: string): Promise<void> {
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
    await runPaidTransitionSideEffects(registrationId);
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
// fn_derive_payment_status / fn_sync_registration_status triggers with no
// trigger changes: if amount_paid already covers the new, lower course_fee
// the payment flips to Paid in the same write. Finance and admin can both
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
    // (only the Paystack webhook path mints one).
    await runPaidTransitionSideEffects(registrationId);
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
