import { AppError } from '@/lib/errors';
import { enableCloudRecording, isZoomConfigured } from '@/lib/zoom/client';
import * as r2Client from '@/lib/r2/client';
import { learningResourceKey } from '@/lib/r2/keys';
import type { ParsedUpload } from '@/lib/uploads';
import type { Database } from '@/lib/supabase/database.types';
import * as liveSessionsRepository from '@/modules/live-sessions/repository';
import { defaultSessionTitle, generateSchedule } from '@/modules/live-sessions/schedule';
import * as usersService from '@/modules/users/service';
import type {
  LiveSession,
  LiveSessionInput,
  LiveSessionStatus,
  LiveSessionUpdate,
  SessionMaterial,
} from '@/modules/live-sessions/types';

// --- Generated schedules (founder direction 2026-08-08) ---
//
// A cohort's sessions are derived from its batch, not typed in one at a
// time. See modules/live-sessions/schedule.ts for why, and for the calendar
// arithmetic itself.

export interface ScheduleSyncResult {
  batchId: string;
  generated: number;
  created: number;
  skipped: 'no_schedule' | null;
}

// Brings a batch's generated sessions in line with its schedule. Safe to call
// repeatedly: the unique (batch_id, starts_at) constraint added in
// 202608080058 absorbs sessions that already exist, so a schedule edit adds
// what is new and leaves any title, agenda or tutor a human has since set
// completely alone.
//
// Never throws for a batch that simply has no schedule — batches created
// before end_time and meeting_days existed are a normal state, and this is
// called opportunistically from batch creation.
export async function syncGeneratedSessionsForBatchSystem(
  batchId: string,
): Promise<ScheduleSyncResult> {
  const batch = await liveSessionsRepository.selectBatchScheduleSystem(batchId);
  if (!batch) return { batchId, generated: 0, created: 0, skipped: 'no_schedule' };

  const sessions = generateSchedule({
    startDate: batch.startDate,
    endDate: batch.endDate,
    startTime: batch.startTime,
    endTime: batch.endTime,
    meetingDays: batch.meetingDays,
  });
  if (sessions.length === 0) {
    return { batchId, generated: 0, created: 0, skipped: 'no_schedule' };
  }

  const created = await liveSessionsRepository.upsertGeneratedSessionsSystem(
    sessions.map((session) => ({
      batch_id: batchId,
      title: defaultSessionTitle(batch.courseName, session.sessionNumber),
      starts_at: session.startsAt,
      ends_at: session.endsAt,
      timezone: 'Africa/Accra',
      // The batch's classroom meeting. Since 202608080056 a scheduled batch
      // gets its own type 8 recurring meeting whose occurrences line up with
      // exactly these sessions, so one meeting id serves them all.
      zoom_meeting_id: batch.zoomMeetingId,
      status: 'scheduled',
    })),
  );

  return { batchId, generated: sessions.length, created, skipped: null };
}

// Backfill across every batch — the one-off that gives the five cohorts with
// no sessions a schedule, and with it a working "Next Class" card.
export async function backfillGeneratedSessions(): Promise<{
  batchesEvaluated: number;
  batchesScheduled: number;
  sessionsCreated: number;
  errors: string[];
}> {
  await usersService.requireRole(['admin']);
  const batchIds = await liveSessionsRepository.selectBatchIdsSystem();
  const summary = {
    batchesEvaluated: 0,
    batchesScheduled: 0,
    sessionsCreated: 0,
    errors: [] as string[],
  };

  for (const batchId of batchIds) {
    summary.batchesEvaluated += 1;
    try {
      const result = await syncGeneratedSessionsForBatchSystem(batchId);
      if (result.created > 0) {
        summary.batchesScheduled += 1;
        summary.sessionsCreated += result.created;
      }
    } catch (err) {
      summary.errors.push(`${batchId}: ${String(err)}`);
    }
  }
  return summary;
}

