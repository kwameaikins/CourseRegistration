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

// Declared as a tuple for the same reason as STAFF_ROLES above: the runtime
// parser (lib/domain/parsers.ts), the list-filter schema
// (modules/registrations/types.ts), the assistant's tool schemas
// (modules/agent-tools/registry.ts) and the status dropdown on /registrations
// all derive from it, so adding a value is one edit here plus whatever the
// compiler then demands. It used to be a hand-written union with the values
// repeated in the parser, which is two copies to keep in step.
//
// The database holds the only other copy, in the
// registrations_registration_status_check constraint
// (supabase/migrations/202608090059_registration_lapse.sql) — the two must be
// changed together.
export const REGISTRATION_STATUSES = [
  'Registered',
  'Confirmed',
  'Attended',
  'Cancelled',
  // Written off as uncollectible: never paid, never attended (2026-08-09).
  // Deliberately distinct from 'Cancelled' so "they went quiet on us" and
  // "they told us no" stay separable in reporting.
  'Lapsed',
] as const;

export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export type PaymentStatus = 'Unpaid' | 'Part Payment' | 'Paid';

export type PaymentMethod =
  | 'Paystack Card'
  | 'MTN MoMo'
  | 'Bank Transfer'
  | 'Cash'
  | 'Other';

// Declared as a tuple for the same reason as REGISTRATION_STATUSES above, and
// converted from a hand-written union at the same time as 'Returning' was added
// (2026-08-12) — the values were previously repeated in eight places
// (lib/domain/parsers.ts, modules/leads/types.ts, modules/registrations/types.ts
// twice, modules/corporate/types.ts, modules/agent-tools/registry.ts twice, and
// the form/filter dropdowns), which is seven copies to keep in step.
//
// The database holds the only other copies, in the registrations_lead_source_check
// and waitlist_entries_lead_source_check constraints
// (supabase/migrations/202608120060_returning_lead_source.sql) — those and this
// must be changed together.
export const LEAD_SOURCES = [
  'WhatsApp',
  'Facebook',
  'LinkedIn',
  'Referral',
  'Website',
  'Other',
  // Re-enrolment by a Participant who already has an account (2026-08-12).
  // Deliberately distinct from carrying their original source forward, which
  // would re-credit that channel on every future course they take, and from
  // 'Other', which is the genuine-unknown bucket — merged with either, repeat
  // enrolments stop being countable.
  'Returning',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

// The subset a human may pick for themselves. 'Returning' is system-assigned by
// the portal enrolment path, where a portal session has already proven who the
// participant is; an anonymous visitor claiming it on the public form would
// corrupt the one number the value exists to make countable. Used by the public
// registration form, the staff bulk import, the corporate employee-add and the
// assistant's lead tools — everything that takes a lead source as INPUT rather
// than reading one back.
export const SELF_DECLARED_LEAD_SOURCES = LEAD_SOURCES.filter(
  (source) => source !== 'Returning',
) as unknown as readonly [Exclude<LeadSource, 'Returning'>, ...Array<Exclude<LeadSource, 'Returning'>>];

export type SelfDeclaredLeadSource = Exclude<LeadSource, 'Returning'>;

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
