import { z } from 'zod';

export const LIVE_SESSION_STATUSES = [
  'draft',
  'scheduled',
  'ready',
  'live',
  'completed',
  'cancelled',
  'rescheduled',
  'archived',
] as const;

export type LiveSessionStatus = (typeof LIVE_SESSION_STATUSES)[number];

export interface LiveSession {
  id: string;
  batchId: string;
  tutorStaffId: string | null;
  // The tutor assigned to this session (external party — see
  // modules/tutors). tutorStaffId is a legacy staff-role field, kept for
  // now but no longer written to by new code (2026-07-27).
  tutorId: string | null;
  title: string;
  agenda: string | null;
  learningOutcomes: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  provider: 'zoom';
  zoomMeetingId: string | null;
  status: LiveSessionStatus;
  statusReason: string | null;
  createdAt: string;
  updatedAt: string;
}

const optionalLongText = z.string().trim().max(3000).transform((value) => value || null).nullable().optional();
const optionalReason = z.string().trim().min(3).max(500).transform((value) => value || null).nullable().optional();
const isoDateTime = z.string().datetime({ offset: true });

export const liveSessionInputSchema = z
  .object({
    batchId: z.uuid(),
    tutorStaffId: z.uuid().nullable().optional(),
    tutorId: z.uuid().nullable().optional(),
    title: z.string().trim().min(2).max(200),
    agenda: optionalLongText,
    learningOutcomes: optionalLongText,
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    timezone: z.literal('Africa/Accra').default('Africa/Accra'),
    status: z.enum(['draft', 'scheduled']).default('scheduled'),
  })
  .refine((input) => new Date(input.endsAt) > new Date(input.startsAt), {
    message: 'End time must be after start time.',
    path: ['endsAt'],
  });

export const liveSessionUpdateSchema = z.object({
  tutorStaffId: z.uuid().nullable().optional(),
  tutorId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200).optional(),
  agenda: optionalLongText,
  learningOutcomes: optionalLongText,
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  status: z.enum(LIVE_SESSION_STATUSES).optional(),
  statusReason: optionalReason,
});

export type LiveSessionInput = z.infer<typeof liveSessionInputSchema>;
export type LiveSessionUpdate = z.infer<typeof liveSessionUpdateSchema>;

// Session Materials (Tutor Portal Phase 4, founder-approved 2026-07-31) —
// link-based, not a file upload (see modules/live-sessions/repository.ts).
// A material is either a shared link or an uploaded file, never both — the
// DB enforces it (chk_session_materials_link_xor_file, migration
// 202608040049). `kind` is the discriminator the UI switches on so it never
// has to null-check its way to the same conclusion.
export interface SessionMaterial {
  id: string;
  batchId: string;
  liveSessionId: string | null;
  uploadedByTutorId: string | null;
  uploadedByStaffId: string | null;
  title: string;
  kind: 'link' | 'file';
  link: string | null;
  // File-backed materials only. `filePath` is an R2 object key and is
  // deliberately NOT part of this type — it never leaves the server; the
  // client asks for a short-lived presigned URL by material id instead.
  fileName: string | null;
  fileSizeBytes: number | null;
  contentType: string | null;
  createdAt: string;
}

export const addSessionMaterialSchema = z.object({
  batchId: z.uuid(),
  liveSessionId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  link: z.url().max(2000),
});
export type AddSessionMaterialInput = z.infer<typeof addSessionMaterialSchema>;

// The multipart counterpart — same fields minus `link`, since the file
// itself arrives as a separate form field and is parsed by lib/uploads.ts.
export const uploadSessionMaterialSchema = z.object({
  batchId: z.uuid(),
  liveSessionId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
});
export type UploadSessionMaterialInput = z.infer<typeof uploadSessionMaterialSchema>;