// Turns on cloud recording for every classroom meeting that already exists
// (founder direction 2026-08-08).
//
// Changing the two meeting creators only affects meetings made from now on.
// The rooms currently teaching cohorts were all created without
// auto_recording, so without this they would never record and the recap
// agent would have nothing to read for any course now running.
//
// Idempotent: setting auto_recording on a meeting that already has it is a
// no-op at Zoom's end, so this can be re-run freely.
export async function enableCloudRecordingOnExistingMeetings(): Promise<{
  meetingsEvaluated: number;
  meetingsUpdated: number;
  errors: string[];
}> {
  await usersService.requireRole(['admin']);
  const summary = { meetingsEvaluated: 0, meetingsUpdated: 0, errors: [] as string[] };
  if (!isZoomConfigured()) return summary;

  const meetingIds = await liveSessionsRepository.selectAllZoomMeetingIdsSystem();
  for (const meetingId of meetingIds) {
    summary.meetingsEvaluated += 1;
    try {
      await enableCloudRecording(meetingId);
      summary.meetingsUpdated += 1;
    } catch (err) {
      // One meeting failing (deleted at Zoom's end, or an account without
      // cloud recording) must not stop the rest being updated.
      summary.errors.push(`${meetingId}: ${String(err)}`);
    }
  }
  return summary;
}

const STATUS_TRANSITIONS: Record<LiveSessionStatus, LiveSessionStatus[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['ready', 'cancelled', 'rescheduled'],
  ready: ['live', 'cancelled', 'rescheduled'],
  live: ['completed'],
  completed: ['archived'],
  cancelled: ['archived'],
  rescheduled: ['archived'],
  archived: [],
};

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];

