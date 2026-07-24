// Registration aggregate business rules (BR-01, BR-02, BR-03, BR-15, BR-19).
import {
  parseGender,
  parseLeadSource,
  parsePaymentStatus,
  parseRegistrationStatus,
} from '@/lib/domain/parsers';
import { AppError } from '@/lib/errors';
import { stringifyCsv } from '@/lib/csv';
import { sendTransactionalEmail } from '@/lib/resend/client';
import { effectiveCourseFee } from '@/lib/utils';
import * as registrationsRepository from '@/modules/registrations/repository';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
// The one permitted direct cross-module call: communications is the shared
// generic subdomain every module may use (Document 2, Section 9).
import * as communicationsService from '@/modules/communications/service';
// Bulk import applies payments as part of adding a row — see
// bulkImportRegistrations for why it calls the un-gated helper directly
// instead of the finance/admin-only updatePaymentByStaff.
import * as paymentsService from '@/modules/payments/service';
// Permitted cross-module call, same posture as communications: every new/
// returning registrant gets student-portal access (system review, 2026-07-22).
import { ensureParticipantAuth } from '@/modules/portal/service';
// Permitted cross-module call, same posture as above — batch transfer needs
// to re-register a Paid participant against the destination Batch's Zoom
// meeting (system review, 2026-07-24).
import * as attendanceService from '@/modules/attendance/service';
import type {
  BulkImportRequest,
  BulkImportResult,
  BulkImportRowResult,
  CreateRegistrationResult,
  Registration360,
  RegistrationInput,
  RegistrationListFilters,
  RegistrationListRow,
  TransferRegistrationInput,
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

  // Student portal access — never blocks registration on failure.
  try {
    await ensureParticipantAuth(participant.id, input.phone);
  } catch (err) {
    console.error('[registration portal auth provision]', err);
  }

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

  // SMS welcome — same non-blocking posture.
  try {
    await communicationsService.sendSmsOnce(registration.id, 'welcome');
  } catch (err) {
    console.error('[registration sms welcome]', err);
  }

  // The confirmation names the Course, not the Batch (Document 1, F1.01
  // step 5; Document 5 example). Cohort label is only the fallback.
  const course = await coursesService.getCourseByIdSystem(batch.courseId);

  return {
    registrationId: registration.id,
    registrationStatus: parseRegistrationStatus(registration.registration_status),
    paymentStatus: parsePaymentStatus(payment.payment_status),
    message: `Thank you, ${fullName}. Your registration for ${course?.courseName ?? batch.cohortLabel} has been received. Please check your email for payment instructions.`,
  };
}

