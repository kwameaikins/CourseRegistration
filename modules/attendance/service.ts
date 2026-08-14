// Zoom attendance business rules (founder-approved 2026-07-19, "Option 2").
//
// Two entry points:
//   ensureZoomRegistration — called when a payment reaches Paid; registers
//     the Participant with the Batch's registration-required Zoom meeting,
//     stores the personal join link, and sends the zoom_link email.
//   runAttendanceSync — daily cron; pulls Zoom participant reports for
//     in-progress Batches and upserts attendance rows, matched by the
//     registered email (participants join via personal links, so the report
//     carries the exact email we registered).
import {
  denyMeetingRegistrant,
  enableMeetingRegistration,
  getMeetingParticipantsOn,
  getMeetingRegistrationState,
  isZoomConfigured,
  tryAddMeetingRegistrant,
  type ZoomParticipantRecord,
} from '@/lib/zoom/client';
import { attendanceRatePercent, meetsAttendanceThreshold } from '@/lib/attendance-constants';
import { AppError, captureToSentry } from '@/lib/errors';
import * as attendanceRepository from '@/modules/attendance/repository';
import * as communicationsService from '@/modules/communications/service';
import * as usersService from '@/modules/users/service';

// How long after a Batch's end_date its Zoom registrants are revoked.
//
// Not 1 day. selectBatchesForAttendanceSync still syncs a batch through
// end_date + 1 so the final session's Zoom report is captured, and that sync
// matches participants on zoom_registrants.zoom_registrant_id. Revoking on
// day 1 would delete the match index before the last attendance run of the
// course had used it. Day 2 is the first safe morning.
const POST_COURSE_REVOCATION_GRACE_DAYS = 2;

export interface PostCourseRevocationSummary {
  batchesEvaluated: number;
  batchesClosed: number;
  registrantsRevoked: number;
  errors: string[];
}

// Closes the classroom once a course is over (founder-flagged 2026-08-08).
//
// Classroom meetings are Zoom type 3 (recurring, no fixed time) created with
// join_before_host: true and waiting_room: false, so a personal registrant
// link keeps working indefinitely — anyone still holding one from their
// confirmation email can open the meeting themselves months later, with no
// host present. Hiding the link in the portal does not help, because by then
// the link is in their inbox. This denies the registrant on Zoom's side,
// which is what actually stops it.
//
// The zoom_registrants rows are deliberately KEPT (unlike the access-grant
// expiry sweep, which deletes them so a later grant can re-register cleanly).
// A finished course is never re-opened, and the rows remain the audit trail
// linking a Zoom registrant to a registration for any later attendance query.
//
// Idempotent via batches.zoom_access_revoked_at: each batch is closed once,
// and the timestamp records when.
export async function runPostCourseZoomRevocation(
  now: Date = new Date(),
): Promise<PostCourseRevocationSummary> {
  const summary: PostCourseRevocationSummary = {
    batchesEvaluated: 0,
    batchesClosed: 0,
    registrantsRevoked: 0,
    errors: [],
  };
  if (!isZoomConfigured()) return summary;

  const cutoffIso = new Date(
    now.getTime() - POST_COURSE_REVOCATION_GRACE_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10);
  const batches = await attendanceRepository.selectBatchesPendingZoomRevocation(cutoffIso);

  for (const batch of batches) {
    summary.batchesEvaluated += 1;
    try {
      const registrants = await attendanceRepository.selectZoomRegistrantsForBatch(batch.id);
      let revokedHere = 0;
      for (const registrant of registrants) {
        try {
          await denyMeetingRegistrant({
            meetingId: batch.zoom_meeting_id,
            registrantId: registrant.zoomRegistrantId,
            email: registrant.email,
          });
          revokedHere += 1;
        } catch (err) {
          // One bad registrant (already removed on Zoom's side, say) must not
          // strand the rest of the cohort's links as live.
          summary.errors.push(`${batch.id}/${registrant.registrationId}: ${String(err)}`);
        }
      }

      // Only mark the batch closed if nothing failed — otherwise tomorrow's
      // run would skip it and leave those registrants permanently live.
      if (revokedHere === registrants.length) {
        await attendanceRepository.markBatchZoomRevoked(batch.id);
        summary.batchesClosed += 1;
      }
      summary.registrantsRevoked += revokedHere;
    } catch (err) {
      summary.errors.push(`${batch.id}: ${String(err)}`);
    }
  }

  return summary;
}

