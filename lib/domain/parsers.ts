import { LEAD_SOURCES, REGISTRATION_STATUSES, STAFF_ROLES } from '@/lib/domain/types';
import type {
  EmailType,
  Gender,
  LeadSource,
  PaymentMethod,
  PaymentStatus,
  RegistrationStatus,
  StaffRole,
} from '@/lib/domain/types';

function parseMember<T extends string>(
  value: string,
  allowedValues: readonly T[],
  fieldName: string,
): T {
  if ((allowedValues as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unexpected ${fieldName} value returned by the database: ${value}`);
}

export const parseStaffRole = (value: string): StaffRole =>
  parseMember(value, STAFF_ROLES, 'staff role');

export const parseRegistrationStatus = (value: string): RegistrationStatus =>
  parseMember(value, REGISTRATION_STATUSES, 'registration status');

export const parsePaymentStatus = (value: string): PaymentStatus =>
  parseMember(value, ['Unpaid', 'Part Payment', 'Paid'], 'payment status');

export const parsePaymentMethod = (value: string): PaymentMethod =>
  parseMember(
    value,
    ['Paystack Card', 'MTN MoMo', 'Bank Transfer', 'Cash', 'Other'],
    'payment method',
  );

export const parseEmailType = (value: string): EmailType =>
  parseMember(
    value,
    [
      'welcome',
      'payment_instruction',
      'reminder_1',
      'reminder_2',
      'reminder_3',
      'reminder_4',
      'payment_confirmation',
      'class_reminder_24h',
      'class_reminder_2h',
      'zoom_link',
      'whatsapp_invite',
      'post_training_thankyou',
      'upsell',
      'installment_reminder',
    ],
    'email type',
  );

// Reads the FULL set, including 'Returning' — this parses what the database
// gives back, so it must accept every value the CHECK constraint allows or a
// returning student's own registration row throws on read.
export const parseLeadSource = (value: string): LeadSource =>
  parseMember(value, LEAD_SOURCES, 'lead source');

export const parseGender = (value: string): Gender =>
  parseMember(value, ['Male', 'Female'], 'gender');
