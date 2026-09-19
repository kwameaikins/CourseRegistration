// Knowsia Core Files, from this app (Coding Docs/22 §2, Doc 23 §1, 2026-09-19).
//
// One record, one gate, for every object the group holds: a payment slip
// uploaded here becomes a `core_files` row over there (sniffed from its
// bytes, capped by purpose, private, served only against a link that dies
// in fifteen minutes). This client speaks the service door; the R2 path
// stays as the fallback while Core is unreachable or not configured, and
// a slip's `slip_file_path` says which it is: `core:<file id>` or an R2 key.
import { captureToSentry } from '@/lib/errors';

export const CORE_FILE_PREFIX = 'core:';

export function isCoreFilesConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export interface StoredCoreFile {
  id: string;
  purpose: string;
  visibility: 'public' | 'private';
  filename: string;
  media_type: string;
  byte_size: number;
  storage: string;
  public_url: string | null;
}

export async function storeCoreFile(input: {
  purpose: 'payment_slip' | 'lesson_material' | 'ticket_attachment' | 'other';
  visibility: 'public' | 'private';
  ownerType: 'participant' | 'staff' | 'system';
  ownerId: string | null;
  filename: string;
  buffer: Buffer;
  retentionDays?: number;
}): Promise<StoredCoreFile> {
  const response = await fetch(`${base()}/api/v1/service/files`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      product: 'registration',
      purpose: input.purpose,
      visibility: input.visibility,
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      filename: input.filename,
      content_base64: input.buffer.toString('base64'),
      retention_days: input.retentionDays ?? null,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { detail?: string };
    throw new Error(`core files answered ${response.status}: ${body.detail ?? ''}`);
  }
  return (await response.json()) as StoredCoreFile;
}

/** A link a person can open now — a CDN URL for a public file, a signed
 *  15-minute path (absolute) for a private one. */
export async function coreFileLink(fileId: string): Promise<string> {
  const response = await fetch(`${base()}/api/v1/service/files/${fileId}/link`, {
    headers: headers(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`core file link answered ${response.status}`);
  const data = (await response.json()) as { url: string };
  return data.url.startsWith('http') ? data.url : `${base()}${data.url}`;
}

export function isCoreFilePath(path: string | null | undefined): path is string {
  return typeof path === 'string' && path.startsWith(CORE_FILE_PREFIX);
}

export function coreFileId(path: string): string {
  return path.slice(CORE_FILE_PREFIX.length);
}

export function reportCoreFilesFailure(err: unknown, job: string): void {
  captureToSentry(err, { job });
}
