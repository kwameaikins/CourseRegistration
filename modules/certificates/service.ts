// Certificate registry business rules (founder-approved 2026-07-19).
//
// Numbering: KNS-<COURSECODE>-<YEAR>-<NNNN>, serial per course code per
// year, continuing the legacy registry's shape. The unique constraint on
// certificate_number is the collision guard — generation retries on a race.
// Eligibility for batch issuance (BR-46, revised 2026-08-18): entitlement plus
// participation. On a paid Batch entitlement is `paid`; on a free Batch there
// is none to check. Participation is attendance OR feedback OR an assignment
// submission — any one suffices, because a paying participant may watch the
// recordings rather than attend live. See isCertificateEligible.
import { generateCertificatePdf } from '@/lib/certificates/pdf';
import { sendTransactionalEmail } from '@/lib/resend/client';
import { AppError } from '@/lib/errors';
import * as assignmentsService from '@/modules/assignments/service';
import * as certificatesRepository from '@/modules/certificates/repository';
import * as usersService from '@/modules/users/service';
import {
  CERT_PREFIX,
  type BatchIssueCandidate,
  type BatchIssueInput,
  type BatchIssueResult,
  type CertificateView,
  type ManualIssueInput,
  type VerificationResult,
} from '@/modules/certificates/types';
import type { Database } from '@/lib/supabase/database.types';

type CertificateRow = Database['public']['Tables']['certificates']['Row'];

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

// Matches ROLE_ROUTES['/certificates'] (lib/auth/roles.ts). Enforced here as
// well as at the route layer because these repository calls run on the
// service-role client and so are not backstopped by RLS.
//
// Deliberately NOT applied to the entry points that legitimately run without
// a staff session: verifyCertificate (public /verify page),
// getCertificatePdf (emailed download link), issueCertificateIfEligible
// (public feedback submission), renameExistingCertificates (student portal)
// and getBatchIssueContextSystem (also read by the tutor portal via
// modules/tutors). Those keep the boundary appropriate to their own caller.
const CERTIFICATE_STAFF_ROLES = ['admin'] as const;

// The one eligibility rule, shared by auto-issue, completion issuance and the
// batch screen. BR-46.
//
// Two independent halves (founder, 2026-08-18):
//
//   ENTITLEMENT — on a paid Batch, `paid`. On a free Batch, nothing, because
//   payment proves nothing there: since 202608030048 a zero-fee registration
//   settles to 'Paid' the instant it is created, so `paid` is true for
//   everyone who merely filled in the form.
//
//   PARTICIPATION — at least one of: attended a session, submitted feedback,
//   or submitted an assignment. ANY ONE is enough.
//
// The participation half is an OR rather than a list of requirements because a
// paying participant may legitimately never appear in the attendance data —
// they can watch the recordings instead. Attendance is then the wrong and only
// proxy for "did they take the course", so feedback and assignment submission
// stand alongside it as equally valid evidence. Someone who paid and then did
// none of the three has no evidence of participation at all, and that is the
// only case this refuses.
//
// Assignment submission QUALIFIES, it does not gate: no grade is consulted.
// Requiring a grade would make certificate delivery wait on tutor marking
// turnaround, which has no SLA and no reminder — a silent stall of exactly the
// kind this codebase has been bitten by three times.
//
// QUIZZES are not represented here and cannot be: the question bank and mock
// exams belong to KnowsiaApp (Document 19 §3), which this system deliberately
// does not read. If quiz completion should count as participation, it arrives
// through the Seam III entitlement work, not from a table here.
//
// Attendance comes from the Zoom sync (modules/attendance) and counts every
// session the participant joined, however briefly (founder decision
// 2026-08-08). It was briefly thresholded on MIN_ATTENDANCE_RATIO — see
// certificates/repository.ts for why that was reversed. The threshold still
// exists and is still reported; it just does not decide who gets a certificate.
function isCertificateEligible(
  candidate: {
    paid: boolean;
    feedbackSubmitted: boolean;
    attendedSessions: number;
    assignmentSubmitted: boolean;
  },
  batchIsFree: boolean,
): boolean {
  const participated =
    candidate.attendedSessions > 0 ||
    candidate.feedbackSubmitted ||
    candidate.assignmentSubmitted;
  return batchIsFree ? participated : candidate.paid && participated;
}