export type ZoomRegistrationOutcome =
  | 'registered'
  | 'already_registered'
  | 'skipped_not_configured'
  | 'skipped_no_meeting'
  | 'skipped_gated'
  | 'failed';

export interface AttendanceSyncSummary {
  date: string;
  batchesEvaluated: number;
  rowsUpserted: number;
  unmatchedParticipants: number;
  // How each written row was established, so a caller can see at a glance
  // whether the exact keys are working or the sync is leaning on inference.
  matchedByRegistrant: number;
  matchedByEmail: number;
  matchedByName: number;
  errors: string[];
}

// Honorifics and post-nominals people add to a Zoom display name but not to a
// registration form (or the reverse). Stripping them keeps "Isaac Adjin
// Bonney, CA" and "Isaac Adjin Bonney" on two shared tokens rather than one.
const NAME_NOISE = new Set([
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev', 'sir', 'madam', 'hon',
  'jr', 'jnr', 'sr', 'snr', 'ii', 'iii', 'ca', 'esq', 'phd', 'mba',
]);

export function nameTokens(value: string): string[] {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !NAME_NOISE.has(token));
}

// A single shared token is only ever considered when it is long enough to be
// discriminating — matching "Nana" or "Kofi" against a 267-person roster is
// noise, matching "Owusu-Anane" is not.
const MIN_DISTINCTIVE_TOKEN_LENGTH = 4;

export interface DisplayNameMatchOptions {
  // 2 (default): a Zoom name must share two tokens with exactly one roster
  //   entry. Safe enough to run unattended, and what the nightly sync uses.
  // 1: one distinctive shared token is enough, still requiring exactly one
  //   candidate. Recovers materially more of a shared-link session, at the
  //   cost of some rows being wrong — founder-approved 2026-08-06 for the
  //   ESG2 backfill, where the alternative was 177 of 267 registrants having
  //   no route to a certificate. Opt-in per call; never the sync's default.
  minSharedTokens?: 1 | 2;
}

// Display-name fallback for participants who joined on a shared link, where
// Zoom reports a self-typed name and no email.
//
// The ambiguity rule is absolute at BOTH strictness levels: if two roster
// entries are equally plausible, the answer is null. Picking one arbitrarily
// would silently attribute a session to the wrong person, and on a free Batch
// an attendance row is what makes a certificate issuable.
export function matchByDisplayName(
  displayName: string,
  roster: Array<{ registrationId: string; name: string }>,
  options: DisplayNameMatchOptions = {},
): string | null {
  const minSharedTokens = options.minSharedTokens ?? 2;
  const zoomTokens = new Set(nameTokens(displayName));
  if (zoomTokens.size === 0) return null;

  const strict = roster.filter(
    (entry) => nameTokens(entry.name).filter((token) => zoomTokens.has(token)).length >= 2,
  );
  if (strict.length === 1) return strict[0].registrationId;
  // More than one two-token candidate is genuine ambiguity — never fall
  // through to the looser tier, which could only be more ambiguous.
  if (strict.length > 1 || minSharedTokens === 2) return null;

  const loose = roster.filter((entry) =>
    nameTokens(entry.name).some(
      (token) => token.length >= MIN_DISTINCTIVE_TOKEN_LENGTH && zoomTokens.has(token),
    ),
  );
  return loose.length === 1 ? loose[0].registrationId : null;
}

