// Student portal's "Next Class" card (Document 14, Section 8) — the one
// place a participant learns about an upcoming LiveSession and gets a join
// link. Runs on the service-role client for the same reason every other
// public/participant-facing read in this app does (no RLS policy grants a
// participant session access — the portal has no Supabase Auth identity to
// evaluate RLS against in the first place).
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

// How long before a session's scheduled start the portal's Join button
// activates; it stays active through the session's scheduled end (Document
// 14, Section 5, step 4 — "activates Join only inside the configured
// window and explains unavailable access otherwise"). 15 minutes matches
// the closest-to-start reminder in the default cadence (Section 5, step 3).
// Document 14, Section 11, #2 lists the exact default as still pending
// founder confirmation — treat this as a placeholder until that's decided.
const JOIN_WINDOW_BEFORE_MS = 15 * 60 * 1000;

// Extracted as its own pure function so the gate itself is directly unit-
// testable, independent of the Supabase orchestration around it.
export function isWithinJoinWindow(now: Date, startsAt: string, endsAt: string): boolean {
  const windowOpensAt = new Date(startsAt).getTime() - JOIN_WINDOW_BEFORE_MS;
  const windowClosesAt = new Date(endsAt).getTime();
  const nowMs = now.getTime();
  return nowMs >= windowOpensAt && nowMs <= windowClosesAt;
}

export interface NextClassForParticipant {
  title: string;
  startsAt: string;
  endsAt: string;
  // Null outside the join window, or when no personal registrant link has
  // been created yet — the caller renders "opens N minutes before start"
  // rather than a dead/premature link (never expose a join URL early).
  joinUrl: string | null;
}

export async function selectNextClassForParticipant(
  participantId: string,
): Promise<NextClassForParticipant | null> {
  const supabase = createSupabaseServiceRoleClient();

  // Eligibility gate (Document 14, Section 7): only Confirmed + Paid
  // registrations ever see a class, matching the existing Zoom-link
  // visibility rule already enforced elsewhere in the portal.
  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, batch_id')
    .eq('participant_id', participantId)
    .eq('registration_status', 'Confirmed');
  if (registrationsError) throw registrationsError;
  if (!registrations || registrations.length === 0) return null;

  const registrationIds = registrations.map((row) => row.id);
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id')
    .in('registration_id', registrationIds)
    .eq('payment_status', 'Paid');
  if (paymentsError) throw paymentsError;

  const paidRegistrationIds = new Set((payments ?? []).map((row) => row.registration_id));
  const eligibleRegistrations = registrations.filter((row) => paidRegistrationIds.has(row.id));
  if (eligibleRegistrations.length === 0) return null;

  // "Next" means the soonest session that hasn't ended yet — filtering on
  // starts_at instead of ends_at would drop an in-progress class from view
  // the moment it started, hiding Join for the entire live session.
  const batchIds = eligibleRegistrations.map((row) => row.batch_id);
  const { data: sessions, error: sessionsError } = await supabase
    .from('live_sessions')
    .select('id, batch_id, title, starts_at, ends_at')
    .in('batch_id', batchIds)
    .in('status', ['scheduled', 'ready', 'live'])
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(1);
  if (sessionsError) throw sessionsError;

  const session = sessions?.[0];
  if (!session) return null;

  const eligibleRegistrationIdsForBatch = eligibleRegistrations
    .filter((row) => row.batch_id === session.batch_id)
    .map((row) => row.id);

  const { data: registrant, error: registrantError } = await supabase
    .from('live_session_registrants')
    .select('join_url')
    .eq('live_session_id', session.id)
    .in('registration_id', eligibleRegistrationIdsForBatch)
    .maybeSingle();
  if (registrantError) throw registrantError;

  const withinJoinWindow = isWithinJoinWindow(new Date(), session.starts_at, session.ends_at);

  return {
    title: session.title,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    joinUrl: withinJoinWindow ? (registrant?.join_url ?? null) : null,
  };
}
