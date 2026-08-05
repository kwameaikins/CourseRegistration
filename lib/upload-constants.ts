// Upload constants shared by the server parser (lib/uploads.ts) and the
// client upload forms (tutor portal, student portal, /live-sessions).
//
// Deliberately a separate module with zero imports: lib/uploads.ts touches
// Buffer and AppError, neither of which belongs in a browser bundle, so the
// client components import only from here.

// Documents a tutor realistically shares, or a student realistically submits.
// The extension is derived from this map, never from the client-supplied
// filename — a filename is untrusted input and is only ever stored as a
// display label, never used to build the R2 object key.
export const DOCUMENT_MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// 20MB. Vercel's serverless request body cap is 4.5MB on Hobby, so anything
// larger fails at the platform edge before reaching us regardless — this
// limit exists so the failure is a clear validation message on the smaller
// files that do get through, not a mysterious platform 413. Revisit alongside
// direct-to-R2 presigned uploads if large decks become a real need.
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

// The `accept` attribute for a file input. Extensions rather than MIME types
// because Windows/Android browsers are far more reliable matching on these.
export const UPLOAD_ACCEPT_ATTRIBUTE = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx',
  '.zip', '.txt', '.csv', '.jpg', '.jpeg', '.png',
].join(',');

export const UPLOAD_TYPES_HINT =
  'PDF, Word, PowerPoint, Excel, ZIP, text, CSV, or an image. Up to 20MB.';
