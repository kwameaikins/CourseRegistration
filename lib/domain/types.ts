export type StaffRole =
  | 'admin'
  | 'finance'
  | 'marketing'
  | 'tutor'
  | 'management';

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
  | 'payment_confirmation';

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
  | 'installment_reminder';
