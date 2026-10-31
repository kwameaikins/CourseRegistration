// Knowsia LMS — the certificate registry (R3, 2026-10-31).
//
// With CERTIFICATE_ISSUER=lms this app stops numbering, storing and rendering
// certificates and asks the LMS's service doors instead. Unlike cohorts.ts
// (best-effort mirrors), these calls THROW: a certificate is the thing being
// asked for, so an unreachable registry must be visible to the caller — an
// AppError 503, never a silent null that reads as "no certificate".
import { AppError } from '@/lib/errors';
import type { CertificateView, VerificationResult } from '@/modules/certificates/types';

export function certificateIssuer(): 'local' | 'lms' {
  return (process.env.CERTIFICATE_ISSUER ?? '').trim().toLowerCase() === 'lms' ? 'lms' : 'local';
}

const UNAVAILABLE_MESSAGE = 'The certificate registry is unavailable — try again shortly.';
const PREFIX = '/api/v1/service/lms/certificates';

function unavailable(): AppError {
  return new AppError('LMS_UNAVAILABLE', UNAVAILABLE_MESSAGE, 503);
}

function base(): string {
  // trim(): a stray CR from a piped `vercel env add` 500'd every proxied call once (2026-08-23).
  return (process.env.KNOWSIA_LMS_API_URL || process.env.KNOWSIA_APP_API_URL || '').trim().replace(/\/+$/, '');
}

function configured(): boolean {
  return Boolean(base() && process.env.KNOWSIA_APP_SERVICE_KEY);
}

interface Raw {
  status: number;
  response: Response;
}

async function request(path: string, init: RequestInit = {}): Promise<Raw> {
  if (!configured()) throw unavailable();
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY!.trim() },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    console.error('[lms certificates]', err);
    throw unavailable();
  }
  if (response.status >= 500) {
    console.error('[lms certificates]', response.status);
    throw unavailable();
  }
  return { status: response.status, response };
}

async function detailOf(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === 'string' ? body.detail : '';
  } catch {
    return '';
  }
}

async function conflict(response: Response, message: string): Promise<AppError> {
  const detail = await detailOf(response);
  if (detail === 'registry_not_active') return unavailable();
  return new AppError('DUPLICATE_CERTIFICATE', detail && detail !== 'conflict' ? `${message} (${detail})` : message, 409);
}

async function json<T>(raw: Raw): Promise<T> {
  if (raw.status >= 400) {
    throw new AppError('LMS_ERROR', `The certificate registry answered ${raw.status}.`, 502);
  }
  return (await raw.response.json()) as T;
}

export interface LmsIssueInput {
  source?: 'cohort' | 'self_paced';
  courseCode: string;
  courseTitle: string;
  recipientName: string;
  recipientEmail: string | null;
  description: string;
  hours: number;
  cpdCredit: string;
  facilitatorName: string | null;
  issuedDate: string;
  registrationRef: string | null;
  issuedByRef: string | null;
  customNumber?: string;
}

export interface LmsIssueResult {
  id: string;
  certificateNumber: string;
  issuedDate: string;
  verifyUrl: string;
  existing: boolean;
}

export async function issueOnLms(input: LmsIssueInput): Promise<LmsIssueResult> {
  const raw = await request(`${PREFIX}/issue`, {
    method: 'POST',
    body: JSON.stringify({
      source: input.source ?? 'cohort',
      courseCode: input.courseCode,
      courseTitle: input.courseTitle,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
      description: input.description,
      hours: input.hours,
      cpdCredit: input.cpdCredit,
      facilitatorName: input.facilitatorName,
      issuedDate: input.issuedDate,
      registrationRef: input.registrationRef,
      issuedByRef: input.issuedByRef,
      customNumber: input.customNumber ?? null,
    }),
  });
  if (raw.status === 409) {
    throw await conflict(
      raw.response,
      input.customNumber
        ? `Certificate number ${input.customNumber} already exists (or this registration already has a certificate).`
        : 'Could not allocate a certificate number — the registration may already have a certificate.',
    );
  }
  return json<LmsIssueResult>(raw);
}

export async function verifyOnLms(number: string): Promise<VerificationResult> {
  const raw = await request(`${PREFIX}/verify/${encodeURIComponent(number)}`);
  if (raw.status === 404) return { status: 'not_found' };
  return json<VerificationResult>(raw);
}

export async function getOnLms(id: string): Promise<CertificateView | null> {
  const raw = await request(`${PREFIX}/${encodeURIComponent(id)}`);
  if (raw.status === 404) return null;
  return json<CertificateView>(raw);
}

export async function listOnLms(
  limit: number,
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<CertificateView[]> {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (range.dateFrom) qs.set('dateFrom', range.dateFrom);
  if (range.dateTo) qs.set('dateTo', range.dateTo);
  const raw = await request(`${PREFIX}?${qs}`);
  return (await json<{ items: CertificateView[] }>(raw)).items;
}

/** Certificates already issued for these registrations (one call per batch). */
export async function listByRegistrationsOnLms(registrationIds: string[]): Promise<CertificateView[]> {
  if (registrationIds.length === 0) return [];
  const qs = new URLSearchParams({ registrationRefs: registrationIds.join(',') });
  const raw = await request(`${PREFIX}?${qs}`);
  return (await json<{ items: CertificateView[] }>(raw)).items;
}

async function pdfFrom(raw: Raw): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  if (raw.status === 404) return null;
  if (raw.status >= 400) throw new AppError('LMS_ERROR', `The certificate registry answered ${raw.status}.`, 502);
  const disposition = raw.response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  return {
    fileName: match?.[1] ?? 'certificate.pdf',
    bytes: new Uint8Array(await raw.response.arrayBuffer()),
  };
}

export async function pdfOnLms(id: string): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  return pdfFrom(await request(`${PREFIX}/${encodeURIComponent(id)}/pdf`));
}

export async function pdfByNumberOnLms(number: string): Promise<{ fileName: string; bytes: Uint8Array } | null> {
  return pdfFrom(await request(`${PREFIX}/by-number/${encodeURIComponent(number)}/pdf`));
}

/** False when the LMS has no such certificate. */
export async function revokeOnLms(id: string, reason: string): Promise<boolean> {
  const raw = await request(`${PREFIX}/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  if (raw.status === 404) return false;
  await json(raw);
  return true;
}

export async function renameOnLms(registrationIds: string[], recipientName: string): Promise<void> {
  const raw = await request(`${PREFIX}/rename`, {
    method: 'POST',
    body: JSON.stringify({ registrationRefs: registrationIds, recipientName }),
  });
  await json(raw);
}
