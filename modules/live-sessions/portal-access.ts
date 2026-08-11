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

// The Join button used to activate only 15 minutes before the scheduled
// start (Document 14, Section 5, step 4). That gate cost a real class its
// link: on 2026-08-10 the link never appeared while the session was running,
// because a start_time that is even slightly out — or a session generated
// from batch hours that don't match when the cohort actually meets — keeps
// the pre-start window shut through the whole class.
//
// Founder direction 2026-08-11: the link disappears only after the course
// duration has ended, never before. So there is no lower bound any more —
// selectNextClassForParticipant already narrows to the soonest session that
// has not ended, and that session's link is live from the moment it becomes
// the next class.
//
// Grace after the scheduled end, so a class that overruns doesn't lose its
// link mid-session — the same failure in the other direction. Applied both
// here and to the query that picks the session, so an overrunning class
// stays the "next class" for this long rather than being replaced by
// tomorrow's the second the clock passes ends_at.
export const JOIN_WINDOW_AFTER_MS = 60 * 60 * 1000;

// Extracted as its own pure function so the gate itself is directly unit-
// testable, independent of the Supabase orchestration around it.
export function isJoinLinkLive(now: Date, endsAt: string): boolean {
  return now.getTime() <= new Date(endsAt).getTime() + JOIN_WINDOW_AFTER_MS;
}

export interface NextClassForParticipant {
  title: string;
  startsAt: string;
  endsAt: string;
  // Null only once the session's duration is over (plus the overrun grace),
  // or when no join link exists for this cohort at all — the caller renders
  // an explanation rather than a dead link.
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
  //
  // "Hasn't ended" carries the overrun grace, so a class still running past
  // its scheduled end remains the next class instead of jumping to the
  // following one while people are still in the room.
  const now = new Date();
  const batchIds = eligibleRegistrations.map((row) => row.batch_id);
  const { data: sessions, error: sessionsError } = await supabase
    .from('live_sessions')
    .select('id, batch_id, title, starts_at, ends_at')
    .in('batch_id', batchIds)
    .in('status', ['scheduled', 'ready', 'live'])
    .gte('ends_at', new Date(now.getTime() - JOIN_WINDOW_AFTER_MS).toISOString())
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

  // Falls back to the batch's shared classroom link, then to the Course's,
  // matching what the portal's course card does — a cohort whose Zoom
  // registration has not run yet still gets a way in, and so does a batch
  // created before its course had a meeting (createBatch copies the course
  // link once at creation and never back-fills it).
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('zoom_link, courses(zoom_link)')
    .eq('id', session.batch_id)
    .maybeSingle();
  if (batchError) throw batchError;

  return {
    title: session.title,
    startsAt: session.starts_at,
    endsAt: session.ends_at,
    joinUrl: isJoinLinkLive(now, session.ends_at)
      ? (registrant?.join_url ?? batch?.zoom_link ?? batch?.courses?.zoom_link ?? null)
      : null,
  };
}
