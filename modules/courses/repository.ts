// Data access only — business rules live in service.ts (Document 11, Section 3).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type CourseRow = Database['public']['Tables']['courses']['Row'];
type BatchRow = Database['public']['Tables']['batches']['Row'];
type BatchInsert = Database['public']['Tables']['batches']['Insert'];
type BatchUpdate = Database['public']['Tables']['batches']['Update'];

export async function selectCourses(): Promise<CourseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('course_name');
  if (error) throw error;
  return data;
}

export async function insertCourse(course: {
  course_code: string;
  course_name: string;
}): Promise<CourseRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('courses')
    .insert(course)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function selectBatches(courseId?: string): Promise<BatchRow[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from('batches').select('*').order('start_date', { ascending: true });
  if (courseId) {
    query = query.eq('course_id', courseId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function insertBatch(batch: BatchInsert): Promise<BatchRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from('batches').insert(batch).select().single();
  if (error) throw error;
  return data;
}

export async function updateBatchById(
  batchId: string,
  changes: BatchUpdate,
): Promise<BatchRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('batches')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', batchId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Public registration form data source (BR-19). The anon role has no RLS
// SELECT policy on batches/courses (public PII posture, Document 3 Section 7),
// so this read runs on the service-role client, server-side only, and selects
// exactly the non-sensitive fields the public form displays.
export async function selectActiveFutureBatchesPublic(): Promise<
  Array<
    Pick<
      BatchRow,
      'id' | 'cohort_label' | 'start_date' | 'course_fee' | 'discount_cutoff_date' | 'discounted_fee'
    > & {
      courses: Pick<CourseRow, 'course_name'> | null;
    }
  >
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id, course_id, cohort_label, start_date, course_fee, discount_cutoff_date, discounted_fee')
    .eq('is_active', true)
    .gte('start_date', new Date().toISOString().slice(0, 10))
    .order('start_date', { ascending: true });
  if (batchesError) throw batchesError;

  const courseIds = [...new Set(batches.map((batch) => batch.course_id))];
  if (courseIds.length === 0) {
    return [];
  }

  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', courseIds);
  if (coursesError) throw coursesError;

  const courseNameById = new Map(
    courses.map((course) => [course.id, course.course_name]),
  );

  return batches.map((batch) => ({
    id: batch.id,
    cohort_label: batch.cohort_label,
    start_date: batch.start_date,
    course_fee: batch.course_fee,
    discount_cutoff_date: batch.discount_cutoff_date,
    discounted_fee: batch.discounted_fee,
    courses: courseNameById.has(batch.course_id)
      ? { course_name: courseNameById.get(batch.course_id)! }
      : null,
  }));
}

// System-context batch read used by the public registration orchestration and
// the webhook/cron paths, where no staff session exists.
export async function selectBatchByIdSystem(batchId: string): Promise<BatchRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('id', batchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