// Certificate eligibility needs assignment submission, which lives in another
// module. Repositories never cross module lines (CLAUDE.md rule 1), so the
// join happens here — one extra read per batch, merged onto the candidates the
// repository built. Every caller goes through this rather than the repository
// directly, so the three issue paths cannot drift apart on what "eligible"
// means.
async function loadIssueContext(batchId: string) {
  const context = await certificatesRepository.selectBatchIssueContext(batchId);
  if (!context) return null;
  const submitted =
    await assignmentsService.getRegistrationIdsWithSubmissionsForBatchSystem(batchId);
  return {
    ...context,
    candidates: context.candidates.map((candidate) => ({
      ...candidate,
      assignmentSubmitted: submitted.has(candidate.registrationId),
    })),
  };
}

export function verifyUrlFor(certificateNumber: string): string {
  return `${APP_URL()}/verify/${encodeURIComponent(certificateNumber)}`;
}

export function downloadUrlFor(certificateId: string): string {
  return `${APP_URL()}/api/certificates/download/${certificateId}`;
}

function toView(row: CertificateRow): CertificateView {
  return {
    id: row.id,
    certificateNumber: row.certificate_number,
    recipientName: row.recipient_name,
    courseTitle: row.course_title,
    hours: row.hours,
    cpdCredit: row.cpd_credit,
    issuedDate: row.issued_date,
    revoked: row.revoked,
    revokedReason: row.revoked_reason,
    registrationId: row.registration_id,
    recipientEmail: row.recipient_email,
    createdAt: row.created_at,
  };
}

export function buildCertificateNumber(
  courseCode: string,
  year: number,
  serial: number,
): string {
  return `${CERT_PREFIX}-${courseCode.toUpperCase()}-${year}-${String(serial).padStart(4, '0')}`;
}

async function nextCertificateNumber(courseCode: string, issuedDate: string): Promise<string> {
  const year = Number(issuedDate.slice(0, 4));
  const code = courseCode.toUpperCase();
  const registryMax = await certificatesRepository.selectMaxSerialForCourseYear(code, year);
  // The legacy AppScript counter recorded serials for certificates that
  // never made it into the registry export (e.g. CA01 stands at 20 with no
  // rows). The floor applies to the 2026 sequence only.
  const floor = year === 2026 ? await certificatesRepository.selectCourseSerialFloor(code) : 0;
  return buildCertificateNumber(code, year, Math.max(registryMax, floor) + 1);
}

async function insertWithNumberRetry(
  row: Omit<Database['public']['Tables']['certificates']['Insert'], 'certificate_number'>,
  courseCode: string,
  customNumber?: string,
): Promise<CertificateRow> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const certificateNumber =
      customNumber ?? (await nextCertificateNumber(courseCode, row.issued_date ?? new Date().toISOString().slice(0, 10)));
    const result = await certificatesRepository.insertCertificate({
      ...row,
      certificate_number: certificateNumber,
    });
    if (result.outcome === 'inserted') return result.row;
    if (customNumber) {
      throw new AppError(
        'DUPLICATE_CERTIFICATE',
        `Certificate number ${customNumber} already exists (or this registration already has a certificate).`,
        409,
      );
    }
    // Serial race or duplicate registration — re-derive and retry.
  }
  throw new AppError(
    'DUPLICATE_CERTIFICATE',
    'Could not allocate a certificate number — the registration may already have a certificate.',
    409,
  );
}

async function sendCertificateEmail(row: CertificateRow): Promise<boolean> {
  if (!row.recipient_email) return false;
  await sendTransactionalEmail({
    to: row.recipient_email,
    subject: `Your Knowsia certificate — ${row.course_title}`,
    html: `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a2e;max-width:600px;margin:0 auto;">
<p style="margin-bottom:24px;"><img src="${APP_URL()}/knowsia-logo.png" alt="Knowsia" width="140" style="display:block;" /></p>
<p>Dear ${row.recipient_name},</p>
<p>Congratulations! Your Certificate of Competence for <strong>${row.course_title}</strong> has been issued.</p>
<p style="margin:24px 0;"><a href="${downloadUrlFor(row.id)}" style="background:#4B21A8;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Download your certificate (PDF)</a></p>
<p>Certificate number: <strong>${row.certificate_number}</strong><br/>
Anyone can confirm its authenticity at:<br/><a href="${verifyUrlFor(row.certificate_number)}">${verifyUrlFor(row.certificate_number)}</a></p>
<p>Add it to your LinkedIn profile under Licenses &amp; Certifications — use the certificate number and the verification link above.</p>
<p>Warm regards,<br/><strong>The Knowsia Team</strong></p>
</div>`,
  });
  return true;
}

