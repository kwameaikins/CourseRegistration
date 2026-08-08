// Data access for the attendance module. Runs on the service-role client by
// design (same posture as the communications repository): registration and
// sync happen in webhook/cron contexts where no staff session exists, and
// zoom_registrants/attendance have no staff INSERT policies.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type AttendanceRow = Database['public']['Tables']['attendance']['Row'];

export async function selectZoomContext(registrationId: string): Promise<{
  batchZoomMeetingId: string | null;
  batchIsActive: boolean;
  participantEmail: string;
  participantFirstName: string;
  participantSurname: string;
  participantDeleted: boolean;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('participant_id, batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!registration) return null;

  const [{ data: participant }, { data: batch }] = await Promise.all([
    supabase
      .from('participants')
      .select('email, first_name, surname, full_name, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase
      .from('batches')
      .select('zoom_meeting_id, is_active')
      .eq('id', registration.batch_id)
      .maybeSingle(),
  ]);
  if (!participant || !batch) return null;

  return {
    batchZoomMeetingId: batch.zoom_meeting_id,
    batchIsActive: batch.is_active,
    participantEmail: participant.email,
    participantFirstName: participant.first_name ?? participant.full_name,
    participantSurname: participant.surname ?? '',
    participantDeleted: participant.deleted_at !== null,
  };
}

export async function selectZoomRegistrant(
  registrationId: string,
): Promise<{ join_url: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('zoom_registrants')
    .select('join_url')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertZoomRegistrant(row: {
  registration_id: string;
  zoom_registrant_id: string;
  join_url: string;
}): Promise<'inserted' | 'duplicate'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('zoom_registrants').insert(row);
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'inserted';
}

// Batch transfer support (system review, 2026-07-24) — ensureZoomRegistration
// short-circuits ('already_registered') whenever a zoom_registrants row
// already exists for this registration_id (unique constraint), so a transfer
// clears the old one first. That lets the next ensureZoomRegistration call
// register fresh against whatever Batch's Zoom meeting the registration now
// points at (selectZoomContext always re-reads the current batch_id).
export async function deleteZoomRegistrantByRegistration(
  registrationId: string,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('zoom_registrants')
    .delete()
    .eq('registration_id', registrationId);
  if (error) throw error;
}

// Batches whose Zoom sessions may have run on `dateIso` (course in progress,
// or the day after the last session so the final report is still captured).
export async function selectBatchesForAttendanceSync(dateIso: string): Promise<
  Array<{ id: string; zoom_meeting_id: string }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id, zoom_meeting_id, start_date, end_date')
    .not('zoom_meeting_id', 'is', null)
    .eq('is_active', true)
    .lte('start_date', dateIso);
  if (error) throw error;
  return (data ?? [])
    .filter((batch) => {
      const dayAfterEnd = new Date(new Date(batch.end_date).getTime() + 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return dateIso <= dayAfterEnd;
    })
    .map((batch) => ({ id: batch.id, zoom_meeting_id: batch.zoom_meeting_id! }));
}

// --- Post-course classroom closure (2026-08-08) ---

// Finished batches whose Zoom registrants have not been revoked yet.
//
// `beforeDateIso` is deliberately NOT "yesterday": selectBatchesForAttendanceSync
// above still syncs a batch through end_date + 1 day so the final session's
// report is captured, and that sync matches participants on
// zoom_registrants.zoom_registrant_id. Revoking any earlier would pull the
// match index out from under the last attendance run of the course.
export async function selectBatchesPendingZoomRevocation(
  beforeDateIso: string,
): Promise<Array<{ id: string; zoom_meeting_id: string }>> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id, zoom_meeting_id')
    .not('zoom_meeting_id', 'is', null)
    .is('zoom_access_revoked_at', null)
    .lt('end_date', beforeDateIso);
  if (error) throw error;
  return (data ?? []).map((batch) => ({
    id: batch.id,
    zoom_meeting_id: batch.zoom_meeting_id!,
  }));
}

// Registrant id + the email Zoom keys them by, for every registration in one
// batch that actually has a personal link to revoke.
export async function selectZoomRegistrantsForBatch(
  batchId: string,
): Promise<Array<{ registrationId: string; zoomRegistrantId: string; email: string }>> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id, participant_id')
    .eq('batch_id', batchId);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const registrationIds = registrations.map((row) => row.id);
  const [{ data: registrants, error: registrantsError }, { data: participants, error: participantsError }] =
    await Promise.all([
      supabase
        .from('zoom_registrants')
        .select('registration_id, zoom_registrant_id')
        .in('registration_id', registrationIds),
      supabase
        .from('participants')
        .select('id, email')
        .in('id', [...new Set(registrations.map((row) => row.participant_id))]),
    ]);
  if (registrantsError) throw registrantsError;
  if (participantsError) throw participantsError;

  const emailByParticipant = new Map((participants ?? []).map((row) => [row.id, row.email]));
  const participantByRegistration = new Map(
    registrations.map((row) => [row.id, row.participant_id]),
  );

  return (registrants ?? []).flatMap((registrant) => {
    const participantId = participantByRegistration.get(registrant.registration_id);
    const email = participantId ? emailByParticipant.get(participantId) : undefined;
    if (!email) return [];
    return [
      {
        registrationId: registrant.registration_id,
        zoomRegistrantId: registrant.zoom_registrant_id,
        email,
      },
    ];
  });
}