export async function ensureZoomRegistration(
  registrationId: string,
): Promise<ZoomRegistrationOutcome> {
  if (!isZoomConfigured()) return 'skipped_not_configured';

  const context = await attendanceRepository.selectZoomContext(registrationId);
  if (!context || context.participantDeleted || !context.batchIsActive) {
    return 'skipped_gated';
  }
  if (!context.batchZoomMeetingId) return 'skipped_no_meeting';

  const existing = await attendanceRepository.selectZoomRegistrant(registrationId);
  if (existing) return 'already_registered';

  // Non-throwing (2026-08-13). This used to throw into a caller that only
  // console.errored, so a permanent, account-wide failure was indistinguishable
  // from success: zoom_registrants stayed empty for a month while every Paid
  // transition "succeeded". Reporting it to Sentry is the same fix the nightly
  // sync got on 2026-08-06, for the same reason — a swallowed error on a path
  // nobody watches is a feature that has silently stopped existing.
  const added = await tryAddMeetingRegistrant({
    meetingId: context.batchZoomMeetingId,
    email: context.participantEmail,
    firstName: context.participantFirstName,
    lastName: context.participantSurname,
  });
  if (!added.ok) {
    captureToSentry(new Error(added.message), {
      job: 'zoom_ensure_registration',
      registrationId,
      meetingId: context.batchZoomMeetingId,
    });
    console.error('[zoom ensureZoomRegistration]', added.message);
    return 'failed';
  }

  const inserted = await attendanceRepository.insertZoomRegistrant({
    registration_id: registrationId,
    zoom_registrant_id: added.registrantId,
    join_url: added.joinUrl,
  });
  if (inserted === 'duplicate') return 'already_registered';

  // Personal join link email (email type zoom_link; the engine substitutes
  // the personal link for {{zoom_link}} when a registrant row exists).
  // Email failure never fails the registration — the link is recoverable.
  try {
    await communicationsService.sendEmailOnce(registrationId, 'zoom_link');
  } catch (err) {
    console.error('[zoom_link email]', err);
  }

  return 'registered';
}

export interface ZoomRegistrantBackfillResult {
  batchId: string;
  meetingId: string | null;
  dryRun: boolean;
  // Zoom's approval_type: 0/1 = registration on, 2 = no registration (personal
  // links impossible). NULL means UNKNOWN, not "fine" — reading a meeting needs
  // a `meeting:read` scope the Server-to-Server app has never been granted, so
  // GET /meetings/{id} 400s. See registrationStateReadable below.
  registrationEnabled: boolean | null;
  approvalType: number | null;
  // False when Zoom refused to tell us the meeting's state. Callers must not
  // treat an unknown state as a working one.
  registrationStateReadable: boolean;
  registrationEnabledByThisRun: boolean;
  eligible: number;
  registered: number;
  failed: number;
  outcomes: Array<{ registrationId: string; email: string; outcome: string; detail?: string }>;
  errors: string[];
}

