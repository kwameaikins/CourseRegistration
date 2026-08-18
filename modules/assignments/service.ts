// Assignments and student submissions (founder-requested 2026-08-04).
//
// Scope note, per CLAUDE.md rule 10: PRD §9 lists course content delivery as
// out of scope ("not an LMS") and Document 14 §6 gives the Student role no
// submit capability. This module was built at the founder's explicit request
// on 2026-08-04 in the codebase's existing "submitter-raised row, reviewer
// acts on it" shape (attendance_exceptions, payment_submissions), NOT as a
// general gradebook. Nothing here writes to certificates, attendance,
// payments, or registration status.
//
// Authorization: this module has no session gate of its own. Every function
// is a ...System variant called only after the caller has established
// ownership — modules/tutors' requireOwnBatch for tutors, modules/portal's
// registration-ownership check for students, and usersService.requireRole on
// the staff routes. Same posture as attendance's raiseAttendanceException.
import { AppError } from '@/lib/errors';
import * as r2Client from '@/lib/r2/client';
import { assignmentSubmissionKey } from '@/lib/r2/keys';
import type { ParsedUpload } from '@/lib/uploads';
import type { Database } from '@/lib/supabase/database.types';
import * as assignmentsRepository from '@/modules/assignments/repository';
import * as usersService from '@/modules/users/service';
import type {
  Assignment,
  AssignmentStatus,
  AssignmentSubmission,
  AssignmentSubmissionStatus,
  AssignmentWithStats,
  CreateAssignmentInput,
  ReviewSubmissionInput,
  StudentAssignment,
  UpdateAssignmentInput,
} from '@/modules/assignments/types';

type AssignmentRow = Database['public']['Tables']['assignments']['Row'];
type SubmissionRow = Database['public']['Tables']['assignment_submissions']['Row'];

function toAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    batchId: row.batch_id,
    liveSessionId: row.live_session_id,
    title: row.title,
    instructions: row.instructions,
    dueAt: row.due_at,
    status: row.status as AssignmentStatus,
    allowResubmission: row.allow_resubmission,
    createdByTutorId: row.created_by_tutor_id,
    createdByStaffId: row.created_by_staff_id,
    createdAt: row.created_at,
  };
}

function toSubmission(row: SubmissionRow): AssignmentSubmission {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    registrationId: row.registration_id,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    contentType: row.content_type,
    participantNotes: row.participant_notes,
    submittedAt: row.submitted_at,
    status: row.status as AssignmentSubmissionStatus,
    // numeric(5,2) comes back as a string over PostgREST on some driver
    // versions; normalize so callers never have to guess.
    grade: row.grade === null ? null : Number(row.grade),
    feedback: row.feedback,
    reviewedByTutorId: row.reviewed_by_tutor_id,
    reviewedByStaffId: row.reviewed_by_staff_id,
    reviewedAt: row.reviewed_at,
  };
}

// --- Assignment authoring (tutor portal + staff /live-sessions) ---

export async function createAssignmentSystem(
  input: CreateAssignmentInput,
  author: { tutorId?: string; staffId?: string },
): Promise<Assignment> {
  const row = await assignmentsRepository.insertAssignmentSystem({
    batch_id: input.batchId,
    live_session_id: input.liveSessionId ?? null,
    title: input.title,
    instructions: input.instructions ?? null,
    due_at: input.dueAt ?? null,
    allow_resubmission: input.allowResubmission ?? true,
    created_by_tutor_id: author.tutorId ?? null,
    created_by_staff_id: author.staffId ?? null,
  });
  return toAssignment(row);
}

export async function getAssignmentByIdSystem(id: string): Promise<Assignment> {
  const row = await assignmentsRepository.selectAssignmentByIdSystem(id);
  if (!row) throw new AppError('NOT_FOUND', 'Assignment not found.', 404);
  return toAssignment(row);
}

export async function updateAssignmentSystem(
  id: string,
  input: UpdateAssignmentInput,
): Promise<Assignment> {
  const row = await assignmentsRepository.updateAssignmentSystem(id, {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.instructions !== undefined && { instructions: input.instructions }),
    ...(input.dueAt !== undefined && { due_at: input.dueAt }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.allowResubmission !== undefined && { allow_resubmission: input.allowResubmission }),
  });
  return toAssignment(row);
}

// Deleting cascades to every submission (FK on delete cascade). Callers
// surface a confirmation; there is no soft-delete here because an assignment
// is authored content, not a participant record under DPA retention rules.
export async function deleteAssignmentSystem(id: string): Promise<void> {
  await assignmentsRepository.deleteAssignmentSystem(id);
}

