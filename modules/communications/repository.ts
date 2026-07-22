// Data access for the communications module. This repository runs on the
// service-role client by design (Document 3, Section 6): email_log has no
// INSERT policy for any staff role — writes happen only from trusted
// server-side code (registration orchestration, payment status changes,
// cron, webhook).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { EmailType, SmsMessageType, WhatsappMessageType } from '@/lib/domain/types';
import type { Database } from '@/lib/supabase/database.types';
import type { MessageLogFilters, MessageLogRow, RegistrationEmailContext } from '@/modules/communications/types';

type EmailTemplateRow = Database['public']['Tables']['email_templates']['Row'];

// BR-07: reserve the email_log slot BEFORE the Resend call. Returns
// 'reserved' on success, 'duplicate' when the unique(registration_id,
// email_type) constraint rejects the insert (already sent / in progress).
export async function reserveEmailLogSlot(
  registrationId: string,
  emailType: EmailType,
): Promise<'reserved' | 'duplicate'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('email_log').insert({
    registration_id: registrationId,
    email_type: emailType,
    success: false,
    sent_at: new Date().toISOString(),
  });
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'reserved';
}

export async function updateEmailLogEntry(
  registrationId: string,
  emailType: EmailType,
  changes: { success: boolean; error_message?: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('email_log')
    .update(changes)
    .match({ registration_id: registrationId, email_type: emailType });
  if (error) throw error;
}

// WhatsApp analog of reserveEmailLogSlot — same reservation-before-send
// idempotency guarantee, backed by unique(registration_id, message_type).
export async function reserveWhatsappLogSlot(
  registrationId: string,
  messageType: WhatsappMessageType,
): Promise<'reserved' | 'duplicate'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('whatsapp_log').insert({
    registration_id: registrationId,
    message_type: messageType,
    success: false,
    sent_at: new Date().toISOString(),
  });
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'reserved';
}

export async function updateWhatsappLogEntry(
  registrationId: string,
  messageType: WhatsappMessageType,
  changes: { success: boolean; error_message?: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('whatsapp_log')
    .update(changes)
    .match({ registration_id: registrationId, message_type: messageType });
  if (error) throw error;
}

// SMS analog of reserveWhatsappLogSlot — same reservation-before-send
// idempotency guarantee, backed by unique(registration_id, message_type).
export async function reserveSmsLogSlot(
  registrationId: string,
  messageType: SmsMessageType,
): Promise<'reserved' | 'duplicate'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('sms_log').insert({
    registration_id: registrationId,
    message_type: messageType,
    success: false,
    sent_at: new Date().toISOString(),
  });
  if (error?.code === '23505') return 'duplicate';
  if (error) throw error;
  return 'reserved';
}

export async function updateSmsLogEntry(
  registrationId: string,
  messageType: SmsMessageType,
  changes: { success: boolean; error_message?: string | null },
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from('sms_log')
    .update(changes)
    .match({ registration_id: registrationId, message_type: messageType });
  if (error) throw error;
}

export async function selectTemplate(
  courseId: string,
  emailType: EmailType,
): Promise<EmailTemplateRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('course_id', courseId)
    .eq('email_type', emailType)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Admin messaging editor reads/writes (F-MSG, founder-approved 2026-07-19).
// These run on the RLS-enforced server client — the admin_manage policy on
// email_templates is the security boundary.
export async function selectTemplatesForCourse(
  courseId: string,
): Promise<EmailTemplateRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('course_id', courseId)
    .order('email_type');
  if (error) throw error;
  return data;
}

// Insert-only variant for default-template seeding (service-role: runs
// inside course creation, where the new row must exist regardless of the
// caller's template policies). Never overwrites an existing template.
export async function insertTemplateIfMissing(row: {
  course_id: string;
  email_type: string;
  subject: string;
  body: string;
  is_active: boolean;
}): Promise<'inserted' | 'exists'> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from('email_templates').insert(row);
  if (error?.code === '23505') return 'exists';
  if (error) throw error;
  return 'inserted';
}

