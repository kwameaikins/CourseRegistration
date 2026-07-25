// Data access only — business rules live in service.ts (Document 11,
// Section 3). Public joins run on the service-role client (same posture as
// registrations — the anon role has no RLS SELECT/INSERT policy on
// waitlist_entries either); staff reads run on the session client so the
// admin/finance/marketing/management RLS policies apply per role.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type WaitlistRow = Database['public']['Tables']['waitlist_entries']['Row'];
type WaitlistInsert = Database['public']['Tables']['waitlist_entries']['Insert'];
type WaitlistUpdate = Database['public']['Tables']['waitlist_entries']['Update'];

export async function insertWaitlistEntry(row: WaitlistInsert): Promise<WaitlistRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('waitlist_entries').insert(row).select().single();
  if (error) throw error;
  return data;
}

// The next person to offer a freed seat to — oldest still-Waiting entry
// first (system posture: this runs from registration-deletion/capacity-
// increase call sites, not a staff session, so service-role throughout).
export async function selectOldestWaitingEntry(batchId: string): Promise<WaitlistRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'Waiting')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateWaitlistEntryStatus(
  id: string,
  changes: WaitlistUpdate,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('waitlist_entries')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Contact info for the seat-available notification — the caller (courses/
// registrations service) only has a batchId at that point, not the
// waitlisted participant's details.
export async function selectParticipantContact(
  participantId: string,
): Promise<{ email: string; fullName: string } | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('participants')
    .select('email, full_name')
    .eq('id', participantId)
    .maybeSingle();
  if (error) throw error;
  return data ? { email: data.email, fullName: data.full_name } : null;
}

// Staff-facing list (Courses screen) — session client, RLS scopes rows to
// admin (full) / finance, marketing, management (read-only).
export async function selectWaitlistForBatchStaff(batchId: string): Promise<
  Array<WaitlistRow & { participantFullName: string; participantEmail: string; participantPhone: string }>
> {
  const supabase = await createSupabaseServerClient();
  const { data: entries, error } = await supabase
    .from('waitlist_entries')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  if (!entries || entries.length === 0) return [];

  const participantIds = [...new Set(entries.map((entry) => entry.participant_id))];
  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select('id, full_name, email, phone')
    .in('id', participantIds);
  if (participantsError) throw participantsError;
  const participantById = new Map((participants ?? []).map((p) => [p.id, p]));

  return entries.map((entry) => {
    const participant = participantById.get(entry.participant_id);
    return {
      ...entry,
      participantFullName: participant?.full_name ?? '[unavailable]',
      participantEmail: participant?.email ?? '',
      participantPhone: participant?.phone ?? '',
    };
  });
}