export async function getAssignmentsForBatchSystem(
  batchId: string,
): Promise<AssignmentWithStats[]> {
  const rows = await assignmentsRepository.selectAssignmentsForBatchSystem(batchId);
  const submissions = await assignmentsRepository.selectSubmissionsForAssignmentIdsSystem(
    rows.map((row) => row.id),
  );

  const statsByAssignment = new Map<string, { total: number; reviewed: number }>();
  for (const submission of submissions) {
    const stats = statsByAssignment.get(submission.assignment_id) ?? { total: 0, reviewed: 0 };
    stats.total += 1;
    if (submission.status === 'reviewed') stats.reviewed += 1;
    statsByAssignment.set(submission.assignment_id, stats);
  }

  return rows.map((row) => {
    const stats = statsByAssignment.get(row.id);
    return {
      ...toAssignment(row),
      submissionCount: stats?.total ?? 0,
      reviewedCount: stats?.reviewed ?? 0,
    };
  });
}

// Certificate gating (BR-46, 2026-08-18). Which registrations on this batch
// have submitted at least one assignment.
//
// This is the one deliberate link between assignments and completion rules —
// the module header says it is NOT a gradebook and has "no link to
// certificates", which held until the founder asked for exactly that. It is
// kept as narrow as possible: a boolean per registration, derived here, with
// modules/certificates reading it through this function rather than touching
// assignment_submissions. No grade is consulted, so a certificate never waits
// on tutor marking turnaround.
//
// Returns the ids that HAVE submitted; absence means no submission.
export async function getRegistrationIdsWithSubmissionsForBatchSystem(
  batchId: string,
): Promise<Set<string>> {
  const assignments = await assignmentsRepository.selectAssignmentsForBatchSystem(batchId);
  if (assignments.length === 0) return new Set();
  const submissions = await assignmentsRepository.selectSubmissionsForAssignmentIdsSystem(
    assignments.map((row) => row.id),
  );
  return new Set(submissions.map((row) => row.registration_id));
}

// Staff-facing read (RLS enforces admin/management, matching /live-sessions).
// Stats still come from the service-role read: the submissions table's own
// RLS grants management SELECT, but admin-vs-management divergence here would
// make the counts silently wrong for one role rather than the other.
export async function getAssignmentsForBatch(batchId: string): Promise<AssignmentWithStats[]> {
  await usersService.requireRole(['admin', 'management']);
  const rows = await assignmentsRepository.selectAssignmentsForBatch(batchId);
  const submissions = await assignmentsRepository.selectSubmissionsForAssignmentIdsSystem(
    rows.map((row) => row.id),
  );
  const statsByAssignment = new Map<string, { total: number; reviewed: number }>();
  for (const submission of submissions) {
    const stats = statsByAssignment.get(submission.assignment_id) ?? { total: 0, reviewed: 0 };
    stats.total += 1;
    if (submission.status === 'reviewed') stats.reviewed += 1;
    statsByAssignment.set(submission.assignment_id, stats);
  }
  return rows.map((row) => {
    const stats = statsByAssignment.get(row.id);
    return {
      ...toAssignment(row),
      submissionCount: stats?.total ?? 0,
      reviewedCount: stats?.reviewed ?? 0,
    };
  });
}

// Keyed by registrationId, with no participant identity attached —
// modules/assignments must not read the participants/registrations tables
// (module boundary rule). The tutor portal merges these against the roster
// it already fetches from its own repository.
export async function getSubmissionsForAssignmentSystem(
  assignmentId: string,
): Promise<AssignmentSubmission[]> {
  const rows = await assignmentsRepository.selectSubmissionsForAssignmentSystem(assignmentId);
  return rows.map(toSubmission);
}

// --- Student submission ---

export async function submitAssignmentSystem(input: {
  assignmentId: string;
  registrationId: string;
  participantNotes: string | null;
  file: ParsedUpload;
}): Promise<AssignmentSubmission> {
  const assignment = await assignmentsRepository.selectAssignmentByIdSystem(input.assignmentId);
  if (!assignment) throw new AppError('NOT_FOUND', 'Assignment not found.', 404);

  if (assignment.status === 'closed') {
    throw new AppError('CONFLICT', 'This assignment is closed for submissions.', 409);
  }

  const existing = (
    await assignmentsRepository.selectSubmissionsForRegistrationSystem(input.registrationId, [
      input.assignmentId,
    ])
  )[0];
  if (existing && !assignment.allow_resubmission) {
    throw new AppError(
      'CONFLICT',
      'You have already submitted this assignment, and resubmission is not allowed.',
      409,
    );
  }

  if (!r2Client.isR2Configured()) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Submissions are not available right now — please contact us.',
      400,
    );
  }

  // Upload before the row is written: an orphaned R2 object is invisible and
  // harmless, whereas a row pointing at a key that was never written would be
  // a permanently broken download for the tutor.
  const filePath = assignmentSubmissionKey(
    input.assignmentId,
    input.registrationId,
    input.file.extension,
  );
  await r2Client.uploadObject({
    key: filePath,
    body: input.file.buffer,
    contentType: input.file.contentType,
  });

  // A resubmission replaces the file AND clears any prior review — a grade
  // given against the old file must never appear to apply to the new one.
  const row = await assignmentsRepository.upsertSubmissionSystem({
    ...(existing ? { id: existing.id } : {}),
    assignment_id: input.assignmentId,
    registration_id: input.registrationId,
    file_path: filePath,
    file_name: input.file.fileName,
    file_size_bytes: input.file.sizeBytes,
    content_type: input.file.contentType,
    participant_notes: input.participantNotes,
    submitted_at: new Date().toISOString(),
    status: 'submitted',
    grade: null,
    feedback: null,
    reviewed_by_tutor_id: null,
    reviewed_by_staff_id: null,
    reviewed_at: null,
  });
  return toSubmission(row);
}