// Bulk import — staff backfill of registrations collected outside the
// system (e.g. a Google Form), some already paid, some not. Deliberately
// skips BR-01/BR-19's "batch must be Active and not yet started" gate:
// these are historical entries for a cohort that may already be running or
// closed. Unlike createRegistration, failures are per-row (duplicates,
// bad data) rather than aborting the whole run.
export async function bulkImportRegistrations(
  input: BulkImportRequest,
): Promise<BulkImportResult> {
  const staffUser = await usersService.requireRole([
    'admin',
    'finance',
    'marketing',
    'management',
  ]);

  const batch = await coursesService.getBatchByIdSystem(input.batchId);
  if (!batch) {
    throw new AppError('INVALID_BATCH', 'That course intake does not exist.', 400);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultCourseFee = effectiveCourseFee(batch, todayIso);
  const notesSuffix = input.notesSuffix?.trim() || `Imported from Google Form — ${todayIso}`;

  const results: BulkImportRowResult[] = [];
  const summary = { created: 0, duplicates: 0, errors: 0, paid: 0, unpaid: 0 };

  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index];
    try {
      const fullName = [row.firstName, row.middleName, row.surname]
        .filter(Boolean)
        .join(' ');

      const participant = await registrationsRepository.findOrCreateParticipant({
        full_name: fullName,
        first_name: row.firstName,
        middle_name: row.middleName,
        surname: row.surname,
        gender: row.gender,
        email: row.email,
        phone: row.phone,
        job_title: row.jobTitle,
        company: row.company,
      });

      try {
        await ensureParticipantAuth(participant.id, row.phone);
      } catch (err) {
        console.error('[bulk import portal auth provision]', err);
      }

      let registration;
      try {
        registration = await registrationsRepository.insertRegistration({
          participant_id: participant.id,
          batch_id: input.batchId,
          lead_source: input.leadSource,
          consent_given: true,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          results.push({ index, email: row.email, status: 'duplicate', message: 'Already registered for this course intake.' });
          summary.duplicates++;
          continue;
        }
        throw err;
      }

      await registrationsRepository.insertInitialPayment({
        registration_id: registration.id,
        course_fee: row.courseFee ?? defaultCourseFee,
      });

      await registrationsRepository.updateRegistrationNotes(registration.id, notesSuffix);

      // Same non-blocking comms posture as createRegistration — a
      // messaging failure never fails the import row itself.
      for (const emailType of ['welcome', 'payment_instruction', 'reminder_1'] as const) {
        try {
          await communicationsService.sendEmailOnce(registration.id, emailType);
        } catch (err) {
          console.error(`[bulk import email ${emailType}]`, err);
        }
      }
      try {
        await communicationsService.sendWhatsappOnce(registration.id, 'welcome');
      } catch (err) {
        console.error('[bulk import whatsapp welcome]', err);
      }
      try {
        await communicationsService.sendSmsOnce(registration.id, 'welcome');
      } catch (err) {
        console.error('[bulk import sms welcome]', err);
      }

      let paymentStatus: RegistrationListRow['paymentStatus'] = 'Unpaid';
      if (row.amountPaid > 0) {
        const paymentResult = await paymentsService.applyPaymentUpdate(
          registration.id,
          {
            amountPaid: row.amountPaid,
            paymentMethod: input.paymentMethod,
            transactionId: null,
            paymentDate: null,
            paymentNotes: 'Bulk import',
          },
          { id: staffUser.id, fullName: staffUser.fullName, role: staffUser.role },
        );
        paymentStatus = paymentResult.paymentStatus;
      }

      results.push({ index, email: row.email, status: 'created', paymentStatus });
      summary.created++;
      if (paymentStatus === 'Unpaid') summary.unpaid++;
      else summary.paid++;
    } catch (err) {
      console.error('[bulk import row]', err);
      results.push({
        index,
        email: row.email,
        status: 'error',
        message: err instanceof AppError ? err.message : 'Unexpected error creating this row.',
      });
      summary.errors++;
    }
  }

  return { results, summary };
}

// Shared row shaping between listRegistrations and exportRegistrationsCsv —
// same join-row shape in, same role-shaped RegistrationListRow out.
function toRegistrationListRow(
  row: Awaited<
    ReturnType<typeof registrationsRepository.selectRegistrationList>
  >['rows'][number],
): RegistrationListRow {
  return {
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
    originalFee:
      row.payment?.original_fee !== null && row.payment?.original_fee !== undefined
        ? Number(row.payment.original_fee)
        : null,
    amountPaid: Number(row.payment?.amount_paid ?? 0),
    balance: Number(row.payment?.balance ?? 0),
    registeredAt: row.registration.registered_at,
    notes: row.registration.notes,
    paymentMethod: row.payment?.payment_method ?? null,
    paymentNotes: row.payment?.payment_notes ?? null,
    transactionId: row.payment?.transaction_id ?? null,
    verifiedBy: row.verifiedByName,
  };
}

// Payment Status filter and search apply after the join because they live
// on joined tables (payments/participants) — shared by both the paginated
// list and the (unpaginated) CSV export.
function applyPostJoinFilters(
  rows: RegistrationListRow[],
  filters: Pick<RegistrationListFilters, 'paymentStatus' | 'search'>,
): RegistrationListRow[] {
  let result = rows;
  if (filters.paymentStatus) {
    result = result.filter((row) => row.paymentStatus === filters.paymentStatus);
  }
  if (filters.search) {
    const needle = filters.search.toLowerCase();
    result = result.filter(
      (row) =>
        row.fullName.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        row.phone.toLowerCase().includes(needle),
    );
  }
  return result;
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
  const registrations = applyPostJoinFilters(
    rows.map((row) => shapeRowForRole(toRegistrationListRow(row), staffUser.role)),
    filters,
  );

  return {
    registrations,
    pagination: { page: filters.page, limit: filters.limit, total },
  };
}

