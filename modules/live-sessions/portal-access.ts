// Student portal's "Next Class" card (Document 14, Section 8) — the one
// place a participant learns about an upcoming LiveSession and gets a join
// link. Runs on the service-role client for the same reason every other
// public/participant-facing read in this app does (no RLS policy grants a
// participant session access — the portal has no Supabase Auth identity to
// evaluate RLS against in the first place).
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
// Permitted cross-module call (2026-08-08) — access-grants owns the single
// rule for "may this unsettled registration still attend", so this file no
// longer reads the payments table directly.
import * as accessGrantsService from '@/modules/access-grants/service';

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

  // Eligibility gate (Document 14, Section 7): only Confirmed registrations
  // with access ever see a class, matching the Zoom-link visibility rule
  // enforced elsewhere in the portal.
  //
  // Access stopped meaning "payment_status is Paid" on 2026-08-08 — a live
  // time-boxed grant (part payment or credit) also qualifies. The
  // registration_status filter stays: a grant sets 'Confirmed' too, so this
  // still excludes Cancelled seats, and access-grants' own date check below
  // is what actually decides.
  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, batch_id')
    .eq('participant_id', participantId)
    .eq('registration_status', 'Confirmed');
  if (registrationsError) throw registrationsError;
  if (!registrations || registrations.length === 0) return null;

  const registrationIds = registrations.map((row) => row.id);
  const accessStates = await accessGrantsService.getAccessStatesSystem(registrationIds);
  const eligibleRegistrations = registrations.filter(
    (row) => accessStates.get(row.id)?.hasAccess === true,
  );
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

  // The join link comes from zoom_registrants — the participant's personal
  // link, minted by ensureZoomRegistration when their seat opened.
  //
  // This used to read live_session_registrants, a table that never received a
  // single row before it was dropped in 202608080058. So this card's Join
  // button resolved to null for every participant, always: even the one
  // cohort that had sessions could never join from it. Reading the table that
  // actually holds join links is what makes the card work at all.
  const { data: registrant, error: registrantError } = await supabase
    .from('zoom_registrants')
    .select('join_url')
    .in('registration_id', eligibleRegistrationIdsForBatch)
    .limit(1)
    .maybeSingle();
  if (registrantError) throw registrantError;

  // Falls back to the batch's shared classroom link, matching what the
  // portal's course card does — a cohort whose Zoom registration has not run
  // yet still gets a way in during the window.
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('zoom_link')
    .eq('id', session.batch_id)
    .maybeSingle();
  if (batchError) throw batchError;

  const withinJoinWindow = isWithinJoinWindow(new Date(), session.starts_at, session.ends_at);

  return {
    title: session.title,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    joinUrl: withinJoinWindow
      ? (registrant?.join_url ?? batch?.zoom_link ?? null)
      : null,
  };
}
