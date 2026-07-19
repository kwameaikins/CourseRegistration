// Payment business rules (BR-04, BR-05, BR-06, BR-12).
import { parsePaymentMethod, parsePaymentStatus } from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import * as paymentsRepository from '@/modules/payments/repository';
import * as usersService from '@/modules/users/service';
import * as communicationsService from '@/modules/communications/service';
import * as attendanceService from '@/modules/attendance/service';
import type { Payment, PaymentUpdate } from '@/modules/payments/types';
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

// F1.04 manual payment update (Document 5, Section 6).
export async function updatePaymentByStaff(
  registrationId: string,
  update: PaymentUpdate,
): Promise<{
  registrationId: string;
  amountPaid: number;
  balance: number;
  paymentStatus: Payment['paymentStatus'];
  registrationStatus: 'Registered' | 'Confirmed' | 'Attended' | 'Cancelled';
  verifiedBy: string;
}> {
  const staffUser = await usersService.requireRole(['finance', 'admin']);

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
    verified_by: staffUser.id,
  });

  // E07: confirmation email only when the status transitioned to Paid in
  // this request (Document 5, Section 6, step 4). BR-07 makes a repeat call
  // harmless regardless.
  if (updated.payment_status === 'Paid' && statusBefore !== 'Paid') {
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

  // BR-06's trigger has already advanced the Registration by the time the
  // update returns; report Confirmed when the payment is now Paid.
  const payment = toPayment(updated);
  return {
    registrationId,
    amountPaid: payment.amountPaid,
    balance: payment.balance,
    paymentStatus: payment.paymentStatus,
    registrationStatus: payment.paymentStatus === 'Paid' ? 'Confirmed' : 'Registered',
    verifiedBy: `${staffUser.fullName} (${staffUser.role})`,
  };
}