// CSV export (system review, 2026-07-24) — same role gate, same row
// shaping/filtering as listRegistrations, but reads every matching row via
// selectAllRegistrationsForExport instead of one page (see that function's
// doc comment for why this makes the paymentStatus/search filtering
// correct here in a way the paginated list's isn't).
const EXPORT_COLUMNS: Array<{ key: keyof RegistrationListRow; header: string }> = [
  { key: 'fullName', header: 'Full Name' },
  { key: 'email', header: 'Email' },
  { key: 'phone', header: 'Phone' },
  { key: 'gender', header: 'Gender' },
  { key: 'jobTitle', header: 'Job Title' },
  { key: 'company', header: 'Company' },
  { key: 'courseName', header: 'Course' },
  { key: 'courseCode', header: 'Course Code' },
  { key: 'cohortLabel', header: 'Cohort' },
  { key: 'leadSource', header: 'Lead Source' },
  { key: 'registrationStatus', header: 'Registration Status' },
  { key: 'paymentStatus', header: 'Payment Status' },
  { key: 'courseFee', header: 'Course Fee' },
  { key: 'amountPaid', header: 'Amount Paid' },
  { key: 'balance', header: 'Balance' },
  { key: 'paymentMethod', header: 'Payment Method' },
  { key: 'transactionId', header: 'Transaction ID' },
  { key: 'verifiedBy', header: 'Verified By' },
  { key: 'registeredAt', header: 'Registered At' },
  { key: 'notes', header: 'Notes' },
];

export async function exportRegistrationsCsv(
  filters: Omit<RegistrationListFilters, 'page' | 'limit'>,
): Promise<string> {
  const staffUser = await usersService.requireRole(['admin', 'finance', 'marketing', 'tutor']);

  const { rows } = await registrationsRepository.selectAllRegistrationsForExport(filters);
  const registrations = applyPostJoinFilters(
    rows.map((row) => shapeRowForRole(toRegistrationListRow(row), staffUser.role)),
    filters,
  );

  // Columns the viewer's role can't see are simply absent from the row
  // object (shapeRowForRole deletes them) — skip those headers entirely
  // rather than emitting an always-empty column.
  const visibleColumns = EXPORT_COLUMNS.filter(
    (column) => registrations.length === 0 || column.key in registrations[0],
  );
  const header = visibleColumns.map((column) => column.header);
  const dataRows = registrations.map((row) =>
    visibleColumns.map((column) => {
      const value = row[column.key];
      return value === null || value === undefined ? '' : String(value);
    }),
  );

  return stringifyCsv([header, ...dataRows]);
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
    shaped.originalFee = null;
    shaped.amountPaid = 0;
    shaped.balance = 0;
  }
  return shaped;
}

// Registration 360° view (system review, approved 2026-07-20): one detail
// read pulling together everything every module knows about a Registration.
// Same allowed roles as the list (a role that can see the row can open it).
export async function getRegistration360(registrationId: string): Promise<Registration360> {
  const staffUser = await usersService.requireRole(['admin', 'finance', 'marketing', 'tutor']);

  const data = await registrationsRepository.selectRegistration360(registrationId);
  if (!data) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }

  const view: Registration360 = {
    // Admin-only, immediate hard delete (founder-approved 2026-07-22) —
    // computed here so the client can show/hide the action without
    // guessing the viewer's role; the service layer is still authoritative
    // (deleteRegistration re-checks the role itself).
    canDelete: staffUser.role === 'admin',
    registration: {
      id: data.registration.id,
      registrationStatus: parseRegistrationStatus(data.registration.registration_status),
      leadSource: parseLeadSource(data.registration.lead_source),
      notes: data.registration.notes,
      registeredAt: data.registration.registered_at,
    },
    participant: data.participant
      ? {
          fullName: data.participant.full_name,
          email: data.participant.email,
          phone: data.participant.phone,
          jobTitle: data.participant.job_title,
          company: data.participant.company,
          gender: data.participant.gender ? parseGender(data.participant.gender) : null,
          deleted: data.participant.deleted_at !== null,
        }
      : null,
    course: data.batch
      ? {
          courseId: data.batch.course_id,
          batchId: data.batch.id,
          courseName: data.course?.course_name ?? '',
          courseCode: data.course?.course_code ?? '',
          cohortLabel: data.batch.cohort_label,
          startDate: data.batch.start_date,
          endDate: data.batch.end_date,
          facilitatorName: data.batch.facilitator_name,
        }
      : null,
    payment: data.payment
      ? {
          paymentStatus: parsePaymentStatus(data.payment.payment_status),
          courseFee: Number(data.payment.course_fee),
          amountPaid: Number(data.payment.amount_paid),
          balance: Number(data.payment.balance),
          paymentMethod: data.payment.payment_method,
          transactionId: data.payment.transaction_id,
          paymentNotes: data.payment.payment_notes,
          verifiedBy: data.verifiedByName,
          paymentDate: data.payment.payment_date,
          originalFee: data.payment.original_fee !== null ? Number(data.payment.original_fee) : null,
          discountAmount: Number(data.payment.discount_amount),
          discountReason: data.payment.discount_reason,
          discountGrantedByName: data.discountGrantedByName,
          discountGrantedAt: data.payment.discount_granted_at,
        }
      : null,
  };

  return shapeRegistration360ForRole(view, data, staffUser.role);
}

