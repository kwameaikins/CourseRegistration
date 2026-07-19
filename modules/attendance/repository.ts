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

// email (lowercased) -> registration_id for every non-deleted participant
// registered on this Batch.
export async function selectRegistrationEmailMap(
  batchId: string,
): Promise<Map<string, string>> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id, participant_id')
    .eq('batch_id', batchId);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return new Map();

  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, email, deleted_at')
    .in('id', registrations.map((r) => r.participant_id));
  if (participantsError) throw participantsError;

  const registrationByParticipant = new Map(
    registrations.map((r) => [r.participant_id, r.id]),
  );
  const map = new Map<string, string>();
  for (const participant of participants ?? []) {
    if (participant.deleted_at) continue;
    const registrationId = registrationByParticipant.get(participant.id);
    if (registrationId) map.set(participant.email.toLowerCase(), registrationId);
  }
  return map;
}

export async function upsertAttendance(row: {
  registration_id: string;
  session_date: string;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('attendance')
    .upsert(row, { onConflict: 'registration_id,session_date' });
  if (error) throw error;
}

// Staff-facing read (RLS enforces admin/management) with participant names
// resolved for display.
export async function selectAttendanceForBatch(batchId: string): Promise<
  Array<AttendanceRow & { participant_name: string; participant_email: string }>
> {
  const supabase = await createSupabaseServerClient();
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