// Standalone resend (Admin Assistant tools, 2026-07-27) — reuses the exact
// same send logic issueForBatch/issueManual already call at issuance time,
// just loading the row from an id instead of having it in hand already.
// Zero risk to those existing paths (pure addition).
export async function resendCertificateEmail(certificateId: string): Promise<boolean> {
  await usersService.requireRole([...CERTIFICATE_STAFF_ROLES]);
  const row = await certificatesRepository.selectCertificateById(certificateId);
  if (!row) {
    throw new AppError('NOT_FOUND', 'Certificate not found.', 404);
  }
  if (row.revoked) {
    throw new AppError('CONFLICT', 'This certificate has been revoked.', 409);
  }
  return sendCertificateEmail(row);
}

// Auto-issue on feedback submission (founder-approved 2026-07-27): the
// moment a Paid registration submits feedback, issue their certificate
// immediately — no staff step. Same eligibility rule as issueForBatch (Paid
// + feedback submitted + not already issued + participant not deleted),
// just scoped to one registration instead of an admin-picked batch.
// issued_by is null (no staff actor) — the column is nullable by design and
// the Certificates screen already tolerates a null issuer for display.
// Returns null (no-op) rather than throwing for every "not eligible yet"
// case, since the caller (feedback submission) must never fail because of
// this.
export async function issueCertificateIfEligible(
  registrationId: string,
): Promise<CertificateView | null> {
  const batchId = await certificatesRepository.selectBatchIdForRegistration(registrationId);
  if (!batchId) return null;

  const context = await loadIssueContext(batchId);
  if (!context) return null;

  const candidate = context.candidates.find((c) => c.registrationId === registrationId);
  if (!candidate || candidate.participantDeleted || candidate.alreadyIssued) return null;
  if (!isCertificateEligible(candidate, context.batchIsFree)) return null;

  let row: CertificateRow;
  try {
    row = await insertWithNumberRetry(
      {
        registration_id: registrationId,
        recipient_name: candidate.participantName,
        course_title: context.courseTitle,
        description: context.defaultDescription,
        hours: context.defaultHours,
        cpd_credit: context.defaultCpdCredit,
        facilitator_name: context.facilitatorName,
        issued_date: new Date().toISOString().slice(0, 10),
        issued_by: null,
        recipient_email: candidate.participantEmail || null,
      },
      context.courseCode,
    );
  } catch (err) {
    // A concurrent issuance (rare double-submit race) lands here as
    // DUPLICATE_CERTIFICATE after insertWithNumberRetry's own retries —
    // treat it as "already issued", not a failure.
    if (err instanceof AppError && err.code === 'DUPLICATE_CERTIFICATE') return null;
    throw err;
  }

  try {
    await sendCertificateEmail(row);
  } catch (err) {
    console.error('[certificate auto-issue email]', err);
  }
  return toView(row);
}

