// Shared multipart file-upload parsing (2026-08-04, learning resources +
// assignment submissions). Server-only — it touches Buffer and AppError.
// Client components import the constants from lib/upload-constants.ts
// instead, which has no imports at all.
//
// The payment-slip route (app/api/portal/payment-submissions/route.ts, the
// first upload in this codebase) inlined its own size/MIME/extension checks
// because it was the only one. Learning resources and assignment submissions
// make three, with a much wider document allow-list, so the check lives here
// once instead of being copy-pasted per route. Slip uploads are deliberately
// left on their own narrow image/PDF list — see PAYMENT_SUBMISSION_SLIP_*
// in modules/payments/types.ts.
import { AppError } from '@/lib/errors';
import { DOCUMENT_MIME_EXTENSIONS, UPLOAD_MAX_BYTES } from '@/lib/upload-constants';

export interface ParsedUpload {
  buffer: Buffer;
  contentType: string;
  extension: string;
  fileName: string;
  sizeBytes: number;
}

// Reads one file field off a multipart form. Returns null when the field is
// absent or empty, so callers can treat the upload as optional; callers that
// require a file check for null themselves.
export async function parseUploadedFile(
  formData: FormData,
  fieldName: string,
  options: { maxBytes?: number; label?: string } = {},
): Promise<ParsedUpload | null> {
  const maxBytes = options.maxBytes ?? UPLOAD_MAX_BYTES;
  const label = options.label ?? 'File';

  const value = formData.get(fieldName);
  if (!(value instanceof File) || value.size === 0) return null;

  if (value.size > maxBytes) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${label} is too large (max ${Math.floor(maxBytes / (1024 * 1024))}MB).`,
      400,
    );
  }

  const extension = DOCUMENT_MIME_EXTENSIONS[value.type];
  if (!extension) {
    throw new AppError(
      'VALIDATION_ERROR',
      `${label} must be a PDF, Word, PowerPoint, Excel, ZIP, text, CSV, or image file.`,
      400,
    );
  }

  const arrayBuffer = await value.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: value.type,
    extension,
    // Trimmed to the column's practical width and stripped of any path
    // component a browser might include.
    fileName: value.name.split(/[\\/]/).pop()?.slice(0, 200) || `upload.${extension}`,
    sizeBytes: value.size,
  };
}
