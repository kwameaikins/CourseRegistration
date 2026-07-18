export type StaffRole =
  | 'admin'
  | 'finance'
  | 'marketing'
  | 'tutor'
  | 'management';

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
  | 'upsell';