export async function markBatchZoomRevoked(batchId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('batches')
    .update({ zoom_access_revoked_at: new Date().toISOString() })
    .eq('id', batchId);
  if (error) throw error;
}

export interface RegistrationMatchIndex {
  // Zoom registrant id -> registration_id. Exact, and the only key that
  // survives a participant typing whatever they like into the name box.
  byRegistrantId: Map<string, string>;
  // Registered email (lowercased) -> registration_id.
  byEmail: Map<string, string>;
  // Everyone on the roster, for the display-name fallback in the service.
  roster: Array<{ registrationId: string; name: string }>;
}

// Every key the attendance sync can match a Zoom participant row on, for one
// Batch. Excludes soft-deleted participants.
export async function selectRegistrationMatchIndex(
  batchId: string,
): Promise<RegistrationMatchIndex> {
  const supabase = createSupabaseServiceRoleClient();
  const empty: RegistrationMatchIndex = {
    byRegistrantId: new Map(),
    byEmail: new Map(),
    roster: [],
  };

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id, participant_id')
    .eq('batch_id', batchId);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return empty;

  const registrationIds = registrations.map((r) => r.id);
  const [
    { data: participants, error: participantsError },
    { data: registrants, error: registrantsError },
  ] = await Promise.all([
    supabase
      .from('participants')
      .select('id, email, first_name, middle_name, surname, full_name, deleted_at')
      .in('id', registrations.map((r) => r.participant_id)),
    supabase
      .from('zoom_registrants')
      .select('registration_id, zoom_registrant_id')
      .in('registration_id', registrationIds),
  ]);
  if (participantsError) throw participantsError;
  if (registrantsError) throw registrantsError;

  const registrationByParticipant = new Map(
    registrations.map((r) => [r.participant_id, r.id]),
  );
  const index: RegistrationMatchIndex = {
    byRegistrantId: new Map(
      (registrants ?? []).map((r) => [r.zoom_registrant_id, r.registration_id]),
    ),
    byEmail: new Map(),
    roster: [],
  };
  for (const participant of participants ?? []) {
    if (participant.deleted_at) continue;
    const registrationId = registrationByParticipant.get(participant.id);
    if (!registrationId) continue;
    index.byEmail.set(participant.email.toLowerCase(), registrationId);
    index.roster.push({
      registrationId,
      name:
        [participant.first_name, participant.middle_name, participant.surname]
          .filter(Boolean)
          .join(' ')
          .trim() || (participant.full_name ?? ''),
    });
  }
  return index;
}

