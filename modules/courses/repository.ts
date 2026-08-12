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
  certificate_hours: number;
  certificate_description: string;
  cpd_credit: string;
  zoom_link?: string | null;
  zoom_meeting_id?: string | null;
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

export async function updateCourseById(
  courseId: string,
  changes: Database['public']['Tables']['courses']['Update'],
): Promise<CourseRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('courses')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', courseId)
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
//
// Late registration (founder-approved 2026-08-12): the window closes on
// end_date, not start_date. It used to close on start_date, which meant a
// cohort became unreachable at midnight on its first day even though it ran
// for weeks afterwards — a real registrant was turned away from an
// AI-Powered Financial Reporting intake on 2026-08-11 with no route in
// except a staff bulk import. end_date is NOT NULL on batches, so this is a
// total order with no null-handling branch.
export async function selectActiveJoinableBatchesPublic(): Promise<
  Array<
    Pick<
      BatchRow,
      | 'id'
      | 'cohort_label'
      | 'start_date'
      | 'end_date'
      | 'course_fee'
      | 'is_free'
      | 'capacity'
      | 'discount_cutoff_date'
      | 'discounted_fee'
    > & {
      courses: Pick<CourseRow, 'course_name'> | null;
    }
  >
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select(
      'id, course_id, cohort_label, start_date, end_date, course_fee, is_free, capacity, discount_cutoff_date, discounted_fee',
    )
    .eq('is_active', true)
    .gte('end_date', new Date().toISOString().slice(0, 10))
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
    end_date: batch.end_date,
    course_fee: batch.course_fee,
    is_free: batch.is_free,
    capacity: batch.capacity,
    discount_cutoff_date: batch.discount_cutoff_date,
    discounted_fee: batch.discounted_fee,
    courses: courseNameById.has(batch.course_id)
      ? { course_name: courseNameById.get(batch.course_id)! }
      : null,
  }));
}

// Capacity check (BR-19 addendum, waitlist feature 2026-07-24): counts only
// active registrations (Cancelled excluded) per batch, so a cancellation
// frees up a seat. Service-role client — same public/system posture as
// selectActiveJoinableBatchesPublic above; this runs as part of the same
// public-form data load, before any staff session exists.
export async function countRegistrationsByBatchIdsSystem(
  batchIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (batchIds.length === 0) return counts;

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('registrations')
    .select('batch_id')
    .in('batch_id', batchIds)
    // 'Lapsed' joined 'Cancelled' here on 2026-08-09. This is the one seat-
    // affecting read phrased as a negative, which makes it the one place a new
    // status is silently wrong rather than loudly wrong — a written-off
    // registration would otherwise go on occupying a seat forever.
    .not('registration_status', 'in', '("Cancelled","Lapsed")');
  if (error) throw error;

  for (const row of data) {
    counts.set(row.batch_id, (counts.get(row.batch_id) ?? 0) + 1);
  }
  return counts;
}


// Public course catalogue (2026-08-03) — every Course, each with the Active,
// still-joinable Batches a visitor could actually register for. Service-role
// for the same reason as selectActiveJoinableBatchesPublic: the anon role has
// no RLS SELECT policy on courses/batches, and this runs on a public page with
// no session. Only the non-sensitive columns the catalogue renders are selected
// — notably NOT zoom_link, which must never reach an unregistered visitor.
//
// Courses with no upcoming Batch are still returned: the catalogue shows them
// as "Dates to be announced" rather than hiding a programme the founder's copy
// says is on offer.
//
// Shares BR-19's end_date window with selectActiveJoinableBatchesPublic
// (2026-08-12) rather than keeping its own start_date cutoff: the catalogue and
// the registration form must agree on what is joinable, or the catalogue tells
// a visitor a cohort is gone while /register still accepts them onto it.
export async function selectPublicCourseCatalogSystem(): Promise<
  Array<{
    course: Pick<
      CourseRow,
      'id' | 'course_code' | 'course_name' | 'certificate_hours' | 'cpd_credit'
    >;
    batches: Array<
      Pick<
        BatchRow,
        | 'id'
        | 'cohort_label'
        | 'start_date'
        | 'start_time'
        | 'end_date'
        | 'course_fee'
        | 'is_free'
        | 'capacity'
        | 'discount_cutoff_date'
        | 'discounted_fee'
        | 'facilitator_name'
      >
    >;
  }>
> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_code, course_name, certificate_hours, cpd_credit')
    .order('course_name', { ascending: true });
  if (coursesError) throw coursesError;
  if (!courses || courses.length === 0) return [];

  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select(
      'id, course_id, cohort_label, start_date, start_time, end_date, course_fee, is_free, capacity, discount_cutoff_date, discounted_fee, facilitator_name',
    )
    .eq('is_active', true)
    .gte('end_date', new Date().toISOString().slice(0, 10))
    .order('start_date', { ascending: true });
  if (batchesError) throw batchesError;

  const batchesByCourseId = new Map<string, typeof batches>();
  for (const batch of batches ?? []) {
    const list = batchesByCourseId.get(batch.course_id) ?? [];
    list.push(batch);
    batchesByCourseId.set(batch.course_id, list);
  }

  return courses.map((course) => ({
    course,
    batches: (batchesByCourseId.get(course.id) ?? []).map((batch) => ({
      id: batch.id,
      cohort_label: batch.cohort_label,
      start_date: batch.start_date,
      start_time: batch.start_time,
      end_date: batch.end_date,
      course_fee: batch.course_fee,
      is_free: batch.is_free,
      capacity: batch.capacity,
      discount_cutoff_date: batch.discount_cutoff_date,
      discounted_fee: batch.discounted_fee,
      facilitator_name: batch.facilitator_name,
    })),
  }));
}

// System-context course read used by the public registration orchestration,
// where no staff session exists.
export async function selectCourseByIdSystem(courseId: string): Promise<CourseRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data;
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
