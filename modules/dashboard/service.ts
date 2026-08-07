// F1.08 — dashboard summary computation (Document 5, Section 10).
import * as dashboardRepository from '@/modules/dashboard/repository';
import * as usersService from '@/modules/users/service';
import * as leadsService from '@/modules/leads/service';
import * as opportunitiesService from '@/modules/opportunities/service';
import * as corporateService from '@/modules/corporate/service';

export interface DashboardSummary {
  courses: Array<{
    batchId: string;
    courseName: string;
    cohortLabel: string;
    startDate: string;
    // Free event / webinar. Every money figure below is 0 and every
    // registration reads as Paid, so the dashboard renders a registration
    // count for these instead of a revenue line and a 0%-collection tile.
    isFree: boolean;
    totalRegistered: number;
    totalPaid: number;
    totalUnpaid: number;
    totalPartPayment: number;
    expectedRevenue: number;
    revenueReceived: number;
    outstandingBalance: number;
    paymentConversionRate: number;
  }>;
  aggregate: {
    registrationsThisMonth: number;
    revenueReceivedThisMonth: number;
    totalOutstandingBalance: number;
  };
  leadSources: Array<{ source: string; count: number; conversionRate: number }>;
  // Revenue OS Phase 1 roadmap: give executives a single screen that spans
  // registrations/revenue AND the lead/sales pipeline health.
  leadPipeline: {
    total: number;
    unassigned: number;
    averageScore: number;
    byStatus: Record<string, number>;
  };
  salesPipeline: {
    total: number;
    openValue: number;
    wonValue: number;
    byStage: Record<string, number>;
  };
  // Corporate registration (2026-07-26) — companies/seats/invoicing summary,
  // computed live from the same source as the individual company/allocation
  // detail screens (never a separately-maintained counter).
  corporateSummary: {
    totalCompanies: number;
    seatsSold: number;
    seatsFilled: number;
    amountInvoiced: number;
    amountSettled: number;
  };
  // Echoed back so the page can label the tiles for the window actually
  // applied rather than hard-coding "this month".
  appliedRange: { dateFrom: string | null; dateTo: string | null };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DashboardDateRange {
  dateFrom?: string;
  dateTo?: string;
}

// Inclusive of both bounds: dateTo is a calendar day, so it must cover that
// whole day rather than stopping at its midnight boundary.
function withinRange(registeredAt: string, range: DashboardDateRange): boolean {
  const day = registeredAt.slice(0, 10);
  if (range.dateFrom && day < range.dateFrom) return false;
  if (range.dateTo && day > range.dateTo) return false;
  return true;
}

export async function getDashboardSummary(
  range: DashboardDateRange = {},
): Promise<DashboardSummary> {
  await usersService.requireRole(['admin', 'management']);
  const hasRange = Boolean(range.dateFrom || range.dateTo);

  const [batches, leadPipeline, salesPipeline, corporateSummary] = await Promise.all([
    dashboardRepository.selectDashboardData(),
    leadsService.getPipelineSummary(),
    opportunitiesService.getPipelineSummary(),
    corporateService.getCorporateSummary(),
  ]);

  // The range filters REGISTRATIONS, not batches: a cohort that started
  // outside the window can still have taken registrations inside it, and
  // dropping the batch would lose that money from every figure below. A batch
  // left with no registrations in range is dropped from the per-course table
  // instead, so the table shows only cohorts with activity in the window.
  const rangedBatches = hasRange
    ? batches
        .map((batch) => ({
          ...batch,
          registrations: batch.registrations.filter((r) => withinRange(r.registeredAt, range)),
        }))
        .filter((batch) => batch.registrations.length > 0)
    : batches;

  const courses = rangedBatches.map((batch) => {
    const total = batch.registrations.length;
    const paid = batch.registrations.filter((r) => r.paymentStatus === 'Paid').length;
    const part = batch.registrations.filter(
      (r) => r.paymentStatus === 'Part Payment',
    ).length;
    const unpaid = total - paid - part;
    const expectedRevenue = batch.registrations.reduce((sum, r) => sum + r.courseFee, 0);
    const revenueReceived = batch.registrations.reduce((sum, r) => sum + r.amountPaid, 0);
    return {
      batchId: batch.batchId,
      courseName: batch.courseName,
      cohortLabel: batch.cohortLabel,
      startDate: batch.startDate,
      isFree: batch.isFree,
      totalRegistered: total,
      totalPaid: paid,
      totalUnpaid: unpaid,
      totalPartPayment: part,
      expectedRevenue: round2(expectedRevenue),
      revenueReceived: round2(revenueReceived),
      outstandingBalance: round2(expectedRevenue - revenueReceived),
      // A free event has no fee to collect, so "0 of 0 received, 0%" is not a
      // collection failure — it is a category error. Report it as 100% rather
      // than dragging the batch card into the red.
      paymentConversionRate: batch.isFree ? 100 : total === 0 ? 0 : round2((paid / total) * 100),
    };
  });

  // Two populations, deliberately: free-event registrations are real
  // registrations and belong in the volume count, but they all read as Paid
  // against a zero fee (see 202608030048), so including them in the money and
  // conversion figures would inflate every conversion rate while contributing
  // no revenue.
  const allRegistrations = rangedBatches.flatMap((batch) => batch.registrations);
  const revenueRegistrations = rangedBatches
    .filter((batch) => !batch.isFree)
    .flatMap((batch) => batch.registrations);

  // With no explicit range the headline tiles keep their original
  // "this month" meaning; with one, they report the chosen window instead —
  // the tile labels change to match (see the dashboard page).
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const registrationsInPeriod = hasRange
    ? allRegistrations
    : allRegistrations.filter((r) => new Date(r.registeredAt) >= monthStart);
  const revenueRegistrationsInPeriod = hasRange
    ? revenueRegistrations
    : revenueRegistrations.filter((r) => new Date(r.registeredAt) >= monthStart);

  const leadSourceMap = new Map<string, { count: number; paid: number }>();
  for (const registration of revenueRegistrations) {
    const entry = leadSourceMap.get(registration.leadSource) ?? { count: 0, paid: 0 };
    entry.count += 1;
    if (registration.paymentStatus === 'Paid') entry.paid += 1;
    leadSourceMap.set(registration.leadSource, entry);
  }

  return {
    courses,
    aggregate: {
      registrationsThisMonth: registrationsInPeriod.length,
      // Revenue is approximated as amounts received against registrations
      // CREATED in the period — payment_date granularity per payment event is
      // a Phase 2 refinement. Worth knowing when reading a narrow range: a
      // payment collected inside the window against an older registration is
      // not counted here.
      revenueReceivedThisMonth: round2(
        revenueRegistrationsInPeriod.reduce((sum, r) => sum + r.amountPaid, 0),
      ),
      totalOutstandingBalance: round2(
        revenueRegistrations.reduce((sum, r) => sum + (r.courseFee - r.amountPaid), 0),
      ),
    },
    appliedRange: { dateFrom: range.dateFrom ?? null, dateTo: range.dateTo ?? null },
    leadSources: [...leadSourceMap.entries()]
      .map(([source, entry]) => ({
        source,
        count: entry.count,
        conversionRate: entry.count === 0 ? 0 : round2((entry.paid / entry.count) * 100),
      }))
      .sort((a, b) => b.count - a.count),
    leadPipeline: {
      total: leadPipeline.total,
      unassigned: leadPipeline.unassigned,
      averageScore: leadPipeline.averageScore,
      byStatus: leadPipeline.byStatus,
    },
    salesPipeline: {
      total: salesPipeline.total,
      openValue: salesPipeline.openValue,
      wonValue: salesPipeline.wonValue,
      byStage: salesPipeline.byStage,
    },
    corporateSummary,
  };
}
