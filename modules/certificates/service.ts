// Certificate registry business rules (founder-approved 2026-07-19).
//
// Numbering: KNS-<COURSECODE>-<YEAR>-<NNNN>, serial per course code per
// year, continuing the legacy registry's shape. The unique constraint on
// certificate_number is the collision guard — generation retries on a race.
// Eligibility for batch issuance: Paid + feedback submitted (the promise in
// the post-course email); attendance is surfaced for admin judgment, and the
// admin explicitly selects who gets issued (admin-approved, auto-computed).
import { generateCertificatePdf } from '@/lib/certificates/pdf';
import { sendTransactionalEmail } from '@/lib/resend/client';
import { AppError } from '@/lib/errors';
import * as certificatesRepository from '@/modules/certificates/repository';
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
  const prefix = `${CERT_PREFIX}-${courseCode.toUpperCase()}-${year}-`;
  const maxSerial = await certificatesRepository.selectMaxSerial(prefix);
  return buildCertificateNumber(courseCode, year, maxSerial + 1);
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

export async function listCertificates(limit = 200): Promise<CertificateView[]> {
  const rows = await certificatesRepository.selectCertificates(limit);
  return rows.map(toView);
}

export async function issueManual(
  input: ManualIssueInput,
  issuedByStaffId: string,
): Promise<CertificateView> {
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

export async function getBatchIssueContext(batchId: string): Promise<{
  courseCode: string;
  courseTitle: string;
  candidates: BatchIssueCandidate[];
} | null> {
  const context = await certificatesRepository.selectBatchIssueContext(batchId);
  if (!context) return null;
  return {
    courseCode: context.courseCode,
    courseTitle: context.courseTitle,
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
        alreadyIssued: candidate.alreadyIssued,
        eligible: candidate.paid && candidate.feedbackSubmitted && !candidate.alreadyIssued,
      })),
  };
}

export async function issueForBatch(
  input: BatchIssueInput,
  issuedByStaffId: string,
): Promise<BatchIssueResult> {
  const context = await certificatesRepository.selectBatchIssueContext(input.batchId);
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

export async function revokeCertificate(
  certificateId: string,
  reason: string,
): Promise<void> {
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
    cpdCredit: row.cpd_credit,
    issuedDate: row.issued_date,
    verifyUrl: verifyUrlFor(row.certificate_number),
  });
  return { fileName: `${row.certificate_number}.pdf`, bytes };
}
