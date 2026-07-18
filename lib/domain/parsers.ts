import type {
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
  parseMember(value, ['admin', 'finance', 'marketing', 'tutor', 'management'], 'staff role');

export const parseRegistrationStatus = (value: string): RegistrationStatus =>
  parseMember(
    value,
    ['Registered', 'Confirmed', 'Attended', 'Cancelled'],
    'registration status',
  );

export const parsePaymentStatus = (value: string): PaymentStatus =>
  parseMember(value, ['Unpaid', 'Part Payment', 'Paid'], 'payment status');

export const parsePaymentMethod = (value: string): PaymentMethod =>
  parseMember(
    value,
    ['Paystack Card', 'MTN MoMo', 'Bank Transfer', 'Cash', 'Other'],
    'payment method',
  );

export const parseLeadSource = (value: string): LeadSource =>
  parseMember(
    value,
    ['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'],
    'lead source',
  );

export const parseGender = (value: string): Gender =>
  parseMember(value, ['Male', 'Female'], 'gender');
