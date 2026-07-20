// Data access for the communications module. This repository runs on the
// service-role client by design (Document 3, Section 6): email_log has no
// INSERT policy for any staff role — writes happen only from trusted
// server-side code (registration orchestration, payment status changes,
// cron, webhook).
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import type { EmailType, SmsMessageType, WhatsappMessageType } from '@/lib/domain/types';
import type { Database } from '@/lib/supabase/database.types';
import type { RegistrationEmailContext } from '@/modules/communications/types';

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
      .select('full_name, email, phone, deleted_at')
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
