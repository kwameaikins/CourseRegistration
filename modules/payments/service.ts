// Payment business rules (BR-04, BR-05, BR-06, BR-12).
import { parsePaymentMethod, parsePaymentStatus } from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import * as paymentsRepository from '@/modules/payments/repository';
import * as usersService from '@/modules/users/service';
import * as communicationsService from '@/modules/communications/service';
import * as attendanceService from '@/modules/attendance/service';
import type { Payment, PaymentDiscountInput, PaymentUpdate } from '@/modules/payments/types';
import type { Database } from '@/lib/supabase/database.types';

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
