// Read-only aggregations for F1.08. The dashboard owns no tables (Document 2,
// Section 4) and computes everything live on each request (Document 3,
// Section 2 — derived data, no cache in Phase 1).
//
// This repository uses the service-role client because the Management role
// deliberately has no row-level access to registrations/payments (F1.09 —
// Management sees aggregate figures only, never row data). The service layer
// verifies the session role is admin or management before any query runs.
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export interface BatchSummaryRaw {
  batchId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string;
  courseFee: number;
  isFree: boolean;
  registrations: Array<{
    registrationId: string;
    leadSource: string;
    registeredAt: string;
    paymentStatus: string;
    amountPaid: number;
    courseFee: number;
  }>;
}

// Repeat-enrolment rate (founder-directed 2026-08-13). Deliberately derived
// from registration history rather than from `lead_source = 'Returning'`: that
// value is only ever set by the portal's one-click enrolment (BR-43), so it
// counts the PATH someone took, not the fact that they came back. A returning
// student who registers through the public form while logged out picks a real
// marketing channel — correctly, since that channel is what re-reached them —
// and would be invisible to a lead-source count. Any registration that is not a
// participant's first IS a repeat, and that is computable exactly.
//
// This cannot reuse selectDashboardData: that read is scoped to ACTIVE batches,
// so a participant whose first course ran on a since-deactivated cohort would
// look like a first-timer.
export async function selectRepeatEnrolmentStats(
  dateFrom: string | null,
  dateTo: string | null,
): Promise<{ inWindow: number; repeat: number; returningParticipants: number }> {
  const supabase = createSupabaseServiceRoleClient();

  // Population being measured: same exclusions as every other dashboard figure
  // — a written-off or cancelled registration is not business we counted.
  let windowQuery = supabase
    .from('registrations')
    .select('id, participant_id, registered_at')
    .is('lapsed_at', null)
    .neq('registration_status', 'Cancelled');
  if (dateFrom) windowQuery = windowQuery.gte('registered_at', `${dateFrom}T00:00:00.000Z`);
  if (dateTo) windowQuery = windowQuery.lte('registered_at', `${dateTo}T23:59:59.999Z`);

  const { data: windowRows, error: windowError } = await windowQuery;
  if (windowError) throw windowError;
  if (!windowRows || windowRows.length === 0) {
    return { inWindow: 0, repeat: 0, returningParticipants: 0 };
  }

  const participantIds = [...new Set(windowRows.map((row) => row.participant_id))];

  // History lookup applies NO status filter, unlike the population above. The
  // question here is "had this person enrolled with us before", and a prior
  // registration they cancelled or that was later written off still means they
  // are not new to us — filtering those out would misclassify a genuine
  // returner as a first-timer. Bounded by the participants active in the
  // window rather than scanning the whole table.
  const { data: historyRows, error: historyError } = await supabase
    .from('registrations')
    .select('participant_id, registered_at')
    .in('participant_id', participantIds);
  if (historyError) throw historyError;

  const earliestByParticipant = new Map<string, string>();
  for (const row of historyRows ?? []) {
    const current = earliestByParticipant.get(row.participant_id);
    if (!current || row.registered_at < current) {
      earliestByParticipant.set(row.participant_id, row.registered_at);
    }
  }

  const returning = new Set<string>();
  let repeat = 0;
  for (const row of windowRows) {
    const earliest = earliestByParticipant.get(row.participant_id);
    // Strictly later than their first: the first registration itself is never a
    // repeat, and comparing on the timestamp rather than a count keeps this
    // correct when only part of someone's history falls inside the window.
    if (earliest && row.registered_at > earliest) {
      repeat += 1;
      returning.add(row.participant_id);
    }
  }

  return { inWindow: windowRows.length, repeat, returningParticipants: returning.size };
}

export async function selectDashboardData(): Promise<BatchSummaryRaw[]> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id, course_id, cohort_label, start_date, course_fee, is_free, is_active')
    .eq('is_active', true)
    .order('start_date', { ascending: true });
  if (batchesError) throw batchesError;
  if (batches.length === 0) return [];

  const { data: courses, error: coursesError } = await supabase
    .from('courses')
    .select('id, course_name')
    .in('id', [...new Set(batches.map((batch) => batch.course_id))]);
  if (coursesError) throw coursesError;
  const courseNameById = new Map(courses.map((course) => [course.id, course.course_name]));

  // Written-off registrations are excluded from every dashboard figure
  // (2026-08-09). This is the read that made Total Outstanding wrong: it took
  // every registration on an active batch with no status filter at all, so an
  // unpaid no-show from a cohort that finished months ago still counted as
  // money we expected to collect.
  //
  // Excluded from expectedRevenue as well as outstandingBalance, not just the
  // latter — a fee nobody will ever pay was never revenue we expected, and
  // leaving it in the numerator would drag every conversion rate down for a
  // debt that has been closed.
  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, batch_id, lead_source, registered_at')
    .in('batch_id', batches.map((batch) => batch.id))
    .is('lapsed_at', null);
  if (registrationsError) throw registrationsError;

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('registration_id, payment_status, amount_paid, course_fee')
    .in('registration_id', registrations.map((registration) => registration.id));
  if (paymentsError) throw paymentsError;
  const paymentByRegistrationId = new Map(
    payments.map((payment) => [payment.registration_id, payment]),
  );

  return batches.map((batch) => ({
    batchId: batch.id,
    courseName: courseNameById.get(batch.course_id) ?? '',
    cohortLabel: batch.cohort_label,
    startDate: batch.start_date,
    courseFee: Number(batch.course_fee),
    isFree: batch.is_free,
    registrations: registrations
      .filter((registration) => registration.batch_id === batch.id)
      .map((registration) => {
        const payment = paymentByRegistrationId.get(registration.id);
        return {
          registrationId: registration.id,
          leadSource: registration.lead_source,
          registeredAt: registration.registered_at,
          paymentStatus: payment?.payment_status ?? 'Unpaid',
          amountPaid: Number(payment?.amount_paid ?? 0),
          courseFee: Number(payment?.course_fee ?? batch.course_fee),
        };
      }),
  }));
}
