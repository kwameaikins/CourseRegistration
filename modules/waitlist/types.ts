import type { LeadSource } from '@/lib/domain/types';

// Mirrors the waitlist_entries.status check constraint (migration
// 202607240017_waitlist_payment_plans.sql).
export type WaitlistStatus = 'Waiting' | 'Offered' | 'Converted' | 'Cancelled';

export interface WaitlistEntry {
  id: string;
  participantId: string;
  batchId: string;
  status: WaitlistStatus;
  leadSource: LeadSource;
  offeredAt: string | null;
  convertedRegistrationId: string | null;
  notes: string | null;
  createdAt: string;
}

// Staff-facing view (Courses screen) — the entry plus enough participant
// context to act on it without a second lookup.
export interface WaitlistEntryView extends WaitlistEntry {
  fullName: string;
  email: string;
  phone: string;
}
