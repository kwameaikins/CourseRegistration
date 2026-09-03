// Data access only — business rules live in service.ts.
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type SequenceRow = Database['public']['Tables']['nurture_sequences']['Row'];
type StepRow = Database['public']['Tables']['nurture_steps']['Row'];
type EnrollmentRow = Database['public']['Tables']['nurture_enrollments']['Row'];
type EnrollmentInsert = Database['public']['Tables']['nurture_enrollments']['Insert'];

export type { SequenceRow, StepRow, EnrollmentRow };

export async function selectSequences(): Promise<SequenceRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_sequences')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function selectSequenceByKey(key: string): Promise<SequenceRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_sequences')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectSequenceById(id: string): Promise<SequenceRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_sequences')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertSequenceIfMissing(input: {
  key: string;
  name: string;
  trigger: string;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('nurture_sequences')
    .upsert(
      { key: input.key, name: input.name, trigger: input.trigger },
      { onConflict: 'key', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function updateSequence(
  id: string,
  changes: Partial<Pick<SequenceRow, 'is_active' | 'name'>>,
): Promise<SequenceRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_sequences')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectSteps(sequenceIds: string[]): Promise<StepRow[]> {
  if (sequenceIds.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_steps')
    .select('*')
    .in('sequence_id', sequenceIds)
    .order('step_number', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function insertStepIfMissing(input: {
  sequence_id: string;
  step_number: number;
  offset_days: number;
  subject: string;
  body: string;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('nurture_steps')
    .upsert(input, { onConflict: 'sequence_id,step_number', ignoreDuplicates: true });
  if (error) throw error;
}

export async function updateStep(
  id: string,
  changes: Partial<Pick<StepRow, 'offset_days' | 'subject' | 'body'>>,
): Promise<StepRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_steps')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ignoreDuplicates carries the once-per-target guarantee: a re-trigger hits
// the partial unique index and inserts nothing.
export async function insertEnrollmentIfMissing(input: EnrollmentInsert): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('nurture_enrollments').insert(input);
  if (error) {
    if ((error as { code?: string }).code === '23505') return; // already enrolled
    throw error;
  }
}

export async function selectDueEnrollments(limit = 200): Promise<EnrollmentRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_enrollments')
    .select('*')
    .eq('status', 'active')
    .lte('next_send_at', new Date().toISOString())
    .order('next_send_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function updateEnrollment(
  id: string,
  changes: Partial<
    Pick<EnrollmentRow, 'next_step' | 'next_send_at' | 'status' | 'stopped_reason'>
  >,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('nurture_enrollments')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function stopEnrollmentsForLead(leadId: string, reason: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('nurture_enrollments')
    .update({ status: 'stopped', stopped_reason: reason, updated_at: new Date().toISOString() })
    .eq('lead_id', leadId)
    .eq('status', 'active');
  if (error) throw error;
}

// Enrollment context for a registration-triggered sequence. A read-model
// join (same posture as the dashboard's reads): sequences never writes these
// tables, it only needs a name, an address and a course title to greet with.
export async function selectRegistrationContact(registrationId: string): Promise<{
  email: string;
  fullName: string;
  courseName: string | null;
  deleted: boolean;
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
      .select('email, full_name, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase.from('batches').select('course_id').eq('id', registration.batch_id).maybeSingle(),
  ]);
  if (!participant) return null;

  let courseName: string | null = null;
  if (batch?.course_id) {
    const { data: course } = await supabase
      .from('courses')
      .select('course_name')
      .eq('id', batch.course_id)
      .maybeSingle();
    courseName = course?.course_name ?? null;
  }
  return {
    email: participant.email,
    fullName: participant.full_name,
    courseName,
    deleted: Boolean(participant.deleted_at),
  };
}

export async function selectEnrollmentCounts(
  sequenceIds: string[],
): Promise<Map<string, { active: number; completed: number }>> {
  if (sequenceIds.length === 0) return new Map();
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('nurture_enrollments')
    .select('sequence_id, status')
    .in('sequence_id', sequenceIds);
  if (error) throw error;
  const counts = new Map<string, { active: number; completed: number }>();
  for (const row of data ?? []) {
    const entry = counts.get(row.sequence_id) ?? { active: 0, completed: 0 };
    if (row.status === 'active') entry.active += 1;
    if (row.status === 'completed') entry.completed += 1;
    counts.set(row.sequence_id, entry);
  }
  return counts;
}