// Completion issuance (BR-46, founder 2026-08-18): "when the course completes,
// their certificate should be available so they can download it."
//
// Runs from the daily 07:00 cron against batches that ended yesterday — the
// same tick and the same target date as the feedback request, so the two agree
// about when a course is over.
//
// DELIBERATELY DOES NOT EMAIL. That is the whole distinction from
// issueCertificateIfEligible: completing the course makes the certificate
// available to download in the student portal, whereas submitting feedback
// sends it to the person directly. Issuing here and emailing as well would
// make the feedback route meaningless and mail everyone twice.
//
// Idempotent by construction: `alreadyIssued` skips anyone who has one, and
// certificates.registration_id is unique, so a second run — or a race with the
// feedback path — inserts nothing and lands as DUPLICATE_CERTIFICATE, which is
// swallowed as "already issued" rather than failing the run.
//
// One participant's failure never stops the batch, and one batch's failure
// never stops the tick; both are collected into `errors` and reported by the
// caller, because a cron that returns a silent 200 while writing nothing is
// the single most repeated failure in this codebase.
export async function runCompletedBatchCertificateIssuance(
  now = new Date(),
): Promise<{
  date: string;
  batchesEvaluated: number;
  issued: number;
  skipped: number;
  errors: string[];
}> {
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const targetEndDate = yesterday.toISOString().slice(0, 10);

  const summary = {
    date: targetEndDate,
    batchesEvaluated: 0,
    issued: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const batchIds = await certificatesRepository.selectBatchIdsEndedOn(targetEndDate);
  for (const batchId of batchIds) {
    summary.batchesEvaluated += 1;
    try {
      const context = await loadIssueContext(batchId);
      if (!context) continue;

      for (const candidate of context.candidates) {
        if (candidate.participantDeleted || candidate.alreadyIssued) {
          summary.skipped += 1;
          continue;
        }
        if (!isCertificateEligible(candidate, context.batchIsFree)) {
          summary.skipped += 1;
          continue;
        }
        try {
          await insertWithNumberRetry(
            {
              registration_id: candidate.registrationId,
              recipient_name: candidate.participantName,
              course_title: context.courseTitle,
              description: context.defaultDescription,
              hours: context.defaultHours,
              cpd_credit: context.defaultCpdCredit,
              facilitator_name: context.facilitatorName,
              issued_date: new Date().toISOString().slice(0, 10),
              issued_by: null,
              recipient_email: candidate.participantEmail || null,
            },
            context.courseCode,
          );
          summary.issued += 1;
        } catch (err) {
          if (err instanceof AppError && err.code === 'DUPLICATE_CERTIFICATE') {
            summary.skipped += 1;
            continue;
          }
          summary.errors.push(`${candidate.registrationId}: ${String(err)}`);
        }
      }
    } catch (err) {
      summary.errors.push(`batch ${batchId}: ${String(err)}`);
    }
  }

  return summary;
}

export async function listCertificates(
  limit = 200,
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<CertificateView[]> {
  await usersService.requireRole([...CERTIFICATE_STAFF_ROLES]);
  const rows = await certificatesRepository.selectCertificates(limit, range);
  return rows.map(toView);
}

export async function issueManual(
  input: ManualIssueInput,
  issuedByStaffId: string,
): Promise<CertificateView> {
  await usersService.requireRole([...CERTIFICATE_STAFF_ROLES]);
  const row = await insertWithNumberRetry(
    {
      recipient_name: input.recipientName,
      course_title: input.courseTitle,
      description: input.description,
      hours: input.hours,
      cpd_credit: input.cpdCredit,
      issued_date: input.issuedDate,
      issued_by: issuedByStaffId,
      recipient_email: input.recipientEmail ?? null,
    },
    input.courseCode,
    input.customNumber,
  );
  if (input.sendEmail && row.recipient_email) {
    try {
      await sendCertificateEmail(row);
    } catch (err) {
      console.error('[certificate email]', err);
    }
  }
  return toView(row);
}

export async function getBatchIssueContextSystem(batchId: string): Promise<{
  courseCode: string;
  courseTitle: string;
  defaultHours: number;
  defaultDescription: string;
  defaultCpdCredit: string;
  // Lets the Certificates screen state which rule it applied — on a free
  // event, everyone reads as Paid, so showing that column without explanation
  // would look like the gate had simply stopped working.
  batchIsFree: boolean;
  candidates: BatchIssueCandidate[];
} | null> {
  const context = await loadIssueContext(batchId);
  if (!context) return null;
  return {
    courseCode: context.courseCode,
    courseTitle: context.courseTitle,
    defaultHours: context.defaultHours,
    defaultDescription: context.defaultDescription,
    defaultCpdCredit: context.defaultCpdCredit,
    batchIsFree: context.batchIsFree,
    candidates: context.candidates
      .filter((candidate) => !candidate.participantDeleted)
      .map((candidate) => ({
        registrationId: candidate.registrationId,
        participantName: candidate.participantName,
        participantEmail: candidate.participantEmail,
        paid: candidate.paid,
        feedbackSubmitted: candidate.feedbackSubmitted,
        attendancePercent:
          candidate.totalSessions > 0
            ? Math.round((candidate.attendedSessions / candidate.totalSessions) * 100)
            : null,
        assignmentSubmitted: candidate.assignmentSubmitted,
        alreadyIssued: candidate.alreadyIssued,
        eligible:
          isCertificateEligible(candidate, context.batchIsFree) && !candidate.alreadyIssued,
      })),
  };
}

export async function issueForBatch(
  input: BatchIssueInput,
  issuedByStaffId: string,
): Promise<BatchIssueResult> {
  await usersService.requireRole([...CERTIFICATE_STAFF_ROLES]);
  const context = await loadIssueContext(input.batchId);
  if (!context) {
    throw new AppError('NOT_FOUND', 'Batch not found.', 404);
  }
  const candidateByRegistration = new Map(
    context.candidates.map((candidate) => [candidate.registrationId, candidate]),
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const result: BatchIssueResult = { issued: 0, skipped: 0, emailed: 0, errors: [] };

  for (const registrationId of input.registrationIds) {
    const candidate = candidateByRegistration.get(registrationId);
    // The admin picked the rows, but deleted participants and existing
    // certificates are hard gates regardless of selection.
    if (!candidate || candidate.participantDeleted || candidate.alreadyIssued) {
      result.skipped += 1;
      continue;
    }
    try {
      const row = await insertWithNumberRetry(
        {
          registration_id: registrationId,
          recipient_name: candidate.participantName,
          course_title: context.courseTitle,
          description: input.description,
          hours: input.hours,
          cpd_credit: input.cpdCredit,
          facilitator_name: context.facilitatorName,
          issued_date: todayIso,
          issued_by: issuedByStaffId,
          recipient_email: candidate.participantEmail || null,
        },
        context.courseCode,
      );
      result.issued += 1;
      if (input.sendEmail) {
        try {
          if (await sendCertificateEmail(row)) result.emailed += 1;
        } catch (err) {
          result.errors.push(`${registrationId}: email failed — ${String(err)}`);
        }
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'DUPLICATE_CERTIFICATE') {
        result.skipped += 1;
      } else {
        result.errors.push(`${registrationId}: ${String(err)}`);
      }
    }
  }
  return result;
}

// Called from the portal module when a participant self-corrects their name
// (system review, 2026-07-24) — same cross-module posture as
// registrations/service.ts calling portal's ensureParticipantAuth: a
// specific, narrow need every module is allowed, not a general open door.
// No role check here (unlike the staff-facing certificate actions, gated at
// the route layer) because the caller is the participant themself, acting
// on their own record.
export async function renameExistingCertificates(
  registrationIds: string[],
  recipientName: string,
): Promise<void> {
  await certificatesRepository.updateRecipientNameForRegistrations(
    registrationIds,
    recipientName,
  );
}

export async function revokeCertificate(
  certificateId: string,
  reason: string,
): Promise<void> {
  await usersService.requireRole([...CERTIFICATE_STAFF_ROLES]);
  const row = await certificatesRepository.selectCertificateById(certificateId);
  if (!row) throw new AppError('NOT_FOUND', 'Certificate not found.', 404);
  await certificatesRepository.updateCertificate(certificateId, {
    revoked: true,
    revoked_reason: reason || null,
  });
}

// Public verification (by certificate number).
export async function verifyCertificate(
  certificateNumber: string,
): Promise<VerificationResult> {
  const row = await certificatesRepository.selectCertificateByNumber(certificateNumber);
  if (!row) return { status: 'not_found' };
  if (row.revoked) {
    return { status: 'revoked', certificateNumber: row.certificate_number };
  }
  return {
    status: 'valid',
    recipientName: row.recipient_name,
    courseTitle: row.course_title,
    issuedDate: row.issued_date,
    certificateNumber: row.certificate_number,
  };
}

// Public download (by unguessable row UUID) — regenerated on demand.
export async function getCertificatePdf(
  certificateId: string,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const row = await certificatesRepository.selectCertificateById(certificateId);
  if (!row || row.revoked) {
    throw new AppError('NOT_FOUND', 'Certificate not available.', 404);
  }
  const bytes = await generateCertificatePdf({
    certificateNumber: row.certificate_number,
    recipientName: row.recipient_name,
    courseTitle: row.course_title,
    description: row.description,
    hours: row.hours,
    facilitatorName: row.facilitator_name,
    issuedDate: row.issued_date,
    verifyUrl: verifyUrlFor(row.certificate_number),
  });
  return { fileName: `${row.certificate_number}.pdf`, bytes };
}
