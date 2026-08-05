import { z } from 'zod';

// Assignments and student submissions (founder-requested 2026-08-04).
//
// This is its own module rather than part of modules/live-sessions because
// Document 14 §3 states live-sessions "must not directly change payment
// status, registration status, certificates, or grades" — a grade write is
// exactly what reviewing a submission does.
//
// Deliberately NOT an LMS gradebook (see PRD §9 and the migration header):
// one current submission per Registration per Assignment, an optional 0–100
// grade, and no link to certificates, attendance, or completion rules.

export type AssignmentStatus = 'open' | 'closed';
export type AssignmentSubmissionStatus = 'submitted' | 'reviewed';

export interface Assignment {
  id: string;
  batchId: string;
  liveSessionId: string | null;
  title: string;
  instructions: string | null;
  dueAt: string | null;
  status: AssignmentStatus;
  allowResubmission: boolean;
  createdByTutorId: string | null;
  createdByStaffId: string | null;
  createdAt: string;
}

// Tutor/staff list view — the counts save the caller from fetching every
// submission just to render "3 of 12 reviewed".
export interface AssignmentWithStats extends Assignment {
  submissionCount: number;
  reviewedCount: number;
}

// `filePath` (the R2 object key) is deliberately absent from every exported
// shape — it never leaves the server. Clients request a short-lived
// presigned URL by submission id instead.
export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  registrationId: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  participantNotes: string | null;
  submittedAt: string;
  status: AssignmentSubmissionStatus;
  grade: number | null;
  feedback: string | null;
  reviewedByTutorId: string | null;
  reviewedByStaffId: string | null;
  reviewedAt: string | null;
}

// What a student sees: the assignment plus their own submission, if any.
// Never another learner's (Document 14 §6: a Student cannot "view another
// learner's link, attendance, or materials").
export interface StudentAssignment extends Assignment {
  mySubmission: AssignmentSubmission | null;
}

export const createAssignmentSchema = z.object({
  batchId: z.uuid(),
  liveSessionId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(200),
  instructions: z.string().trim().max(5000).nullable().optional(),
  // ISO-8601; the UI sends a datetime-local value converted to UTC.
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  allowResubmission: z.boolean().optional(),
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  instructions: z.string().trim().max(5000).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(['open', 'closed']).optional(),
  allowResubmission: z.boolean().optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

// The file itself arrives as a separate multipart field and is parsed by
// lib/uploads.ts, same split as uploadSessionMaterialSchema.
export const submitAssignmentSchema = z.object({
  assignmentId: z.uuid(),
  registrationId: z.uuid(),
  participantNotes: z.string().trim().max(1000).nullable().optional(),
});
export type SubmitAssignmentInput = z.infer<typeof submitAssignmentSchema>;

export const reviewSubmissionSchema = z
  .object({
    grade: z.coerce.number().min(0).max(100).nullable().optional(),
    feedback: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((input) => input.grade !== undefined || input.feedback !== undefined, {
    message: 'Give a grade, written feedback, or both.',
  });
export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

// Same ceiling as learning-resource uploads — a submission is just another
// document, and two different limits would only surprise people.
export { UPLOAD_MAX_BYTES as ASSIGNMENT_FILE_MAX_BYTES } from '@/lib/upload-constants';