export async function upsertAttendance(row: {
  registration_id: string;
  session_date: string;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number;
  session_minutes?: number | null;
  source?: 'zoom_sync' | 'zoom_name_match';
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('attendance')
    .upsert(row, { onConflict: 'registration_id,session_date' });
  if (error) throw error;
}

// Backfill support: a Batch by id regardless of the sync's date window, so a
// session that was missed while the sync was broken can still be recovered
// (selectBatchesForAttendanceSync only ever looks at batches still in
// progress, which silently makes past sessions unrecoverable).
export async function selectBatchForBackfill(
  batchId: string,
): Promise<{ id: string; zoom_meeting_id: string; start_date: string; end_date: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id, zoom_meeting_id, start_date, end_date')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.zoom_meeting_id) return null;
  return { ...data, zoom_meeting_id: data.zoom_meeting_id };
}

// Shared shaping logic for both the staff (RLS) and system (service-role,
// tutor-portal) reads below — same query, different client/auth context.
async function selectAttendanceForBatchWithClient(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | ReturnType<typeof createSupabaseServiceRoleClient>,
  batchId: string,
): Promise<Array<AttendanceRow & { participant_name: string; participant_email: string }>> {
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, participants(full_name, email)')
    .eq('batch_id', batchId);
  if (regError) throw regError;
  if (!registrations || registrations.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('attendance')
    .select('*')
    .in('registration_id', registrations.map((r) => r.id))
    .order('session_date', { ascending: true });
  if (error) throw error;

  const infoByRegistration = new Map(
    registrations.map((r) => {
      const participant = Array.isArray(r.participants) ? r.participants[0] : r.participants;
      return [
        r.id,
        {
          name: (participant as { full_name?: string } | null)?.full_name ?? '',
          email: (participant as { email?: string } | null)?.email ?? '',
        },
      ];
    }),
  );

  return (rows ?? []).map((row) => ({
    ...row,
    participant_name: infoByRegistration.get(row.registration_id)?.name ?? '',
    participant_email: infoByRegistration.get(row.registration_id)?.email ?? '',
  }));
}

// Staff-facing read (RLS enforces admin/management) with participant names
// resolved for display.
export async function selectAttendanceForBatch(batchId: string): Promise<
  Array<AttendanceRow & { participant_name: string; participant_email: string }>
> {
  const supabase = await createSupabaseServerClient();
  return selectAttendanceForBatchWithClient(supabase, batchId);
}

// Tutor-portal read: the tutor-portal session is not a Supabase Auth
// session, so the RLS-gated client above would silently return zero rows
// for these callers (staff_read_attendance is `to authenticated` only).
// Same posture as modules/tutors' `...System` reads and
// modules/certificates' selectBatchIssueContext.
export async function selectAttendanceForBatchSystem(batchId: string): Promise<
  Array<AttendanceRow & { participant_name: string; participant_email: string }>
> {
  const supabase = createSupabaseServiceRoleClient();
  return selectAttendanceForBatchWithClient(supabase, batchId);
}

export async function insertAttendanceExceptionSystem(row: {
  registration_id: string;
  batch_id: string;
  session_date: string;
  exception_type: 'no_show_flag' | 'correction_request';
  raised_by_tutor_id: string;
  requested_present: boolean | null;
  reason: string;
}): Promise<Database['public']['Tables']['attendance_exceptions']['Row']> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('attendance_exceptions')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Staff review (RLS enforces admin/management, same as the /attendance screen).
export async function selectAttendanceExceptions(filters?: { status?: string }): Promise<
  Array<Database['public']['Tables']['attendance_exceptions']['Row']>
> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('attendance_exceptions').select('*').order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function selectAttendanceExceptionById(
  id: string,
): Promise<Database['public']['Tables']['attendance_exceptions']['Row'] | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('attendance_exceptions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateAttendanceExceptionById(
  id: string,
  changes: {
    status: 'approved' | 'rejected';
    reviewed_by: string;
    reviewed_at: string;
    review_note: string | null;
  },
): Promise<Database['public']['Tables']['attendance_exceptions']['Row']> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('attendance_exceptions')
    .update(changes)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Resolves participant name/email for a batch of exception rows — same
// pattern as selectAttendanceForBatch's registration -> participant join,
// used by the staff review screen.
export async function selectParticipantInfoForRegistrations(
  registrationIds: string[],
): Promise<Map<string, { name: string; email: string }>> {
  if (registrationIds.length === 0) return new Map();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('id, participants(full_name, email)')
    .in('id', registrationIds);
  if (error) throw error;
  return new Map(
    (data ?? []).map((r) => {
      const participant = Array.isArray(r.participants) ? r.participants[0] : r.participants;
      return [
        r.id,
        {
          name: (participant as { full_name?: string } | null)?.full_name ?? '',
          email: (participant as { email?: string } | null)?.email ?? '',
        },
      ];
    }),
  );
}

// Applies an approved correction_request to `attendance` — the only
// tutor-adjacent write path that ever touches this table outside the
// nightly Zoom-sync cron (BR-34: the write itself is admin-authorized,
// never a direct tutor write). Marks source = 'manual_correction' so it's
// distinguishable from cron-written rows.
//
// Certificate eligibility counts one row per registration/session_date, so
// marking someone absent must DELETE the row, not zero its duration (a zeroed
// row would still count as attended).
//
// duration_minutes: 1 is a marker, not a measurement — this path has no real
// duration to record. Since 2026-08-06 measured rows must clear
// MIN_ATTENDANCE_RATIO of the session to count, which a 1-minute row never
// would; certificates/repository.ts therefore exempts source =
// 'manual_correction' from that test. session_minutes is left null for the
// same reason: there is nothing here to take a percentage of.
export async function applyManualAttendanceCorrection(row: {
  registration_id: string;
  session_date: string;
  present: boolean;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  if (!row.present) {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('registration_id', row.registration_id)
      .eq('session_date', row.session_date);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('attendance').upsert(
    {
      registration_id: row.registration_id,
      session_date: row.session_date,
      duration_minutes: 1,
      session_minutes: null,
      join_time: null,
      leave_time: null,
      source: 'manual_correction',
    },
    { onConflict: 'registration_id,session_date' },
  );
  if (error) throw error;
}
