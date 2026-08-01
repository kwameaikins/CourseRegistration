import { AppError } from '@/lib/errors';
import type { Database } from '@/lib/supabase/database.types';
import * as liveSessionsRepository from '@/modules/live-sessions/repository';
import * as usersService from '@/modules/users/service';
import type {
  LiveSession,
  LiveSessionInput,
  LiveSessionStatus,
  LiveSessionUpdate,
  SessionMaterial,
} from '@/modules/live-sessions/types';

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

// --- Session Materials (Tutor Portal Phase 4, founder-approved 2026-07-31) ---
// Link-based (no file storage — see repository.ts header comment).

function toSessionMaterial(
  row: Database['public']['Tables']['session_materials']['Row'],
): SessionMaterial {
  return {
    id: row.id,
    batchId: row.batch_id,
    liveSessionId: row.live_session_id,
    uploadedByTutorId: row.uploaded_by_tutor_id,
    title: row.title,
    link: row.link,
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

// Only the uploading tutor may remove their own material.
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