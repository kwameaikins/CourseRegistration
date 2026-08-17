// Data access for the feedback module. The public form paths run on the
// service-role client by design (same posture as communications): the
// unguessable Registration UUID is the access token, and feedback has no
// anon RLS policies. Staff reads run on the RLS-enforced server client.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';

type FeedbackTableRow = Database['public']['Tables']['feedback']['Row'];

export async function selectPublicFeedbackContext(registrationId: string): Promise<{
  courseName: string;
  cohortLabel: string;
  participantFirstName: string;
  participantDeleted: boolean;
  alreadySubmitted: boolean;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registration, error } = await supabase
    .from('registrations')
    .select('participant_id, batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (error) throw error;
  if (!registration) return null;

  const [{ data: participant }, { data: batch }, { data: existing }] = await Promise.all([
    supabase
      .from('participants')
      .select('first_name, full_name, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase
      .from('batches')
      .select('cohort_label, course_id')
      .eq('id', registration.batch_id)
      .maybeSingle(),
    supabase
      .from('feedback')
      .select('id')
      .eq('registration_id', registrationId)
      .maybeSingle(),
  ]);
  if (!participant || !batch) return null;

  const { data: course } = await supabase
    .from('courses')
    .select('course_name')
    .eq('id', batch.course_id)
    .maybeSingle();

  return {
    courseName: course?.course_name ?? '',
    cohortLabel: batch.cohort_label,
    participantFirstName:
      participant.first_name ?? participant.full_name.split(' ')[0] ?? '',
    participantDeleted: participant.deleted_at !== null,
    alreadySubmitted: existing !== null,
  };
}

export async function insertFeedback(row: {
  registration_id: string;
  overall_rating: number;
  relevance_rating: number;
  facilitator_rating: number;
  confidence_rating: number;
  materials_clarity: string;
  most_valuable_text: string | null;
  improvement_text: string | null;
  recommendation: string;
  other_course_suggestion: string | null;
  testimonial_choice: string;
}): Promise<'inserted' | 'duplicate'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('feedback').insert(row);
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'inserted';
}

// Batches whose last session ended on `dateIso` — the feedback dispatch
// targets these the following morning.
export async function selectBatchesEndedOn(
  dateIso: string,
): Promise<Array<{ id: string; is_free: boolean }>> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id, is_free')
    .eq('is_active', true)
    .eq('end_date', dateIso);
  if (error) throw error;
  return data ?? [];
}

export async function selectPaidRegistrationIdsForBatch(
  batchId: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id')
    .eq('batch_id', batchId);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .in('registration_id', registrations.map((r) => r.id));
  if (paymentsError) throw paymentsError;

  return (payments ?? [])
    .filter((payment) => payment.payment_status === 'Paid')
    .map((payment) => payment.registration_id);
}

// Registrations on this Batch whose attendance clears MIN_ATTENDANCE_RATIO —
// i.e. the people the post-course thank-you can honestly promise a certificate
// to (2026-08-06). The blanket dispatch keys off payment instead, which on a
// free Batch means everyone who ever filled in the form.
//
// A manual correction is an admin's explicit ruling and is never re-judged
// against the measured threshold — same exemption as certificate eligibility.
export async function selectAttendedRegistrationIdsForBatch(
  batchId: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id')
    .eq('batch_id', batchId);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('registration_id, duration_minutes, session_minutes, source')
    .in('registration_id', registrations.map((r) => r.id));
  if (attendanceError) throw attendanceError;

  // Everyone who joined, however briefly (founder decision 2026-08-08).
  //
  // This used to filter on MIN_ATTENDANCE_RATIO, which meant someone who
  // dropped after 20 minutes of a 175-minute session was never asked for
  // feedback — and since feedback gates the certificate, never told why they
  // could not have one. On ESG2 that silently excluded 37 of the 119 people
  // who actually turned up.
  const attended = new Set((attendance ?? []).map((row) => row.registration_id));
  return [...attended];
}

// Staff review read (RLS enforces admin/management on feedback). Participant
// names come along for non-anonymous rows only (testimonial_choice ===
// 'Anonymous' — the redesigned single testimonial question folds the old
// separate "anonymous to the facilitator" toggle into this one choice).
export async function selectFeedbackForBatch(batchId: string): Promise<
  Array<FeedbackTableRow & { participant_name: string | null }>
