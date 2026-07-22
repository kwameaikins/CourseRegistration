// Data access for the voice module. Candidate queries and call_log writes run
// on the service-role client (cron/webhook contexts, same posture as
// communications); the staff review read runs on the RLS-enforced client.
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { Database } from '@/lib/supabase/database.types';
import type { VoiceCallType } from '@/modules/voice/types';

type CallLogRow = Database['public']['Tables']['call_log']['Row'];

export interface CallCandidate {
  registrationId: string;
  phone: string;
  variableValues: Record<string, string>;
}

// Shared context join for one registration id set.
async function selectCallContexts(registrationIds: string[]): Promise<
  Map<
    string,
    {
      phone: string;
      participantFirstName: string;
      deleted: boolean;
      courseName: string;
      cohortLabel: string;
      startDate: string;
      courseFee: number;
      balance: number;
    }
  >
> {
  const map = new Map<
    string,
    {
      phone: string;
      participantFirstName: string;
      deleted: boolean;
      courseName: string;
      cohortLabel: string;
      startDate: string;
      courseFee: number;
      balance: number;
    }
  >();
  if (registrationIds.length === 0) return map;
  const supabase = createSupabaseServiceRoleClient();

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id, participant_id, batch_id')
    .in('id', registrationIds);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return map;

  const participantIds = [...new Set(registrations.map((r) => r.participant_id))];
  const batchIds = [...new Set(registrations.map((r) => r.batch_id))];

  const [{ data: participants }, { data: batches }, { data: payments }] = await Promise.all([
    supabase
      .from('participants')
      .select('id, phone, first_name, full_name, deleted_at')
      .in('id', participantIds),
    supabase
      .from('batches')
      .select('id, cohort_label, start_date, course_fee, course_id')
      .in('id', batchIds),
    supabase
      .from('payments')
      .select('registration_id, balance, course_fee')
      .in('registration_id', registrationIds),
  ]);

  const courseIds = [...new Set((batches ?? []).map((b) => b.course_id))];
  const { data: courses } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', courseIds);

  const participantById = new Map((participants ?? []).map((p) => [p.id, p]));
  const batchById = new Map((batches ?? []).map((b) => [b.id, b]));
  const courseById = new Map((courses ?? []).map((c) => [c.id, c.course_name]));
  const paymentByRegistration = new Map(
    (payments ?? []).map((p) => [p.registration_id, p]),
  );

  for (const registration of registrations) {
    const participant = participantById.get(registration.participant_id);
    const batch = batchById.get(registration.batch_id);
    if (!participant || !batch) continue;
    const payment = paymentByRegistration.get(registration.id);
    map.set(registration.id, {
      phone: participant.phone,
      participantFirstName:
        participant.first_name ?? participant.full_name.split(' ')[0] ?? '',
      deleted: participant.deleted_at !== null,
      courseName: courseById.get(batch.course_id) ?? '',
      cohortLabel: batch.cohort_label,
      startDate: batch.start_date,
      courseFee: Number(payment?.course_fee ?? batch.course_fee),
      balance: Number(payment?.balance ?? batch.course_fee),
    });
  }
  return map;
}

export { selectCallContexts };