// Repairs a Batch whose settled registrants never got a personal Zoom join
// link (founder-directed 2026-08-13).
//
// zoom_registrants was empty ACCOUNT-WIDE for a month despite the app holding
// meeting:write:registrant and every Paid path calling ensureZoomRegistration.
// Nothing was wired wrong — the failure was invisible: addMeetingRegistrant
// threw into callers that only console.errored, so a permanent failure and a
// success were indistinguishable from the outside. The 2026-08-06 attendance
// investigation found the identical shape one layer over.
//
// Manual trigger only (deliberately absent from vercel.json), CRON_SECRET-gated
// and DRY-RUN BY DEFAULT.
//
// enableRegistration turns a meeting's registration on so personal links can be
// issued. It is opt-in and only acts on a real run, because it changes what the
// meeting's existing SHARED join link does for anyone already holding it — a
// live change for a cohort mid-course, so a human decides per Batch.
//
// (A brief 2026-08-14 rule forbidding this outright was reversed the same day:
// it had been read as "don't replace Zoom", when the actual subject was one
// checkbox per meeting — the very thing that makes attendance exact.)
export async function runZoomRegistrantBackfill(params: {
  batchId: string;
  dryRun?: boolean;
  enableRegistration?: boolean;
}): Promise<ZoomRegistrantBackfillResult> {
  const dryRun = params.dryRun !== false;
  const errors: string[] = [];
  const result: ZoomRegistrantBackfillResult = {
    batchId: params.batchId,
    meetingId: null,
    dryRun,
    registrationEnabled: null,
    approvalType: null,
    registrationStateReadable: false,
    registrationEnabledByThisRun: false,
    eligible: 0,
    registered: 0,
    failed: 0,
    outcomes: [],
    errors,
  };

  if (!isZoomConfigured()) {
    errors.push('Zoom is not configured (ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET).');
    return result;
  }

  const batch = await attendanceRepository.selectBatchForBackfill(params.batchId);
  if (!batch) {
    errors.push(`Batch ${params.batchId} not found.`);
    return result;
  }
  if (!batch.zoom_meeting_id) {
    errors.push(`Batch ${params.batchId} has no zoom_meeting_id — nothing to register against.`);
    return result;
  }
  result.meetingId = batch.zoom_meeting_id;

  // Try to read the meeting's state first. This USUALLY FAILS on the current
  // Zoom app: GET /meetings/{id} needs a `meeting:read` scope that the
  // Server-to-Server app has never been granted (verified 2026-08-14 against
  // the token's own scope list — it holds meeting:write:meeting and
  // meeting:write:registrant, but no meeting read scope at all). An unreadable
  // state is reported as UNKNOWN and must never be mistaken for "fine".
  try {
    const state = await getMeetingRegistrationState(batch.zoom_meeting_id);
    result.registrationEnabled = state.registrationEnabled;
    result.approvalType = state.approvalType;
    result.registrationStateReadable = true;
  } catch (err) {
    result.registrationStateReadable = false;
    errors.push(
      `Could not read meeting settings (this app has no Zoom 'meeting:read' scope, so the state is UNKNOWN, not necessarily fine): ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Turning registration ON. Safe to send even if it is already on — Zoom
  // merges settings, so this is idempotent, which matters precisely because we
  // usually cannot read the current state to check first.
  if (params.enableRegistration && !dryRun) {
    try {
      await enableMeetingRegistration(batch.zoom_meeting_id);
      result.registrationEnabled = true;
      result.registrationEnabledByThisRun = true;
    } catch (err) {
      errors.push(
        `Could not enable registration: ${err instanceof Error ? err.message : String(err)}`,
      );
      return result;
    }
  }

  const pending = await attendanceRepository.selectRegistrationsMissingZoomRegistrant(params.batchId);
  result.eligible = pending.length;

  // Only stop when Zoom has POSITIVELY told us registration is off. An unknown
  // state is not a reason to refuse — attempting is how we find out, and each
  // attempt now reports its own failure rather than vanishing.
  if (result.registrationEnabled === false) {
    errors.push(
      'Meeting has registration DISABLED (approval_type 2), so no registrant can be added to it. Re-run with { "enableRegistration": true, "dryRun": false } to turn it on — note that this changes what the existing shared join link does for anyone already holding it.',
    );
    return result;
  }

  for (const registration of pending) {
    if (dryRun) {
      result.outcomes.push({
        registrationId: registration.registrationId,
        email: registration.email,
        outcome: 'would_register',
      });
      continue;
    }
    const outcome = await ensureZoomRegistration(registration.registrationId);
    if (outcome === 'registered' || outcome === 'already_registered') {
      result.registered += 1;
    } else {
      result.failed += 1;
    }
    result.outcomes.push({
      registrationId: registration.registrationId,
      email: registration.email,
      outcome,
    });
  }

  return result;
}

// Batch transfer support (system review, 2026-07-24), called from
// registrations/service.ts's transferRegistration — same cross-module
// posture as registrations calling portal's ensureParticipantAuth.
// ensureZoomRegistration on its own would short-circuit to
// 'already_registered' (a zoom_registrants row for this registration_id
// already exists, pointed at the OLD Batch's meeting) — clearing it first
// lets the fresh call register against whatever Batch the registration now
// points at.
export async function reregisterForZoomAfterTransfer(
  registrationId: string,
): Promise<ZoomRegistrationOutcome> {
  await attendanceRepository.deleteZoomRegistrantByRegistration(registrationId);
  return ensureZoomRegistration(registrationId);
}

interface AggregatedAttendance {
  registrationId: string;
  sessionDate: string;
  joinTime: string;
  leaveTime: string;
  durationSeconds: number;
  sessionMinutes: number | null;
  source: 'zoom_sync' | 'zoom_name_match';
}

// How long the session itself ran, for the attendance-rate rule's denominator.
//
// The LONGEST single sitting, not the span from the first join to the last
// leave of the day: the room typically opens for a host check in the morning
// and again for stragglers afterwards, so on 2026-08-06 the full-day span was
// ~14 hours against an actual class of 175 minutes. Taking the longest sitting
// picks out the class and ignores the bookends.
export function sessionMinutesFrom(records: ZoomParticipantRecord[]): number | null {
  const spans = new Map<string, { first: string; last: string }>();
  for (const record of records) {
    if (!record.joinTime || !record.leaveTime) continue;
    const span = spans.get(record.instanceId);
    if (!span) {
      spans.set(record.instanceId, { first: record.joinTime, last: record.leaveTime });
      continue;
    }
    if (record.joinTime < span.first) span.first = record.joinTime;
    if (record.leaveTime > span.last) span.last = record.leaveTime;
  }

  let longest = 0;
  for (const span of spans.values()) {
    const from = Date.parse(span.first);
    const to = Date.parse(span.last);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    longest = Math.max(longest, Math.round((to - from) / 60000));
  }
  return longest > 0 ? longest : null;
}

export interface BatchSyncOutcome {
  aggregated: AggregatedAttendance[];
  unmatched: Array<{ name: string; email: string; minutes: number }>;
  matchedByRegistrant: number;
  matchedByEmail: number;
  matchedByName: number;
}

// Pulls one Batch's Zoom participants for one date and resolves them to
// Registrations. Pure of writes so both the nightly sync and the backfill —
// and a dry run of either — share exactly one matching implementation.
export async function resolveBatchAttendance(
  batchId: string,
  zoomMeetingId: string,
  dateIso: string,
  matchOptions: DisplayNameMatchOptions = {},
): Promise<BatchSyncOutcome> {
  const [participants, index] = await Promise.all([
    getMeetingParticipantsOn(zoomMeetingId, dateIso),
    attendanceRepository.selectRegistrationMatchIndex(batchId),
  ]);

  const outcome: BatchSyncOutcome = {
    aggregated: [],
    unmatched: [],
    matchedByRegistrant: 0,
    matchedByEmail: 0,
    matchedByName: 0,
  };

  const sessionMinutes = sessionMinutesFrom(participants);

  // One participant can appear several times (drop and rejoin, or a second
  // sitting of the same meeting on the same day) — aggregate per registration
  // per session date.
  const aggregated = new Map<string, AggregatedAttendance>();
  for (const record of participants) {
    // Most exact key first: a personal registrant link needs no matching at
    // all. Then the registered email. Only then the self-typed display name.
    let registrationId = record.registrantId
      ? index.byRegistrantId.get(record.registrantId)
      : undefined;
    let source: AggregatedAttendance['source'] = 'zoom_sync';
    if (registrationId) {
      outcome.matchedByRegistrant += 1;
    } else {
      if (record.email) registrationId = index.byEmail.get(record.email);
      if (registrationId) {
        outcome.matchedByEmail += 1;
      } else {
        const named = matchByDisplayName(record.name, index.roster, matchOptions);
        if (named) {
          registrationId = named;
          source = 'zoom_name_match';
          outcome.matchedByName += 1;
        }
      }
    }

    if (!registrationId) {
      outcome.unmatched.push({
        name: record.name,
        email: record.email,
        minutes: Math.round(record.durationSeconds / 60),
      });
      continue;
    }

    const sessionDate = record.joinTime.slice(0, 10) || dateIso;
    const key = `${registrationId}:${sessionDate}`;
    const entry = aggregated.get(key);
    if (entry) {
      entry.durationSeconds += record.durationSeconds;
      if (record.joinTime && record.joinTime < entry.joinTime) entry.joinTime = record.joinTime;
      if (record.leaveTime > entry.leaveTime) entry.leaveTime = record.leaveTime;
      // An observed match anywhere in the person's join records outranks an
      // inferred one — don't let a later name-matched rejoin downgrade it.
      if (source === 'zoom_sync') entry.source = 'zoom_sync';
    } else {
      aggregated.set(key, {
        registrationId,
        sessionDate,
        joinTime: record.joinTime,
        leaveTime: record.leaveTime,
        durationSeconds: record.durationSeconds,
        sessionMinutes,
        source,
      });
    }
  }

  outcome.aggregated = [...aggregated.values()];
  return outcome;
}

async function writeAggregated(entries: AggregatedAttendance[]): Promise<number> {
  let written = 0;
  for (const entry of entries) {
    await attendanceRepository.upsertAttendance({
      registration_id: entry.registrationId,
      session_date: entry.sessionDate,
      join_time: entry.joinTime || null,
      leave_time: entry.leaveTime || null,
      duration_minutes: Math.round(entry.durationSeconds / 60),
      session_minutes: entry.sessionMinutes,
      source: entry.source,
    });
    written += 1;
  }
  return written;
}

export async function runAttendanceSync(now = new Date()): Promise<AttendanceSyncSummary> {
  const dateIso = now.toISOString().slice(0, 10);
  const summary: AttendanceSyncSummary = {
    date: dateIso,
    batchesEvaluated: 0,
    rowsUpserted: 0,
    unmatchedParticipants: 0,
    matchedByRegistrant: 0,
    matchedByEmail: 0,
    matchedByName: 0,
    errors: [],
  };
  if (!isZoomConfigured()) {
    summary.errors.push('Zoom is not configured — no attendance was synced.');
    return summary;
  }

  const batches = await attendanceRepository.selectBatchesForAttendanceSync(dateIso);
  for (const batch of batches) {
    summary.batchesEvaluated += 1;
    try {
      const outcome = await resolveBatchAttendance(batch.id, batch.zoom_meeting_id, dateIso);
      summary.rowsUpserted += await writeAggregated(outcome.aggregated);
      summary.unmatchedParticipants += outcome.unmatched.length;
      summary.matchedByRegistrant += outcome.matchedByRegistrant;
      summary.matchedByEmail += outcome.matchedByEmail;
      summary.matchedByName += outcome.matchedByName;
    } catch (err) {
      summary.errors.push(`${batch.id}: ${String(err)}`);
    }
  }
  return summary;
}

export interface AttendanceBackfillResult extends AttendanceSyncSummary {
  batchId: string;
  dates: string[];
  dryRun: boolean;
  // Zoom attendees that resolved to nobody on the roster — the review list.
  unmatched: Array<{ date: string; name: string; email: string; minutes: number }>;
}

// Recovers a Batch whose sessions ran while the sync was failing.
//
// runAttendanceSync deliberately only looks at batches still in progress
// (selectBatchesForAttendanceSync), so once a Batch's window closes its
// sessions can never be picked up again. This is the explicit, admin-driven
// way back in: one named Batch, named dates, and a dry run by default so the
// matching can be reviewed before anything is written.
export async function runAttendanceBackfill(params: {
  batchId: string;
  dates?: string[];
  dryRun?: boolean;
  minSharedTokens?: 1 | 2;
}): Promise<AttendanceBackfillResult> {
  const dryRun = params.dryRun ?? true;
  const matchOptions: DisplayNameMatchOptions = { minSharedTokens: params.minSharedTokens ?? 2 };
  const batch = await attendanceRepository.selectBatchForBackfill(params.batchId);
  if (!batch) {
    throw new AppError(
      'NOT_FOUND',
      'Batch not found, or it has no Zoom meeting id to sync attendance from.',
      404,
    );
  }
  const dates = params.dates?.length
    ? params.dates
    : datesBetween(batch.start_date, batch.end_date);

  const result: AttendanceBackfillResult = {
    batchId: batch.id,
    dates,
    dryRun,
    date: dates[dates.length - 1] ?? '',
    batchesEvaluated: 1,
    rowsUpserted: 0,
    unmatchedParticipants: 0,
    matchedByRegistrant: 0,
    matchedByEmail: 0,
    matchedByName: 0,
    unmatched: [],
    errors: [],
  };
  if (!isZoomConfigured()) {
    result.errors.push('Zoom is not configured — nothing to backfill from.');
    return result;
  }

  for (const dateIso of dates) {
    try {
      const outcome = await resolveBatchAttendance(
        batch.id,
        batch.zoom_meeting_id,
        dateIso,
        matchOptions,
      );
      result.matchedByRegistrant += outcome.matchedByRegistrant;
      result.matchedByEmail += outcome.matchedByEmail;
      result.matchedByName += outcome.matchedByName;
      result.unmatchedParticipants += outcome.unmatched.length;
      result.unmatched.push(...outcome.unmatched.map((u) => ({ date: dateIso, ...u })));
      result.rowsUpserted += dryRun
        ? outcome.aggregated.length
        : await writeAggregated(outcome.aggregated);
    } catch (err) {
      result.errors.push(`${batch.id} ${dateIso}: ${String(err)}`);
    }
  }
  return result;
}

function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const end = Date.parse(endDate);
  for (let day = Date.parse(startDate); day <= end; day += 24 * 60 * 60 * 1000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

function toAttendanceEntry(row: {
  registration_id: string;
  participant_name: string;
  participant_email: string;
  session_date: string;
  join_time: string | null;
  leave_time: string | null;
  duration_minutes: number;
  session_minutes?: number | null;
}) {
  return {
    registrationId: row.registration_id,
    participantName: row.participant_name,
    participantEmail: row.participant_email,
    sessionDate: row.session_date,
    joinTime: row.join_time,
    leaveTime: row.leave_time,
    durationMinutes: row.duration_minutes,
    sessionMinutes: row.session_minutes ?? null,
    // Shown alongside the raw minutes so staff can see WHY someone counts as
    // absent for certificates despite having an attendance row.
    attendanceRatePercent: attendanceRatePercent(row.duration_minutes, row.session_minutes),
    meetsThreshold: meetsAttendanceThreshold(row.duration_minutes, row.session_minutes),
  };
}

// Staff-facing view (RLS enforces admin/management read access).
export async function getAttendanceForBatch(batchId: string) {
  const rows = await attendanceRepository.selectAttendanceForBatch(batchId);
  return rows.map(toAttendanceEntry);
}

// Tutor-portal view — see selectAttendanceForBatchSystem's comment: a
// tutor-portal session carries no Supabase Auth session, so the RLS-gated
// read above returns nothing for these callers. Called only by
// modules/tutors, which has already verified batch ownership.
export async function getAttendanceForBatchSystem(batchId: string) {
  const rows = await attendanceRepository.selectAttendanceForBatchSystem(batchId);
  return rows.map(toAttendanceEntry);
}

// --- Attendance Exceptions (Tutor Portal Phase 4, founder-approved 2026-07-31) ---
//
// A tutor never writes to `attendance` directly (BR-34). A raised exception
// always starts 'pending'; only an admin's review can change attendance
// data, and only for 'correction_request' — 'no_show_flag' is advisory
// only (visible to staff, never mutates attendance).

const EXCEPTION_STAFF_ROLES = ['admin', 'management'] as const;

export interface RaiseAttendanceExceptionInput {
  registrationId: string;
  batchId: string;
  sessionDate: string;
  exceptionType: 'no_show_flag' | 'correction_request';
  reason: string;
  requestedPresent?: boolean;
  raisedByTutorId: string;
}

// Called only by modules/tutors, after it has verified the batch (and the
// registration's membership in that batch's roster) belongs to the calling
// tutor's own session.
export async function raiseAttendanceException(input: RaiseAttendanceExceptionInput) {
  if (input.exceptionType === 'correction_request' && input.requestedPresent === undefined) {
    throw new AppError(
      'VALIDATION_ERROR',
      'A correction request must say whether the participant should be marked present or absent.',
      400,
    );
  }
  const row = await attendanceRepository.insertAttendanceExceptionSystem({
    registration_id: input.registrationId,
    batch_id: input.batchId,
    session_date: input.sessionDate,
    exception_type: input.exceptionType,
    raised_by_tutor_id: input.raisedByTutorId,
    requested_present: input.requestedPresent ?? null,
    reason: input.reason,
  });
  return row;
}

export interface AttendanceExceptionView {
  id: string;
  registrationId: string;
  batchId: string;
  sessionDate: string;
  exceptionType: 'no_show_flag' | 'correction_request';
  requestedPresent: boolean | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  participantName: string;
  participantEmail: string;
}

export async function listAttendanceExceptions(filters?: {
  status?: 'pending' | 'approved' | 'rejected';
}): Promise<AttendanceExceptionView[]> {
  await usersService.requireRole([...EXCEPTION_STAFF_ROLES]);
  const rows = await attendanceRepository.selectAttendanceExceptions(filters);
  const infoByRegistration = await attendanceRepository.selectParticipantInfoForRegistrations(
    rows.map((row) => row.registration_id),
  );
  return rows.map((row) => ({
    id: row.id,
    registrationId: row.registration_id,
    batchId: row.batch_id,
    sessionDate: row.session_date,
    exceptionType: row.exception_type as 'no_show_flag' | 'correction_request',
    requestedPresent: row.requested_present,
    reason: row.reason,
    status: row.status as 'pending' | 'approved' | 'rejected',
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    participantName: infoByRegistration.get(row.registration_id)?.name ?? '',
    participantEmail: infoByRegistration.get(row.registration_id)?.email ?? '',
  }));
}

export async function reviewAttendanceException(
  exceptionId: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string,
): Promise<void> {
  const staffUser = await usersService.requireRole([...EXCEPTION_STAFF_ROLES]);
  const existing = await attendanceRepository.selectAttendanceExceptionById(exceptionId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Attendance exception not found.', 404);
  }
  if (existing.status !== 'pending') {
    throw new AppError('VALIDATION_ERROR', 'This exception has already been reviewed.', 409);
  }

  if (decision === 'approved' && existing.exception_type === 'correction_request') {
    await attendanceRepository.applyManualAttendanceCorrection({
      registration_id: existing.registration_id,
      session_date: existing.session_date,
      present: existing.requested_present ?? false,
    });
  }

  await attendanceRepository.updateAttendanceExceptionById(exceptionId, {
    status: decision,
    reviewed_by: staffUser.id,
    reviewed_at: new Date().toISOString(),
    review_note: reviewNote ?? null,
  });
}
