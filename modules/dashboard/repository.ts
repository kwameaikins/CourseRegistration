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
  registrations: Array<{
    registrationId: string;
    leadSource: string;
    registeredAt: string;
    paymentStatus: string;
    amountPaid: number;
    courseFee: number;
  }>;
}

export async function selectDashboardData(): Promise<BatchSummaryRaw[]> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: batches, error: batchesError } = await supabase
    .from('batches')
    .select('id, course_id, cohort_label, start_date, course_fee, is_active')
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

  const { data: registrations, error: registrationsError } = await supabase
    .from('registrations')
    .select('id, batch_id, lead_source, registered_at')
    .in('batch_id', batches.map((batch) => batch.id));
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