// Customer lookup for the sales-follow-up agent's lookup_customer tool
// (system review, 2026-07-22) — the "CRM" this custom-tool talks to is this
// app's own participants/registrations data. Same email-or-last-9-digits
// matching as the student portal's login lookup (modules/portal/repository).
export async function selectCustomerSummaryByIdentifier(identifier: string): Promise<{
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string | null;
  company: string | null;
  registrations: Array<{
    courseName: string;
    cohortLabel: string;
    registrationStatus: string;
    paymentStatus: string;
    balance: number;
  }>;
} | null> {
  const supabase = createSupabaseServiceRoleClient();
  const trimmed = identifier.trim();

  type ParticipantRow = {
    id: string;
    full_name: string;
    email: string;
    phone: string;
    job_title: string | null;
    company: string | null;
    deleted_at: string | null;
  };
  let participant: ParticipantRow | null = null;

  if (trimmed.includes('@')) {
    const { data, error } = await supabase
      .from('participants')
      .select('id, full_name, email, phone, job_title, company, deleted_at')
      .eq('email', trimmed.toLowerCase())
      .limit(1);
    if (error) throw error;
    participant = data[0] ?? null;
  } else {
    const digits = trimmed.replace(/\D/g, '');
    const last9 = digits.slice(-9);
    if (last9.length === 9) {
      const { data, error } = await supabase
        .from('participants')
        .select('id, full_name, email, phone, job_title, company, deleted_at')
        .ilike('phone', `%${last9}`)
        .limit(1);
      if (error) throw error;
      participant = data[0] ?? null;
    }
  }

  if (!participant || participant.deleted_at !== null) return null;

  const { data: registrations, error: regError } = await supabase
    .from('registrations')
    .select('id, batch_id, registration_status')
    .eq('participant_id', participant.id);
  if (regError) throw regError;

  const base = {
    fullName: participant.full_name,
    email: participant.email,
    phone: participant.phone,
    jobTitle: participant.job_title,
    company: participant.company,
  };
  if (registrations.length === 0) return { ...base, registrations: [] };

  const batchIds = [...new Set(registrations.map((r) => r.batch_id))];
  const registrationIds = registrations.map((r) => r.id);

  const [batchesResult, paymentsResult] = await Promise.all([
    supabase.from('batches').select('id, course_id, cohort_label').in('id', batchIds),
    supabase
      .from('payments')
      .select('registration_id, payment_status, balance')
      .in('registration_id', registrationIds),
  ]);
  if (batchesResult.error) throw batchesResult.error;
  if (paymentsResult.error) throw paymentsResult.error;

  const courseIds = [...new Set(batchesResult.data.map((b) => b.course_id))];
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', courseIds);
  if (coursesError) throw coursesError;

  const batchById = new Map(batchesResult.data.map((b) => [b.id, b]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const paymentByRegId = new Map(paymentsResult.data.map((p) => [p.registration_id, p]));

  return {
    ...base,
    registrations: registrations.map((r) => {
      const batch = batchById.get(r.batch_id);
      const course = batch ? courseById.get(batch.course_id) : null;
      const payment = paymentByRegId.get(r.id);
      return {
        courseName: course?.course_name ?? '',
        cohortLabel: batch?.cohort_label ?? '',
        registrationStatus: r.registration_status,
        paymentStatus: payment?.payment_status ?? 'Unpaid',
        balance: Number(payment?.balance ?? 0),
      };
    }),
  };
}

// 1. payment_followup — Unpaid, registered 3+ days ago, batch active with
// payment reminders on and not yet started.
export async function selectPaymentFollowupRegistrations(
  cutoffIso: string,
  todayIso: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id')
    .eq('is_active', true)
    .eq('payment_reminder_enabled', true)
    .gte('start_date', todayIso);
  if (batchesError) throw batchesError;
  if (!batches || batches.length === 0) return [];

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id, registered_at')
    .in('batch_id', batches.map((b) => b.id))
    .lte('registered_at', cutoffIso);
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .in('registration_id', registrations.map((r) => r.id));
  if (paymentsError) throw paymentsError;

  return (payments ?? [])
    .filter((p) => p.payment_status === 'Unpaid')
    .map((p) => p.registration_id);
}

// 2. bank_transfer_chase — Part Payment with the start date <= 3 days away.
export async function selectBankTransferChaseRegistrations(
  todayIso: string,
  latestStartIso: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id')
    .eq('is_active', true)
    .gte('start_date', todayIso)
    .lte('start_date', latestStartIso);
  if (batchesError) throw batchesError;
  if (!batches || batches.length === 0) return [];

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id')
    .in('batch_id', batches.map((b) => b.id));
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .in('registration_id', registrations.map((r) => r.id));
  if (paymentsError) throw paymentsError;

  return (payments ?? [])
    .filter((p) => p.payment_status === 'Part Payment')
    .map((p) => p.registration_id);
}

// 3. no_show_recovery — Paid, batch session ran yesterday (attendance rows
// exist for that date), but this registration has no attendance row.
export async function selectNoShowRegistrations(yesterdayIso: string): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: sessionRows, error: sessionError } = await supabase
    .from('attendance')
    .select('registration_id')
    .eq('session_date', yesterdayIso);
  if (sessionError) throw sessionError;
  if (!sessionRows || sessionRows.length === 0) return [];

  const attendedIds = new Set(sessionRows.map((row) => row.registration_id));

  // Batches that actually held a session yesterday.
  const { data: attendedRegs, error: regError } = await supabase
    .from('registrations')
    .select('id, batch_id')
    .in('id', [...attendedIds]);
  if (regError) throw regError;
  const batchIds = [...new Set((attendedRegs ?? []).map((r) => r.batch_id))];
  if (batchIds.length === 0) return [];

  const { data: allRegs, error: allRegsError } = await supabase
    .from('registrations')
    .select('id')
    .in('batch_id', batchIds);
  if (allRegsError) throw allRegsError;
  const candidateIds = (allRegs ?? []).map((r) => r.id).filter((id) => !attendedIds.has(id));
  if (candidateIds.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .in('registration_id', candidateIds);
  if (paymentsError) throw paymentsError;

  return (payments ?? [])
    .filter((p) => p.payment_status === 'Paid')
    .map((p) => p.registration_id);
}

// 4. feedback_voice — Paid registrations of batches that ended exactly
// `endDateIso` days ago without a feedback row.
export async function selectFeedbackVoiceRegistrations(
  endDateIso: string,
): Promise<string[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id')
    .eq('is_active', true)
    .eq('end_date', endDateIso);
  if (batchesError) throw batchesError;
  if (!batches || batches.length === 0) return [];

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select('id')
    .in('batch_id', batches.map((b) => b.id));
  if (error) throw error;
  if (!registrations || registrations.length === 0) return [];
  const registrationIds = registrations.map((r) => r.id);

  const [{ data: payments }, { data: feedbackRows }] = await Promise.all([
    supabase
      .from('payments')
      .select('registration_id, payment_status')
      .in('registration_id', registrationIds),
    supabase.from('feedback').select('registration_id').in('registration_id', registrationIds),
  ]);

  const responded = new Set((feedbackRows ?? []).map((row) => row.registration_id));
  return (payments ?? [])
    .filter((p) => p.payment_status === 'Paid' && !responded.has(p.registration_id))
    .map((p) => p.registration_id);
}

// 5. upsell — feedback course-interests that match a course with an open
// future batch the participant is not registered on. Returns the original
// registration (the dedup anchor) plus the pitch course.
export async function selectUpsellCandidates(todayIso: string): Promise<
  Array<{ registrationId: string; pitchCourseName: string; pitchCohortLabel: string; pitchStartDate: string; pitchFee: number }>
> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: feedbackRows, error } = await supabase
    .from('feedback')
    .select('registration_id, interested_courses')
    .not('interested_courses', 'is', null);
  if (error) throw error;
  if (!feedbackRows || feedbackRows.length === 0) return [];

  const { data: openBatches, error: batchesError } = await supabase
    .from('batches')
    .select('id, cohort_label, start_date, course_fee, course_id')
    .eq('is_active', true)
    .gt('start_date', todayIso);
  if (batchesError) throw batchesError;
  if (!openBatches || openBatches.length === 0) return [];

  const courseIds = [...new Set(openBatches.map((b) => b.course_id))];
  const { data: courses } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', courseIds);
  const courseNameById = new Map((courses ?? []).map((c) => [c.id, c.course_name]));

  // Participant behind each feedback row, and their existing registrations.
  const feedbackRegIds = feedbackRows.map((row) => row.registration_id);
  const { data: feedbackRegs, error: feedbackRegsError } = await supabase
    .from('registrations')
    .select('id, participant_id')
    .in('id', feedbackRegIds);
  if (feedbackRegsError) throw feedbackRegsError;
  const participantByRegistration = new Map(
    (feedbackRegs ?? []).map((r) => [r.id, r.participant_id]),
  );
  const participantIds = [...new Set((feedbackRegs ?? []).map((r) => r.participant_id))];
  const { data: existingRegs, error: existingError } = await supabase
    .from('registrations')
    .select('participant_id, batch_id')
    .in('participant_id', participantIds);
  if (existingError) throw existingError;
  const registeredBatchesByParticipant = new Map<string, Set<string>>();
  for (const reg of existingRegs ?? []) {
    const set = registeredBatchesByParticipant.get(reg.participant_id) ?? new Set<string>();
    set.add(reg.batch_id);
    registeredBatchesByParticipant.set(reg.participant_id, set);
  }

  const candidates: Array<{
    registrationId: string;
    pitchCourseName: string;
    pitchCohortLabel: string;
    pitchStartDate: string;
    pitchFee: number;
  }> = [];
  for (const row of feedbackRows) {
    const interests = (row.interested_courses ?? '').toLowerCase();
    const participantId = participantByRegistration.get(row.registration_id);
    if (!participantId) continue;
    const alreadyIn = registeredBatchesByParticipant.get(participantId) ?? new Set();
    const match = openBatches.find((batch) => {
      const name = courseNameById.get(batch.course_id) ?? '';
      return name && interests.includes(name.toLowerCase()) && !alreadyIn.has(batch.id);
    });
    if (match) {
      candidates.push({
        registrationId: row.registration_id,
        pitchCourseName: courseNameById.get(match.course_id) ?? '',
        pitchCohortLabel: match.cohort_label,
        pitchStartDate: match.start_date,
        pitchFee: Number(match.course_fee),
      });
    }
  }
  return candidates;
}

