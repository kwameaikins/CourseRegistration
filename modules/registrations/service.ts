// Registration aggregate business rules (BR-01, BR-02, BR-03, BR-15, BR-19).
import {
  parseGender,
  parseLeadSource,
  parsePaymentStatus,
  parseRegistrationStatus,
} from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import { effectiveCourseFee } from '@/lib/utils';
import * as registrationsRepository from '@/modules/registrations/repository';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
// The one permitted direct cross-module call: communications is the shared
// generic subdomain every module may use (Document 2, Section 9).
import * as communicationsService from '@/modules/communications/service';
import type {
  CreateRegistrationResult,
  RegistrationInput,
  RegistrationListFilters,
  RegistrationListRow,
} from '@/modules/registrations/types';
import type { StaffRole } from '@/lib/domain/types';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

// Deep endpoint orchestration (Document 5, Section 2): participant +
// registration + payment + the three initial emails in one operation.
export async function createRegistration(
  input: RegistrationInput,
): Promise<CreateRegistrationResult> {
  // BR-15: server-side consent enforcement, independent of the client.
  if (input.consentGiven !== true) {
    throw new AppError(
      'CONSENT_REQUIRED',
      'You must consent to the processing of your personal data to register.',
      400,
    );
  }

  // BR-01/BR-19: the Batch must exist, be Active, and not have started.
  const batch = await coursesService.getBatchByIdSystem(input.batchId);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (!batch || !batch.isActive || batch.startDate < todayIso) {
    throw new AppError(
      'INVALID_BATCH',
      'This course intake is not open for registration.',
      400,
    );
  }

  // full_name is derived here so every downstream consumer (email/WhatsApp
  // templates, staff screens) keeps reading a single display name.
  const fullName = [input.firstName, input.middleName, input.surname]
    .filter(Boolean)
    .join(' ');

  const participant = await registrationsRepository.findOrCreateParticipant({
    full_name: fullName,
    first_name: input.firstName,
    middle_name: input.middleName,
    surname: input.surname,
    gender: input.gender,
    email: input.email,
    phone: input.phone,
    job_title: input.jobTitle,
    company: input.company,
  });

  let registration;
  try {
    registration = await registrationsRepository.insertRegistration({
      participant_id: participant.id,
      batch_id: input.batchId,
      lead_source: input.leadSource,
      consent_given: true,
    });
  } catch (err) {
    // BR-03: unique(participant_id, batch_id) is the authoritative guarantee.
    if (isUniqueViolation(err)) {
      throw new AppError(
        'DUPLICATE_REGISTRATION',
        'You are already registered for this course intake. If you need help, please contact us.',
        409,
      );
    }
    throw err;
  }

  // BR-18: the fee is copied from the Batch at registration time — the
  // early-registration discount, if the cutoff hasn't passed yet, decides
  // the effective fee once and for all here (Document 5 addendum).
  const payment = await registrationsRepository.insertInitialPayment({
    registration_id: registration.id,
    course_fee: effectiveCourseFee(batch, todayIso),
  });

  // E01, E02, E03 — email failures never fail the registration itself
  // (Document 5, Section 2, step 7).
  for (const emailType of ['welcome', 'payment_instruction', 'reminder_1'] as const) {
    try {
      await communicationsService.sendEmailOnce(registration.id, emailType);
    } catch (err) {
      console.error(`[registration email ${emailType}]`, err);
    }
  }

  // WhatsApp welcome (doubles as payment instructions) — same non-blocking
  // posture as email: a messaging failure never fails the registration.
  try {
    await communicationsService.sendWhatsappOnce(registration.id, 'welcome');
  } catch (err) {
    console.error('[registration whatsapp welcome]', err);
  }

  return {
    registrationId: registration.id,
    registrationStatus: parseRegistrationStatus(registration.registration_status),
    paymentStatus: parsePaymentStatus(payment.payment_status),
    message: `Thank you, ${fullName}. Your registration for ${batch.cohortLabel} has been received. Please check your email for payment instructions.`,
  };
}

