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
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await usersService.requireRole(['admin', 'management']);

  const [batches, leadPipeline, salesPipeline, corporateSummary] = await Promise.all([
    dashboardRepository.selectDashboardData(),
    leadsService.getPipelineSummary(),
    opportunitiesService.getPipelineSummary(),
    corporateService.getCorporateSummary(),
  ]);

  const courses = batches.map((batch) => {
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
      totalRegistered: total,
      totalPaid: paid,
      totalUnpaid: unpaid,
      totalPartPayment: part,
      expectedRevenue: round2(expectedRevenue),
      revenueReceived: round2(revenueReceived),
      outstandingBalance: round2(expectedRevenue - revenueReceived),
      paymentConversionRate: total === 0 ? 0 : round2((paid / total) * 100),
    };
  });

  const allRegistrations = batches.flatMap((batch) => batch.registrations);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const registrationsThisMonth = allRegistrations.filter(
    (r) => new Date(r.registeredAt) >= monthStart,
  );

  const leadSourceMap = new Map<string, { count: number; paid: number }>();
  for (const registration of allRegistrations) {
    const entry = leadSourceMap.get(registration.leadSource) ?? { count: 0, paid: 0 };
    entry.count += 1;
    if (registration.paymentStatus === 'Paid') entry.paid += 1;
    leadSourceMap.set(registration.leadSource, entry);
  }

  return {
    courses,
    aggregate: {
      registrationsThisMonth: registrationsThisMonth.length,
      // "Revenue this month" is approximated as amounts received against
      // registrations created this month — payment_date granularity per
      // payment event is a Phase 2 refinement.
      revenueReceivedThisMonth: round2(
        registrationsThisMonth.reduce((sum, r) => sum + r.amountPaid, 0),
      ),
      totalOutstandingBalance: round2(
        allRegistrations.reduce((sum, r) => sum + (r.courseFee - r.amountPaid), 0),
      ),
    },
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