// Mirrors each joined table's own RLS scope (Document 3), made explicit here
// because the repository read runs on the service-role client and several
// tables are scoped narrower than the union of roles that use this screen:
// email_log/whatsapp_log/sms_log/zoom_registrants are admin-only,
// attendance/feedback are admin+management, certificates read is
// admin+management, call_log is admin+finance+management.
function shapeRegistration360ForRole(
  view: Registration360,
  data: NonNullable<
    Awaited<ReturnType<typeof registrationsRepository.selectRegistration360>>
  >,
  role: StaffRole,
): Registration360 {
  // Payment audit fields: same rule as the list (Document 5, Section 3).
  if (view.payment && role !== 'admin' && role !== 'finance') {
    delete view.payment.paymentMethod;
    delete view.payment.transactionId;
    delete view.payment.paymentNotes;
    delete view.payment.verifiedBy;
    delete view.payment.paymentDate;
    delete view.payment.originalFee;
    delete view.payment.discountAmount;
    delete view.payment.discountReason;
    delete view.payment.discountGrantedByName;
    delete view.payment.discountGrantedAt;
  }
  if (view.payment && role === 'tutor') {
    view.payment = null;
  }

  if (role === 'admin') {
    view.messages = {
      email: data.emailLog.map((row) => ({
        type: row.email_type,
        sentAt: row.sent_at,
        success: row.success,
        error: row.error_message,
      })),
      whatsapp: data.whatsappLog.map((row) => ({
        type: row.message_type,
        sentAt: row.sent_at,
        success: row.success,
        error: row.error_message,
      })),
      sms: data.smsLog.map((row) => ({
        type: row.message_type,
        sentAt: row.sent_at,
        success: row.success,
        error: row.error_message,
      })),
    };
    view.zoom = data.zoomRegistrant
      ? { joinUrl: data.zoomRegistrant.join_url, registeredAt: data.zoomRegistrant.created_at }
      : null;
    view.attendance = data.attendance.map((row) => ({
      sessionDate: row.session_date,
      joinTime: row.join_time,
      leaveTime: row.leave_time,
      durationMinutes: row.duration_minutes,
    }));
    view.feedback = data.feedback
      ? {
          overallRating: data.feedback.overall_rating,
          facilitatorRating: data.feedback.facilitator_rating,
          recommendRating: data.feedback.recommend_rating,
          improvementText: data.feedback.improvement_text,
          testimonialConsent: data.feedback.testimonial_consent,
          submittedAt: data.feedback.submitted_at,
        }
      : null;
    view.certificates = data.certificates.map((cert) => ({
      id: cert.id,
      certificateNumber: cert.certificate_number,
      issuedDate: cert.issued_date,
      revoked: cert.revoked,
    }));
  }

  // Finance can already view /calls — carry that same visibility here.
  if (role === 'admin' || role === 'finance') {
    view.calls = data.calls.map((call) => ({
      id: call.id,
      callType: call.call_type,
      status: call.status,
      summary: call.summary,
      needsHumanFollowup: call.needs_human_followup,
      createdAt: call.created_at,
    }));
  }

  return view;
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

// Immediate hard-delete of a wrongly-entered/test Registration
// (founder-approved 2026-07-22) — admin only, no cooling-off period, unlike
// the DPA erasure flow above (which is for data-subject requests and
// deliberately preserves financial records). Deletes the Payment row too
// (payments.registration_id is on delete restrict); every other child table
// already cascades on registrations.id.
export async function deleteRegistration(
  registrationId: string,
  reason: string | null,
): Promise<void> {
  const staffUser = await usersService.requireRole(['admin']);
  await registrationsRepository.callDeleteRegistrationImmediately(
    registrationId,
    staffUser.id,
    reason,
  );
}

// Immediate hard-delete of a wrongly-entered/test Participant, including
// every one of their Registrations and Payments — admin only, no
// cooling-off period. Distinct from hardDeleteParticipant (DPA Step 2),
// which requires a prior 30-day-old soft delete and refuses to run at all
// while financial records exist.
export async function deleteParticipantImmediately(
  participantId: string,
  reason: string | null,
): Promise<void> {
  const staffUser = await usersService.requireRole(['admin']);
  await registrationsRepository.callDeleteParticipantImmediately(
    participantId,
    staffUser.id,
    reason,
  );
}

// Batch/cohort transfer (system review, 2026-07-24) — admin-only, moves a
// Registration to a different Batch of the same Course, e.g. when a
// participant can't make their original cohort's start date. The fee is
// deliberately left untouched (founder decision, 2026-07-24: keep whatever
// was locked in at original registration, BR-18) — only the Batch link,
// Zoom registration (if already Paid), and notes change.
export async function transferRegistration(
  registrationId: string,
  input: TransferRegistrationInput,
): Promise<void> {
  const staffUser = await usersService.requireRole(['admin']);

  const data = await registrationsRepository.selectRegistration360(registrationId);
  if (!data || !data.batch) {
    throw new AppError('NOT_FOUND', 'Registration not found.', 404);
  }
  if (data.registration.batch_id === input.newBatchId) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This registration is already on that batch.',
      400,
    );
  }

  // Same BR-01/BR-19 eligibility gate createRegistration applies to a fresh
  // registration, reused here rather than reinvented — plus same-course,
  // since a transfer moves cohorts, not products.
  const destinationBatch = await coursesService.getBatchByIdSystem(input.newBatchId);
  const todayIso = new Date().toISOString().slice(0, 10);
  if (
    !destinationBatch ||
    destinationBatch.courseId !== data.batch.course_id ||
    !destinationBatch.isActive ||
    destinationBatch.startDate < todayIso
  ) {
    throw new AppError(
      'INVALID_BATCH',
      'The destination batch must be an active, not-yet-started batch of the same course.',
      400,
    );
  }

  // BR-03: unique(participant_id, batch_id) is the authoritative guarantee,
  // same posture as createRegistration's duplicate handling.
  try {
    await registrationsRepository.updateRegistrationBatch(registrationId, input.newBatchId);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        'DUPLICATE_REGISTRATION',
        'This participant is already registered for that batch.',
        409,
      );
    }
    throw err;
  }

  const transferNote =
    `Transferred from ${data.batch.cohort_label} to ${destinationBatch.cohortLabel} ` +
    `by ${staffUser.fullName} on ${todayIso}: ${input.reason}`;
  const updatedNotes = data.registration.notes
    ? `${data.registration.notes}\n${transferNote}`
    : transferNote;
  await registrationsRepository.updateRegistrationNotes(registrationId, updatedNotes);

  // Zoom re-registration only matters once Paid — an Unpaid/Part Payment
  // registration never had a personal join link to begin with (same gate
  // the portal dashboard already applies). Non-blocking: a Zoom hiccup must
  // never fail the transfer itself.
  if (data.payment?.payment_status === 'Paid') {
    try {
      await attendanceService.reregisterForZoomAfterTransfer(registrationId);
    } catch (err) {
      console.error('[batch transfer zoom re-registration]', err);
    }
  }

  // One-off staff-triggered notice — same inline-HTML posture as
  // certificates/service.ts's sendCertificateEmail, since this doesn't fit
  // the per-course templated pipeline (Phase 1 EmailType set). Non-blocking.
  if (data.participant?.email) {
    try {
      await sendTransactionalEmail({
        to: data.participant.email,
        subject: `Your course schedule has changed — ${destinationBatch.cohortLabel}`,
        html: `
<p>Dear ${data.participant.full_name},</p>
<p>Your registration has been moved to a new cohort: <strong>${destinationBatch.cohortLabel}</strong>, starting ${destinationBatch.startDate}.</p>
<p>Your course fee is unchanged.</p>
<p>Log in to your <a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com'}/portal/login">student portal</a> for the updated schedule${data.payment?.payment_status === 'Paid' ? ' and your new Zoom join link' : ''}.</p>
<p>If you have any questions, just reply to this email.</p>`,
      });
    } catch (err) {
      console.error('[batch transfer notification email]', err);
    }
  }
}