// The student portal's read: every assignment on this batch, each with only
// this registration's own submission attached.
export async function getAssignmentsForRegistrationSystem(
  batchId: string,
  registrationId: string,
): Promise<StudentAssignment[]> {
  const rows = await assignmentsRepository.selectAssignmentsForBatchSystem(batchId);
  const submissions = await assignmentsRepository.selectSubmissionsForRegistrationSystem(
    registrationId,
    rows.map((row) => row.id),
  );
  const byAssignment = new Map(submissions.map((row) => [row.assignment_id, toSubmission(row)]));
  return rows.map((row) => ({
    ...toAssignment(row),
    mySubmission: byAssignment.get(row.id) ?? null,
  }));
}

// Ownership lookup for callers holding only a submission id: resolve which
// assignment (and therefore which batch) it belongs to, so they can run their
// own authorization before acting. Deliberately separate from
// getSubmissionDownloadUrlSystem so an authorization check never has to mint
// a presigned URL as a side effect.
export async function getSubmissionByIdSystem(
  submissionId: string,
): Promise<AssignmentSubmission> {
  const row = await assignmentsRepository.selectSubmissionByIdSystem(submissionId);
  if (!row) throw new AppError('NOT_FOUND', 'Submission not found.', 404);
  return toSubmission(row);
}

// --- Review (tutor or staff) ---

export async function reviewSubmissionSystem(
  submissionId: string,
  input: ReviewSubmissionInput,
  reviewer: { tutorId?: string; staffId?: string },
): Promise<AssignmentSubmission> {
  const row = await assignmentsRepository.updateSubmissionSystem(submissionId, {
    status: 'reviewed',
    ...(input.grade !== undefined && { grade: input.grade }),
    ...(input.feedback !== undefined && { feedback: input.feedback }),
    reviewed_by_tutor_id: reviewer.tutorId ?? null,
    reviewed_by_staff_id: reviewer.staffId ?? null,
    reviewed_at: new Date().toISOString(),
  });
  return toSubmission(row);
}

// --- Staff-facing wrappers (/live-sessions screen) ---
//
// Authoring is admin-only and reading is admin/management, exactly matching
// the split session materials already use on the same screen. These are the
// only functions in this module that gate internally — everything above is
// called by a portal that has already established its own ownership.

export async function createAssignmentAsStaff(input: CreateAssignmentInput): Promise<Assignment> {
  const staffUser = await usersService.requireRole(['admin']);
  return createAssignmentSystem(input, { staffId: staffUser.id });
}

export async function updateAssignmentAsStaff(
  id: string,
  input: UpdateAssignmentInput,
): Promise<Assignment> {
  await usersService.requireRole(['admin']);
  return updateAssignmentSystem(id, input);
}

export async function deleteAssignmentAsStaff(id: string): Promise<void> {
  await usersService.requireRole(['admin']);
  return deleteAssignmentSystem(id);
}

// Deliberately NOT exposed to staff: reading and grading individual
// submissions. Document 14 §6 makes marking a tutor responsibility, and
// staff would need learner names merged in — which this module cannot do
// (it must not read the participants/registrations tables) and which
// registrationsService.listRegistrations cannot supply either, since its
// role gate excludes 'management' and it is paginated. Staff see submission
// and review counts on each assignment; the tutor portal is the grading
// surface. `assignment_submissions` also carries an admin-full RLS policy,
// so genuine ad-hoc investigation is possible directly against the table.
//
// The two reviewer columns on the table (reviewed_by_tutor_id and
// reviewed_by_staff_id) are both kept so this can be added later without a
// migration; only the tutor one is written today.

// --- Downloads ---

// Short-lived presigned GET URL, same pattern as the payment slip's. The
// caller authorizes access to the owning assignment/batch BEFORE calling —
// this resolves the key only and carries no session context of its own.
export async function getSubmissionDownloadUrlSystem(
  submissionId: string,
): Promise<{ url: string; assignmentId: string; registrationId: string; fileName: string }> {
  const row = await assignmentsRepository.selectSubmissionByIdSystem(submissionId);
  if (!row) throw new AppError('NOT_FOUND', 'Submission not found.', 404);
  if (!r2Client.isR2Configured()) {
    throw new AppError('VALIDATION_ERROR', 'File downloads are not available right now.', 400);
  }
  const url = await r2Client.getSignedDownloadUrl(row.file_path);
  return {
    url,
    assignmentId: row.assignment_id,
    registrationId: row.registration_id,
    fileName: row.file_name,
  };
}
