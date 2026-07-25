// Waitlist business rules (founder-approved 2026-07-24 — batch capacity +
// waitlist + fixed payment installments). A waitlist entry is created by
// registrations/service.ts's createRegistration when a Batch is at capacity
// (that function already owns the Participant find-or-create step, so it
// hands this module an already-resolved participantId rather than this
// module reaching into participants/registrations tables itself).
import { AppError } from '@/lib/errors';
import { sendTransactionalEmail } from '@/lib/resend/client';
import * as usersService from '@/modules/users/service';
import * as waitlistRepository from '@/modules/waitlist/repository';
import type { LeadSource } from '@/lib/domain/types';
import type { WaitlistEntryView, WaitlistStatus } from '@/modules/waitlist/types';

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23505'
  );
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

export async function joinWaitlist(input: {
  participantId: string;
  participantEmail: string;
  participantFullName: string;
  batchId: string;
  courseName: string;
  cohortLabel: string;
  leadSource: LeadSource;
}): Promise<{ waitlistId: string }> {
  let row;
  try {
    row = await waitlistRepository.insertWaitlistEntry({
      participant_id: input.participantId,
      batch_id: input.batchId,
      lead_source: input.leadSource,
      consent_given: true,
    });
  } catch (err) {
    // unique(participant_id, batch_id) — same BR-03 posture as Registration.
    if (isUniqueViolation(err)) {
      throw new AppError(
        'ALREADY_ON_WAITLIST',
        'You are already on the waitlist for this course intake.',
        409,
      );
    }
    throw err;
  }

  // Non-blocking, same posture as every other confirmation email in this
  // codebase — a send failure must never fail joining the waitlist itself.
  try {
    await sendTransactionalEmail({
      to: input.participantEmail,
      subject: `You're on the waitlist — ${input.courseName} (${input.cohortLabel})`,
      html: `
<p>Dear ${input.participantFullName},</p>
<p><strong>${input.courseName}</strong> (${input.cohortLabel}) is full right now. You've been added to the waitlist — we'll email you the moment a seat opens up, in the order you joined.</p>
<p>No action is needed from you now.</p>`,
    });
  } catch (err) {
    console.error('[waitlist join confirmation email]', err);
  }

  return { waitlistId: row.id };
}

// Automatic seat-freed promotion (founder decision, 2026-07-24: "automatic
// email the moment a seat frees up"). Called from the two places a seat can
// actually free up today — registrations/service.ts's deleteRegistration,
// and courses/service.ts's updateBatch when capacity increases — always
// non-blocking, same posture as every other side-effect in this codebase.
export async function notifyNextIfSeatAvailable(
  batchId: string,
  seatsRemaining: number | null,
  batchContext: { courseName: string; cohortLabel: string },
): Promise<void> {
  if (seatsRemaining === null || seatsRemaining <= 0) return;

  const entry = await waitlistRepository.selectOldestWaitingEntry(batchId);
  if (!entry) return;

  const participant = await waitlistRepository.selectParticipantContact(entry.participant_id);
  if (!participant) return;

  await waitlistRepository.updateWaitlistEntryStatus(entry.id, {
    status: 'Offered',
    offered_at: new Date().toISOString(),
  });

  await sendTransactionalEmail({
    to: participant.email,
    subject: `A seat opened up — ${batchContext.courseName} (${batchContext.cohortLabel})`,
    html: `
<p>Dear ${participant.fullName},</p>
<p>Good news — a seat has opened up for <strong>${batchContext.courseName}</strong> (${batchContext.cohortLabel}), and you're next on the waitlist.</p>
<p><a href="${APP_URL()}/register?batchId=${batchId}">Register now</a> to secure it — seats are offered in waitlist order, so we recommend registering promptly.</p>`,
  });
}

export async function getWaitlistForBatch(batchId: string): Promise<WaitlistEntryView[]> {
  await usersService.requireRole(['admin', 'finance', 'marketing', 'management']);
  const rows = await waitlistRepository.selectWaitlistForBatchStaff(batchId);
  return rows.map((row) => ({
    id: row.id,
    participantId: row.participant_id,
    batchId: row.batch_id,
    status: row.status as WaitlistStatus,
    leadSource: row.lead_source as LeadSource,
    offeredAt: row.offered_at,
    convertedRegistrationId: row.converted_registration_id,
    notes: row.notes,
    createdAt: row.created_at,
    fullName: row.participantFullName,
    email: row.participantEmail,
    phone: row.participantPhone,
  }));
}