function toLiveSession(row: LiveSessionRow): LiveSession {
  return {
    id: row.id,
    batchId: row.batch_id,
    tutorStaffId: row.tutor_staff_id,
    tutorId: row.tutor_id,
    title: row.title,
    agenda: row.agenda,
    learningOutcomes: row.learning_outcomes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    provider: 'zoom',
    zoomMeetingId: row.zoom_meeting_id,
    status: row.status as LiveSessionStatus,
    statusReason: row.status_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getLiveSessions(): Promise<LiveSession[]> {
  const rows = await liveSessionsRepository.selectLiveSessions();
  return rows.map(toLiveSession);
}

export async function createLiveSession(
  input: LiveSessionInput,
  actorStaffId: string,
): Promise<LiveSession> {
  const row = await liveSessionsRepository.insertLiveSession({
    batch_id: input.batchId,
    tutor_staff_id: input.tutorStaffId ?? null,
    tutor_id: input.tutorId ?? null,
    title: input.title,
    agenda: input.agenda ?? null,
    learning_outcomes: input.learningOutcomes ?? null,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    timezone: input.timezone,
    status: input.status,
    created_by: actorStaffId,
    updated_by: actorStaffId,
  });
  await liveSessionsRepository.insertLiveSessionAuditEvent({
    live_session_id: row.id,
    event_type: 'created',
    actor_staff_id: actorStaffId,
    details: { status: row.status },
  });
  return toLiveSession(row);
}

export async function updateLiveSession(
  id: string,
  input: LiveSessionUpdate,
  actorStaffId: string,
): Promise<LiveSession> {
  const existing = await liveSessionsRepository.selectLiveSessionById(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Live session not found.', 404);
  }

  const startsAt = input.startsAt ?? existing.starts_at;
  const endsAt = input.endsAt ?? existing.ends_at;
  if (new Date(endsAt) <= new Date(startsAt)) {
    throw new AppError('VALIDATION_ERROR', 'End time must be after start time.', 400);
  }

  if (input.status && input.status !== existing.status) {
    const currentStatus = existing.status as LiveSessionStatus;
    if (!STATUS_TRANSITIONS[currentStatus].includes(input.status)) {
      throw new AppError(
        'INVALID_STATUS_TRANSITION',
        `A ${currentStatus} session cannot move directly to ${input.status}.`,
        409,
      );
    }
    if ((input.status === 'cancelled' || input.status === 'rescheduled') && !input.statusReason) {
      throw new AppError(
        'VALIDATION_ERROR',
        'A reason is required when cancelling or rescheduling a session.',
        400,
      );
    }
  }

  const row = await liveSessionsRepository.updateLiveSessionById(id, {
    ...(input.tutorStaffId !== undefined && { tutor_staff_id: input.tutorStaffId }),
    ...(input.tutorId !== undefined && { tutor_id: input.tutorId }),
    ...(input.title !== undefined && { title: input.title }),
    ...(input.agenda !== undefined && { agenda: input.agenda }),
    ...(input.learningOutcomes !== undefined && { learning_outcomes: input.learningOutcomes }),
    ...(input.startsAt !== undefined && { starts_at: input.startsAt }),
    ...(input.endsAt !== undefined && { ends_at: input.endsAt }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.statusReason !== undefined && { status_reason: input.statusReason }),
    updated_by: actorStaffId,
    updated_at: new Date().toISOString(),
  });

  const statusChanged = input.status !== undefined && input.status !== existing.status;
  await liveSessionsRepository.insertLiveSessionAuditEvent({
    live_session_id: id,
    event_type: statusChanged ? 'status_changed' : 'updated',
    actor_staff_id: actorStaffId,
    reason: input.statusReason ?? null,
    details: statusChanged
      ? { fromStatus: existing.status, toStatus: input.status! }
      : { updatedFields: Object.keys(input).filter((key) => key !== 'statusReason') },
  });
  return toLiveSession(row);
}

// --- Session Materials (Tutor Portal Phase 4, founder-approved 2026-07-31;
// file uploads added 2026-08-04) ---
// A material is either a shared link or a file uploaded to Cloudflare R2.

function toSessionMaterial(
  row: Database['public']['Tables']['session_materials']['Row'],
): SessionMaterial {
  return {
    id: row.id,
    batchId: row.batch_id,
    liveSessionId: row.live_session_id,
    uploadedByTutorId: row.uploaded_by_tutor_id,
    uploadedByStaffId: row.uploaded_by_staff_id,
    title: row.title,
    kind: row.file_path ? 'file' : 'link',
    link: row.link,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    contentType: row.content_type,
    createdAt: row.created_at,
  };
}

// Called only by modules/tutors, after it has verified the batch belongs
// to the calling tutor's own session.
export async function addSessionMaterial(input: {
  batchId: string;
  liveSessionId: string | null;
  uploadedByTutorId: string;
  title: string;
  link: string;
}): Promise<SessionMaterial> {
  const row = await liveSessionsRepository.insertSessionMaterialSystem({
    batch_id: input.batchId,
    live_session_id: input.liveSessionId,
    uploaded_by_tutor_id: input.uploadedByTutorId,
    title: input.title,
    link: input.link,
  });
  return toSessionMaterial(row);
}

// File-upload counterpart of addSessionMaterial. Uploads to R2 first, then
// inserts — an orphaned R2 object on a failed insert is harmless (it is
// unreferenced and invisible), whereas a row pointing at a key that was
// never written would render as a permanently broken download.
//
// Callers: modules/tutors (tutor portal, after requireOwnBatch) and the
// staff /live-sessions route (after its own admin role gate). Exactly one of
// uploadedByTutorId/uploadedByStaffId is set, mirroring the two authorship
// columns on the table.
export async function uploadSessionMaterialFile(input: {
  batchId: string;
  liveSessionId: string | null;
  uploadedByTutorId?: string;
  uploadedByStaffId?: string;
  title: string;
  file: ParsedUpload;
}): Promise<SessionMaterial> {
  if (!r2Client.isR2Configured()) {
    throw new AppError(
      'VALIDATION_ERROR',
      'File uploads are not available right now — share a link instead, or contact us.',
      400,
    );
  }

  const filePath = learningResourceKey(input.batchId, input.file.extension);
  await r2Client.uploadObject({
    key: filePath,
    body: input.file.buffer,
    contentType: input.file.contentType,
  });

  const row = await liveSessionsRepository.insertSessionMaterialSystem({
    batch_id: input.batchId,
    live_session_id: input.liveSessionId,
    uploaded_by_tutor_id: input.uploadedByTutorId ?? null,
    uploaded_by_staff_id: input.uploadedByStaffId ?? null,
    title: input.title,
    link: null,
    file_path: filePath,
    file_name: input.file.fileName,
    file_size_bytes: input.file.sizeBytes,
    content_type: input.file.contentType,
  });
  return toSessionMaterial(row);
}

// The owning batch of a material, so a caller can authorize BEFORE anything is
// signed (2026-08-13).
//
// getSessionMaterialDownloadUrlSystem's contract says the caller must authorize
// the material's batch first — but it was the only way to learn which batch
// that was, so both callers necessarily minted a presigned URL and then decided
// whether the caller was allowed it. Nothing leaked (each threw before
// returning), but "sign first, authorize second" is one stray log line or
// refactor away from leaking, and the documented contract was unsatisfiable as
// written. This makes it satisfiable.
export async function getSessionMaterialBatchIdSystem(id: string): Promise<string> {
  const existing = await liveSessionsRepository.selectSessionMaterialByIdSystem(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Material not found.', 404);
  }
  return existing.batch_id;
}

// Short-lived presigned GET URL for a file-backed material, same pattern as
// the payment slip's. The caller is responsible for authorizing access to
// the material's batch BEFORE calling this (see
// getSessionMaterialBatchIdSystem above) — this function only resolves the
// key, it has no session context of its own.
export async function getSessionMaterialDownloadUrlSystem(
  id: string,
): Promise<{ url: string; batchId: string; fileName: string }> {
  const existing = await liveSessionsRepository.selectSessionMaterialByIdSystem(id);
  if (!existing || !existing.file_path) {
    throw new AppError('NOT_FOUND', 'Material not found.', 404);
  }
  if (!r2Client.isR2Configured()) {
    throw new AppError('VALIDATION_ERROR', 'File downloads are not available right now.', 400);
  }
  const url = await r2Client.getSignedDownloadUrl(existing.file_path);
  return { url, batchId: existing.batch_id, fileName: existing.file_name ?? 'download' };
}

// Only the uploading tutor may remove their own material. Staff removal goes
// through removeSessionMaterialAsStaff below.
export async function removeSessionMaterial(id: string, requestingTutorId: string): Promise<void> {
  const existing = await liveSessionsRepository.selectSessionMaterialByIdSystem(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Material not found.', 404);
  }
  if (existing.uploaded_by_tutor_id !== requestingTutorId) {
    throw new AppError('FORBIDDEN', 'You can only remove materials you added.', 403);
  }
  await liveSessionsRepository.deleteSessionMaterialSystem(id);
}

// Admin can remove any material on any batch, including a tutor's — the
// same admin-overrides-everything posture the /live-sessions screen already
// has for sessions themselves. The R2 object is left in place deliberately:
// the bucket is private, orphans cost effectively nothing at this scale, and
// a delete that half-succeeds is worse than a tidy one that never runs.
export async function removeSessionMaterialAsStaff(id: string): Promise<void> {
  await usersService.requireRole(['admin']);
  const existing = await liveSessionsRepository.selectSessionMaterialByIdSystem(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Material not found.', 404);
  }
  await liveSessionsRepository.deleteSessionMaterialSystem(id);
}

// Used by the tutor portal and the student portal — both non-staff
// contexts, hence the service-role-backed system read.
export async function getSessionMaterialsForBatchSystem(batchId: string): Promise<SessionMaterial[]> {
  const rows = await liveSessionsRepository.selectSessionMaterialsForBatchSystem(batchId);
  return rows.map(toSessionMaterial);
}

// Staff-facing read (RLS enforces admin/management, matching /live-sessions).
export async function getSessionMaterialsForBatch(batchId: string): Promise<SessionMaterial[]> {
  await usersService.requireRole(['admin', 'management']);
  const rows = await liveSessionsRepository.selectSessionMaterialsForBatch(batchId);
  return rows.map(toSessionMaterial);
}

// --- Staff-authored materials (founder-requested 2026-08-04: "tutors or
// admin should be able to upload learning resources"). Admin only — the
// same write/read split /live-sessions already has, where management reads
// but does not author. ---

export async function addSessionMaterialAsStaff(input: {
  batchId: string;
  liveSessionId: string | null;
  title: string;
  link: string;
}): Promise<SessionMaterial> {
  const staffUser = await usersService.requireRole(['admin']);
  const row = await liveSessionsRepository.insertSessionMaterialSystem({
    batch_id: input.batchId,
    live_session_id: input.liveSessionId,
    uploaded_by_staff_id: staffUser.id,
    title: input.title,
    link: input.link,
  });
  return toSessionMaterial(row);
}

export async function uploadSessionMaterialFileAsStaff(input: {
  batchId: string;
  liveSessionId: string | null;
  title: string;
  file: ParsedUpload;
}): Promise<SessionMaterial> {
  const staffUser = await usersService.requireRole(['admin']);
  return uploadSessionMaterialFile({ ...input, uploadedByStaffId: staffUser.id });
}

// Staff download of any material on any batch — admin/management, matching
// the read gate on getSessionMaterialsForBatch above.
export async function getSessionMaterialDownloadUrlAsStaff(id: string): Promise<string> {
  await usersService.requireRole(['admin', 'management']);
  const material = await getSessionMaterialDownloadUrlSystem(id);
  return material.url;
}