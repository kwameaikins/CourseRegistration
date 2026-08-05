import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type AssignmentRow = Database['public']['Tables']['assignments']['Row'];
type AssignmentInsert = Database['public']['Tables']['assignments']['Insert'];
type AssignmentUpdate = Database['public']['Tables']['assignments']['Update'];
type SubmissionRow = Database['public']['Tables']['assignment_submissions']['Row'];
type SubmissionInsert = Database['public']['Tables']['assignment_submissions']['Insert'];

// Tutor and participant portals have no Supabase Auth session for RLS to key
// off (BR-31), so every portal-facing read/write here uses the service-role
// client and is authorized in the service layer instead. The staff screen
// reads under its own RLS-gated session (the non-System variants).

// --- Assignments ---

export async function insertAssignmentSystem(input: AssignmentInsert): Promise<AssignmentRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from('assignments').insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function selectAssignmentByIdSystem(id: string): Promise<AssignmentRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectAssignmentsForBatchSystem(batchId: string): Promise<AssignmentRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateAssignmentSystem(
  id: string,
  patch: AssignmentUpdate,
): Promise<AssignmentRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignments')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAssignmentSystem(id: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('assignments').delete().eq('id', id);
  if (error) throw error;
}

// Staff-facing read (RLS enforces admin/management, same as /live-sessions).
export async function selectAssignmentsForBatch(batchId: string): Promise<AssignmentRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// --- Submissions ---

// Resubmission overwrites the existing row rather than adding a version, so
// this is an upsert on the (assignment_id, registration_id) unique index.
export async function upsertSubmissionSystem(input: SubmissionInsert): Promise<SubmissionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignment_submissions')
    .upsert(input, { onConflict: 'assignment_id,registration_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectSubmissionByIdSystem(id: string): Promise<SubmissionRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function selectSubmissionsForAssignmentSystem(
  assignmentId: string,
): Promise<SubmissionRow[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .eq('assignment_id', assignmentId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function selectSubmissionsForAssignmentIdsSystem(
  assignmentIds: string[],
): Promise<SubmissionRow[]> {
  if (assignmentIds.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  return data ?? [];
}

// One learner's own submissions across a set of assignments — the student
// portal read. Scoped by registration_id so it can never surface another
// learner's work.
export async function selectSubmissionsForRegistrationSystem(
  registrationId: string,
  assignmentIds: string[],
): Promise<SubmissionRow[]> {
  if (assignmentIds.length === 0) return [];
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignment_submissions')
    .select('*')
    .eq('registration_id', registrationId)
    .in('assignment_id', assignmentIds);
  if (error) throw error;
  return data ?? [];
}

export async function updateSubmissionSystem(
  id: string,
  patch: Database['public']['Tables']['assignment_submissions']['Update'],
): Promise<SubmissionRow> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('assignment_submissions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
