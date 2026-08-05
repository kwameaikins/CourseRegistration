// Cloudflare R2 object-key convention (2026-08-05).
//
// One bucket (`knowsia-course-bucket`) holds every upload in this app, so the
// KEY is what organises it. Every key is built here and nowhere else, so the
// layout cannot drift as new upload types are added — a new type needs a new
// prefix below, never a new bucket.
//
//   slips/<registrationId>/<uuid>.<ext>
//   materials/<batchId>/<uuid>.<ext>
//   submissions/<assignmentId>/<registrationId>/<uuid>.<ext>
//
// The shape is always: <content type> / <owning aggregate> [/ <sub-scope>] /
// <random uuid>.<ext>
//
//   1. Top-level segment is the content type, so the bucket can be listed,
//      lifecycle-ruled, or audited one type at a time.
//   2. Next segment(s) are the aggregate that owns the file, so every object
//      for one registration/batch/assignment is a single prefix listing —
//      which is what a DPA erasure request or a batch cleanup actually needs.
//   3. The filename is always a fresh UUID, NEVER the uploader's filename.
//      A filename is untrusted input; the display name lives in the database
//      (session_materials.file_name, assignment_submissions.file_name).
//   4. The extension is derived from the validated MIME type
//      (lib/upload-constants.ts), never parsed off the client filename.
//
// No date partitioning: at ~48 intakes and ~1,440 registrations a year the
// per-aggregate prefixes stay small, and a date segment would only make keys
// harder to reason about.
//
// Changing a prefix here orphans existing objects — the database stores whole
// keys, so old rows keep resolving, but new writes land elsewhere. All three
// prefixes were normalised on 2026-08-05 while the bucket was still empty
// (verified: zero payment slips, zero materials, zero submissions), so
// nothing was orphaned. Treat them as fixed from here.

export const R2_PREFIXES = {
  paymentSlip: 'slips',
  learningResource: 'materials',
  assignmentSubmission: 'submissions',
} as const;

// Ids come from our own database (they are uuids), and extensions come from a
// fixed allow-list — but this is the one place every key is assembled, so it
// is also the cheapest place to make traversal structurally impossible rather
// than merely unlikely.
function assertKeySegment(value: string, label: string): string {
  if (!value || /[/\\]/.test(value) || value.includes('..')) {
    throw new Error(`Unsafe R2 key segment for ${label}: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Proof-of-payment slip for one registration (modules/payments). */
export function paymentSlipKey(registrationId: string, extension: string): string {
  return [
    R2_PREFIXES.paymentSlip,
    assertKeySegment(registrationId, 'registrationId'),
    `${crypto.randomUUID()}.${assertKeySegment(extension, 'extension')}`,
  ].join('/');
}

/** Tutor- or staff-uploaded learning resource for one batch (modules/live-sessions). */
export function learningResourceKey(batchId: string, extension: string): string {
  return [
    R2_PREFIXES.learningResource,
    assertKeySegment(batchId, 'batchId'),
    `${crypto.randomUUID()}.${assertKeySegment(extension, 'extension')}`,
  ].join('/');
}

/**
 * One learner's submitted file for one assignment (modules/assignments).
 * Nested assignment-then-registration so a whole assignment's submissions are
 * one prefix listing, which is the direction a tutor actually reads them.
 */
export function assignmentSubmissionKey(
  assignmentId: string,
  registrationId: string,
  extension: string,
): string {
  return [
    R2_PREFIXES.assignmentSubmission,
    assertKeySegment(assignmentId, 'assignmentId'),
    assertKeySegment(registrationId, 'registrationId'),
    `${crypto.randomUUID()}.${assertKeySegment(extension, 'extension')}`,
  ].join('/');
}
