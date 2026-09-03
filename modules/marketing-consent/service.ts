// Marketing consent (Revenue OS Phase 2, 2026-09-03).
//
// One question, answered in one place: may we send this address MARKETING?
// Campaigns, nurture sequences and upsell messages ask before sending.
// Transactional lifecycle messages (payment instructions, receipts, class
// reminders, certificates) are deliberately exempt — they are the service
// someone registered for, not marketing, and suppressing them would harm the
// very person the opt-out protects.
import * as repository from '@/modules/marketing-consent/repository';

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export async function isOptedOut(email: string): Promise<boolean> {
  return repository.selectOptOut(normalize(email));
}

// Batch form for send loops: one query, not one per recipient.
export async function optedOutSubset(emails: string[]): Promise<Set<string>> {
  return repository.selectOptOutSet([...new Set(emails.map(normalize))]);
}

export async function optOut(
  email: string,
  source: 'link' | 'staff' | 'bounce',
  reason?: string | null,
): Promise<void> {
  await repository.upsertOptOut({ email: normalize(email), source, reason });
}