// F1.03 list with role-based field shaping (Document 5, Section 3). RLS
// filters rows; this function additionally strips payment audit fields for
// Marketing and all payment fields for Tutor.
export async function listRegistrations(filters: RegistrationListFilters): Promise<{
  registrations: RegistrationListRow[];
  pagination: { page: number; limit: number; total: number };
}> {
  const staffUser = await usersService.requireRole([
    'admin',
    'finance',
    'marketing',
    'tutor',
  ]);

  const { rows, total } = await registrationsRepository.selectRegistrationList(filters);

  let registrations = rows.map((row) => {
    const listRow: RegistrationListRow = {
      id: row.registration.id,
      fullName: row.participant?.full_name ?? '[unavailable]',
      email: row.participant?.email ?? '',
      phone: row.participant?.phone ?? '',
      jobTitle: row.participant?.job_title ?? null,
      company: row.participant?.company ?? null,
      gender: row.participant?.gender ? parseGender(row.participant.gender) : null,
      courseName: row.course?.course_name ?? '',
      courseCode: row.course?.course_code ?? '',
      cohortLabel: row.batch?.cohort_label ?? '',
      batchId: row.registration.batch_id,
      leadSource: parseLeadSource(row.registration.lead_source),
      registrationStatus: parseRegistrationStatus(row.registration.registration_status),
      paymentStatus: parsePaymentStatus(row.payment?.payment_status ?? 'Unpaid'),
      courseFee: Number(row.payment?.course_fee ?? 0),
      amountPaid: Number(row.payment?.amount_paid ?? 0),
      balance: Number(row.payment?.balance ?? 0),
      registeredAt: row.registration.registered_at,
      notes: row.registration.notes,
      paymentMethod: row.payment?.payment_method ?? null,
      paymentNotes: row.payment?.payment_notes ?? null,
      transactionId: row.payment?.transaction_id ?? null,
      verifiedBy: row.verifiedByName,
    };
    return shapeRowForRole(listRow, staffUser.role);
  });

  // Payment Status filter and search are applied after the join because they
  // live on joined tables (payments/participants).
  if (filters.paymentStatus) {
    registrations = registrations.filter(
      (row) => row.paymentStatus === filters.paymentStatus,
    );
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    registrations = registrations.filter(
      (row) =>
        row.fullName.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        row.phone.toLowerCase().includes(needle),
    );
  }

  return {
    registrations,
    pagination: { page: filters.page, limit: filters.limit, total },
  };
}

function shapeRowForRole(row: RegistrationListRow, role: StaffRole): RegistrationListRow {
  if (role === 'admin' || role === 'finance') return row;
  const shaped: RegistrationListRow = { ...row };
  // Marketing sees Payment Status but never the payment audit fields
  // (Document 3, Section 6 column-restriction flag; Document 5, Section 3).
  delete shaped.paymentNotes;
  delete shaped.transactionId;
  delete shaped.verifiedBy;
  if (role === 'tutor') {
    // Tutor: no payment fields at all (Document 5, Section 3).
    delete shaped.paymentMethod;
    shaped.courseFee = 0;
    shaped.amountPaid = 0;
    shaped.balance = 0;
  }
  return shaped;
}

export async function updateNotes(registrationId: string, notes: string | null): Promise<void> {
  await usersService.requireRole(['admin', 'marketing']);
  await registrationsRepository.updateRegistrationNotes(registrationId, notes);
}

// DPA-02 — soft delete (Step 1, immediate anonymisation, BR-16).
export async function softDeleteParticipant(participantId: string): Promise<{
  participantId: string;
  softDeletedAt: string;
}> {
  await usersService.requireRole(['admin']);
  await registrationsRepository.callSoftDeleteParticipant(participantId);
  return { participantId, softDeletedAt: new Date().toISOString() };
}

// DPA-02 — hard delete (Step 2, manual, ≥30 days after soft delete; the
// database function enforces the 30-day guard).
export async function hardDeleteParticipant(participantId: string): Promise<void> {
  const staffUser = await usersService.requireRole(['admin']);
  await registrationsRepository.callHardDeleteParticipant(participantId, staffUser.id);
}

export async function listParticipantsForDeletionScreen() {
  await usersService.requireRole(['admin']);
  return registrationsRepository.selectParticipantsForAdmin();
}
