// The staff role list, declared once. The Zod schemas (modules/users/types.ts),
// the runtime parser (lib/domain/parsers.ts), the route/nav tables
// (lib/auth/roles.ts) and the role picker on /users all derive from this
// tuple, so adding or removing a role is one edit here plus whatever the
// compiler then demands.
//
// The database holds the only other copy, in the staff_users_role_check
// constraint (supabase/migrations/202607270034_tutor_portal.sql) — the two
// must be changed together.
export const STAFF_ROLES = ['admin', 'finance', 'marketing', 'management'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type Gender = 'Male' | 'Female';

export type RegistrationStatus =
  | 'Registered'
  | 'Confirmed'
  | 'Attended'
  | 'Cancelled';

export type PaymentStatus = 'Unpaid' | 'Part Payment' | 'Paid';

export type PaymentMethod =
  | 'Paystack Card'
  | 'MTN MoMo'
  | 'Bank Transfer'
  | 'Cash'
  | 'Other';

export type LeadSource =
  | 'WhatsApp'
  | 'Facebook'
  | 'LinkedIn'
  | 'Referral'
  | 'Website'
  | 'Other';

export type WhatsappMessageType =
  | 'welcome'
  | 'reminder_1'
  | 'reminder_2'
  | 'reminder_3'
  | 'reminder_4'
  | 'payment_confirmation'
  | 'class_reminder_24h'
  | 'class_reminder_2h'
  | 'upsell'
  | 'whatsapp_invite';

// SMS mirrors the WhatsApp key-moment set (same dedup semantics, sms_log).
export type SmsMessageType = WhatsappMessageType;

export type EmailType =
  | 'welcome'
  | 'payment_instruction'
  | 'reminder_1'
  | 'reminder_2'
  | 'reminder_3'
  | 'reminder_4'
  | 'payment_confirmation'
  | 'class_reminder_24h'
  | 'class_reminder_2h'
  | 'zoom_link'
  | 'whatsapp_invite'
  | 'post_training_thankyou'
  | 'upsell'
  // Payment plan (founder-approved 2026-07-24) — one reminder ahead of the
  // second installment's due date. Email-only (no WhatsApp/SMS template
  // exists for this), same posture as payment_instruction/class_reminder_*.
  | 'installment_reminder'
  // Free event / webinar (2026-08-03) — replaces 'welcome' on a Batch with
  // is_free set. A separate type rather than a conditional inside the welcome
  // body, so staff can author webinar joining instructions per Course without
  // any risk of the paid template's fee line or payment instructions leaking
  // into a free event.
  | 'free_welcome'
  // Time-boxed access for an unsettled balance (2026-08-08). access_granted
  // is transactional like payment_confirmation — it carries the joining
  // details — while the other two chase the balance and follow the
  // payment-reminder toggle. See modules/access-grants.
  | 'access_granted'
  | 'access_expiring'
  | 'access_expired';