> {
  const supabase = await createSupabaseServerClient();
  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, participants(full_name)')
    .eq('batch_id', batchId);
  if (regError) throw regError;
  if (!registrations || registrations.length === 0) return [];

  const { data: rows, error } = await supabase
    .from('feedback')
    .select('*')
    .in('registration_id', registrations.map((r) => r.id))
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  const nameByRegistration = new Map(
    registrations.map((r) => {
      const participant = Array.isArray(r.participants) ? r.participants[0] : r.participants;
      return [r.id, (participant as { full_name?: string } | null)?.full_name ?? null];
    }),
  );

  return (rows ?? []).map((row) => ({
    ...row,
    participant_name:
      row.testimonial_choice === 'Anonymous'
        ? null
        : (nameByRegistration.get(row.registration_id) ?? null),
  }));
}

export async function countPaidRegistrationsForBatch(batchId: string): Promise<number> {
  return (await selectPaidRegistrationIdsForBatch(batchId)).length;
}

// Consented testimonials for the public course catalogue (2026-08-03).
// Service-role because this renders on a page with no session at all.
//
// Consent is the whole point of this query, so the filters are not incidental:
//   * testimonial_choice must be 'Named' or 'Anonymous' — 'No' means the
//     participant answered "may we use this as a testimonial?" with no, and
//     their words never leave staff view.
//   * the attributed name is attached ONLY for 'Named'. 'Anonymous' rows carry
//     null and the page renders "Anonymous Participant".
//   * soft-deleted participants (BR-16 erasure) are dropped entirely, name or
//     not — an erasure request has to remove them from the marketing site too,
//     not just anonymise the byline.
// Job title is deliberately not returned: consent was asked for the name, not
// for the employer-identifying detail alongside it.
// Returns CANDIDATES, not the final list. Which of these is fit to publish is a
// judgement (how short is too short, what rating is too low to quote in
// marketing) and judgement belongs in the service — see
// selectPublishableTestimonials there. This function's only filtering is data
// integrity: consent given, text present, participant not deleted.
export async function selectPublishableTestimonialsSystem(maxCandidates: number): Promise<
  Array<{
    quote: string;
    attributedName: string | null;
    courseName: string;
    overallRating: number;
  }>
> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: rows, error } = await supabase
    .from('feedback')
    .select('registration_id, most_valuable_text, testimonial_choice, overall_rating')
    .in('testimonial_choice', ['Named', 'Anonymous'])
    .not('most_valuable_text', 'is', null)
    .order('submitted_at', { ascending: false })
    .limit(maxCandidates);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const usable = rows.filter((row) => (row.most_valuable_text ?? '').trim().length > 0);
  if (usable.length === 0) return [];

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, participant_id, batch_id')
    .in('id', usable.map((row) => row.registration_id));
  if (registrationsError) throw registrationsError;
  if (!registrations || registrations.length === 0) return [];

  const [{ data: participants }, { data: batches }] = await Promise.all([
    supabase
      .from('participants')
      .select('id, full_name, deleted_at')
      .in('id', registrations.map((registration) => registration.participant_id)),
    supabase
      .from('batches')
      .select('id, course_id')
      .in('id', registrations.map((registration) => registration.batch_id)),
  ]);

  const { data: courses } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', [...new Set((batches ?? []).map((batch) => batch.course_id))]);

  const participantById = new Map((participants ?? []).map((p) => [p.id, p]));
  const courseNameByBatchId = new Map(
    (batches ?? []).map((batch) => [
      batch.id,
      (courses ?? []).find((course) => course.id === batch.course_id)?.course_name ?? '',
    ]),
  );
  const registrationById = new Map(registrations.map((r) => [r.id, r]));

  const testimonials: Array<{
    quote: string;
    attributedName: string | null;
    courseName: string;
    overallRating: number;
  }> = [];

  for (const row of usable) {
    const registration = registrationById.get(row.registration_id);
    if (!registration) continue;
    const participant = participantById.get(registration.participant_id);
    if (!participant || participant.deleted_at !== null) continue;

    testimonials.push({
      quote: (row.most_valuable_text ?? '').trim(),
      attributedName:
        row.testimonial_choice === 'Named' ? (participant.full_name ?? null) : null,
      courseName: courseNameByBatchId.get(registration.batch_id) ?? '',
      overallRating: row.overall_rating,
    });
  }

  return testimonials;
}
