// Data access only — business rules live in service.ts (Document 11, Section 3).
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

// Everything the Seam III grant call needs about a registration, in one
// resolve: who the person is (identity travels to KnowsiaApp) and which
// course they paid for (matched to an m2 course by course_code over there).
export async function selectLmsGrantContextSystem(registrationId: string): Promise<{
  participantId: string;
  participantEmail: string;
  participantFullName: string;
  participantPhone: string | null;
  participantDeleted: boolean;
  courseCode: string;
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
      .select('id, email, full_name, phone, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase.from('batches').select('course_id').eq('id', registration.batch_id).maybeSingle(),
  ]);
  if (!participant || !batch) return null;

  const { data: course } = await supabase
    .from('courses')
    .select('course_code')
    .eq('id', batch.course_id)
    .maybeSingle();
  if (!course) return null;

  return {
    participantId: participant.id,
    participantEmail: participant.email,
    participantFullName: participant.full_name,
    participantPhone: participant.phone ?? null,
    participantDeleted: participant.deleted_at !== null,
    courseCode: course.course_code,
  };
}