// BR-07 analog: reserve the (registration, call_type) slot BEFORE dialing.
export async function reserveCallSlot(
  registrationId: string,
  callType: VoiceCallType,
  phone: string,
): Promise<{ outcome: 'reserved'; id: string } | { outcome: 'duplicate' }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('call_log')
    .insert({ registration_id: registrationId, call_type: callType, phone })
    .select('id')
    .single();
  if (error?.code === '23505') return { outcome: 'duplicate' };
  if (error) throw error;
  return { outcome: 'reserved', id: data.id };
}

export async function updateCallLog(
  id: string,
  changes: Partial<{
    vapi_call_id: string;
    status: string;
    summary: string | null;
    transcript: string | null;
    needs_human_followup: boolean;
    promised_payment_date: string | null;
    bank_reference: string | null;
    ended_at: string;
  }>,
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('call_log').update(changes).eq('id', id);
  if (error) throw error;
}

export async function selectCallLogByVapiId(
  vapiCallId: string,
): Promise<CallLogRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('call_log')
    .select('*')
    .eq('vapi_call_id', vapiCallId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertInboundCallLog(row: {
  phone: string;
  summary: string | null;
  needs_human_followup: boolean;
}): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('call_log').insert({
    call_type: 'inbound',
    status: 'completed',
    phone: row.phone,
    summary: row.summary,
    needs_human_followup: row.needs_human_followup,
    ended_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// Staff review read (RLS enforces admin/finance/management).
export async function selectRecentCalls(limit: number): Promise<
  Array<CallLogRow & { participant_name: string | null }>
> {
  const supabase = await createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from('call_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const registrationIds = [
    ...new Set(rows.map((row) => row.registration_id).filter((id): id is string => !!id)),
  ];
  const nameByRegistration = new Map<string, string>();
  if (registrationIds.length > 0) {
    const { data: registrations } = await supabase
      .from('registrations')
      .select('id, participants(full_name)')
      .in('id', registrationIds);
    for (const reg of registrations ?? []) {
      const participant = Array.isArray(reg.participants)
        ? reg.participants[0]
        : reg.participants;
      const name = (participant as { full_name?: string } | null)?.full_name;
      if (name) nameByRegistration.set(reg.id, name);
    }
  }

  return rows.map((row) => ({
    ...row,
    participant_name: row.registration_id
      ? (nameByRegistration.get(row.registration_id) ?? null)
      : null,
  }));
}