export async function upsertTemplate(row: {
  course_id: string;
  email_type: string;
  subject: string;
  body: string;
  is_active: boolean;
}): Promise<EmailTemplateRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('email_templates')
    .upsert(
      { ...row, updated_at: new Date().toISOString() },
      { onConflict: 'course_id,email_type' },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Joined read across registrations/participants/batches/courses/payments for
// template rendering and send-time gate checks.
export async function selectRegistrationEmailContext(
  registrationId: string,
): Promise<RegistrationEmailContext | null> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .select('id, participant_id, batch_id')
    .eq('id', registrationId)
    .maybeSingle();
  if (registrationError) throw registrationError;
  if (!registration) return null;

  const [{ data: participant }, { data: batch }, { data: payment }] = await Promise.all([
    supabase
      .from('participants')
      .select('full_name, first_name, email, phone, deleted_at')
      .eq('id', registration.participant_id)
      .maybeSingle(),
    supabase.from('batches').select('*').eq('id', registration.batch_id).maybeSingle(),
    supabase
      .from('payments')
      .select('course_fee, amount_paid, balance, payment_status')
      .eq('registration_id', registrationId)
      .maybeSingle(),
  ]);
  if (!participant || !batch) return null;

  const { data: course } = await supabase
    .from('courses')
    .select('id, course_name, course_code')
    .eq('id', batch.course_id)
    .maybeSingle();
  if (!course) return null;

  // Personal Zoom join link (attendance Option 2) — when the participant was
  // registered with Zoom, their unique link supersedes the shared batch link.
  const { data: zoomRegistrant } = await supabase
    .from('zoom_registrants')
    .select('join_url')
    .eq('registration_id', registrationId)
    .maybeSingle();

  return {
    registrationId,
    participantFullName: participant.full_name,
    // first_name is nullable (backfilled column; also cleared on DPA soft
    // delete) — fall back to the first word of full_name so a legacy row
    // never breaks the greeting placeholder.
    participantFirstName: participant.first_name ?? participant.full_name.split(' ')[0],
    participantEmail: participant.email,
    participantPhone: participant.phone,
    participantDeleted: participant.deleted_at !== null,
    courseId: course.id,
    courseName: course.course_name,
    courseCode: course.course_code,
    cohortLabel: batch.cohort_label,
    courseFee: Number(payment?.course_fee ?? batch.course_fee),
    amountPaid: Number(payment?.amount_paid ?? 0),
    balance: Number(payment?.balance ?? batch.course_fee),
    paymentStatus: payment?.payment_status ?? 'Unpaid',
    startDate: batch.start_date,
    startTime: batch.start_time,
    endDate: batch.end_date,
    zoomLink: zoomRegistrant?.join_url ?? batch.zoom_link,
    whatsappGroupLink: batch.whatsapp_group_link,
    facilitatorName: batch.facilitator_name,
    batchIsActive: batch.is_active,
    welcomeEmailEnabled: batch.welcome_email_enabled,
    paymentReminderEnabled: batch.payment_reminder_enabled,
    classReminderEnabled: batch.class_reminder_enabled,
    whatsappEnabled: batch.whatsapp_enabled,
    smsEnabled: batch.sms_enabled,
  };
}

// Cron candidate query (Document 2, Section 7, step 2): every Registration in
// an Active batch whose payment is Unpaid or Part Payment.
export async function selectUnpaidRegistrationsInActiveBatches(): Promise<
  Array<{
    registrationId: string;
    registeredAt: string;
    batchStartDate: string;
    paymentReminderEnabled: boolean;
  }>
> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id, start_date, payment_reminder_enabled')
    .eq('is_active', true);
  if (batchesError) throw batchesError;
  if (batches.length === 0) return [];
  const batchById = new Map(batches.map((batch) => [batch.id, batch]));

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, batch_id, registered_at')
    .in('batch_id', batches.map((batch) => batch.id));
  if (registrationsError) throw registrationsError;
  if (registrations.length === 0) return [];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status')
    .in('registration_id', registrations.map((registration) => registration.id))
    .in('payment_status', ['Unpaid', 'Part Payment']);
  if (paymentsError) throw paymentsError;
  const unpaidRegistrationIds = new Set(payments.map((payment) => payment.registration_id));

  return registrations
    .filter((registration) => unpaidRegistrationIds.has(registration.id))
    .map((registration) => {
      const batch = batchById.get(registration.batch_id)!;
      return {
        registrationId: registration.id,
        registeredAt: registration.registered_at,
        batchStartDate: batch.start_date,
        paymentReminderEnabled: batch.payment_reminder_enabled,
      };
    });
}

// BR-08 fresh status check, executed immediately before each send.
export async function selectCurrentPaymentStatus(
  registrationId: string,
): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from('payments')
    .select('payment_status')
    .eq('registration_id', registrationId)
    .maybeSingle();
  if (error) throw error;
  return data?.payment_status ?? null;
}

// Sent-message log (admin review screen). Each of the three log tables is
// small/moderate for this system's scale, so rather than a cross-table SQL
// UNION (not expressible through the Supabase JS client without an RPC),
// each channel is fetched independently — capped and pre-filtered by
// success status at the DB level — then merged and joined to
// registration/participant/course context in app code, mirroring
// selectRegistrationList's join pattern. Search and pagination are applied
// after the merge since they depend on the joined participant fields.
const MESSAGE_LOG_FETCH_CAP = 500;

type RawLogEntry = Omit<MessageLogRow, 'participantName' | 'participantEmail' | 'courseName' | 'cohortLabel'>;

async function fetchEmailLogEntries(status?: 'success' | 'failed'): Promise<RawLogEntry[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from('email_log')
    .select('registration_id, email_type, sent_at, success, error_message')
    .order('sent_at', { ascending: false })
    .limit(MESSAGE_LOG_FETCH_CAP);
  if (status) query = query.eq('success', status === 'success');
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    channel: 'email' as const,
    messageType: row.email_type,
    sentAt: row.sent_at,
    success: row.success,
    errorMessage: row.error_message,
    registrationId: row.registration_id,
  }));
}

async function fetchWhatsappLogEntries(status?: 'success' | 'failed'): Promise<RawLogEntry[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from('whatsapp_log')
    .select('registration_id, message_type, sent_at, success, error_message')
    .order('sent_at', { ascending: false })
    .limit(MESSAGE_LOG_FETCH_CAP);
  if (status) query = query.eq('success', status === 'success');
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    channel: 'whatsapp' as const,
    messageType: row.message_type,
    sentAt: row.sent_at,
    success: row.success,
    errorMessage: row.error_message,
    registrationId: row.registration_id,
  }));
}

async function fetchSmsLogEntries(status?: 'success' | 'failed'): Promise<RawLogEntry[]> {
  const supabase = createSupabaseServiceRoleClient();
  let query = supabase
    .from('sms_log')
    .select('registration_id, message_type, sent_at, success, error_message')
    .order('sent_at', { ascending: false })
    .limit(MESSAGE_LOG_FETCH_CAP);
  if (status) query = query.eq('success', status === 'success');
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    channel: 'sms' as const,
    messageType: row.message_type,
    sentAt: row.sent_at,
    success: row.success,
    errorMessage: row.error_message,
    registrationId: row.registration_id,
  }));
}

export async function selectMessageLog(
  filters: MessageLogFilters,
): Promise<{ rows: MessageLogRow[]; total: number }> {
  const supabase = createSupabaseServiceRoleClient();

  const fetchers = filters.channel
    ? [
        { email: fetchEmailLogEntries, whatsapp: fetchWhatsappLogEntries, sms: fetchSmsLogEntries }[
          filters.channel
        ],
      ]
    : [fetchEmailLogEntries, fetchWhatsappLogEntries, fetchSmsLogEntries];

  const perChannel = await Promise.all(fetchers.map((fetcher) => fetcher(filters.status)));
  const combined = perChannel.flat();
  if (combined.length === 0) return { rows: [], total: 0 };

  const registrationIds = [...new Set(combined.map((entry) => entry.registrationId))];
  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, participant_id, batch_id')
    .in('id', registrationIds);
  if (registrationsError) throw registrationsError;

  const participantIds = [...new Set(registrations.map((r) => r.participant_id))];
  const batchIds = [...new Set(registrations.map((r) => r.batch_id))];

  const [participantsResult, batchesResult] = await Promise.all([
    supabase.from('participants').select('id, full_name, email').in('id', participantIds),
    supabase.from('batches').select('id, cohort_label, course_id').in('id', batchIds),
  ]);
  if (participantsResult.error) throw participantsResult.error;
  if (batchesResult.error) throw batchesResult.error;

  const courseIds = [...new Set(batchesResult.data.map((b) => b.course_id))];
  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', courseIds);
  if (coursesError) throw coursesError;

  const registrationById = new Map(registrations.map((r) => [r.id, r]));
  const participantById = new Map(participantsResult.data.map((p) => [p.id, p]));
  const batchById = new Map(batchesResult.data.map((b) => [b.id, b]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  let rows: MessageLogRow[] = combined.map((entry) => {
    const registration = registrationById.get(entry.registrationId);
    const participant = registration ? participantById.get(registration.participant_id) : null;
    const batch = registration ? batchById.get(registration.batch_id) : null;
    const course = batch ? courseById.get(batch.course_id) : null;
    return {
      ...entry,
      participantName: participant?.full_name ?? '[unavailable]',
      participantEmail: participant?.email ?? '',
      courseName: course?.course_name ?? '',
      cohortLabel: batch?.cohort_label ?? '',
    };
  });

  rows.sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0));

  if (filters.search) {
    const needle = filters.search.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.participantName.toLowerCase().includes(needle) ||
        row.participantEmail.toLowerCase().includes(needle),
    );
  }

  const total = rows.length;
  const offset = (filters.page - 1) * filters.limit;
  return { rows: rows.slice(offset, offset + filters.limit), total };
}
