// F1.08 — Management Dashboard (Document 8, Section 3). Default landing page
// for admin and management. All figures computed live per request.
import Link from 'next/link';

import * as dashboardService from '@/modules/dashboard/service';
import * as usersService from '@/modules/users/service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatGhs } from '@/lib/utils';
import { DashboardDateRangeForm } from './date-range-form';

export const dynamic = 'force-dynamic';

function conversionColor(rate: number): string {
  // Green ≥ 70%, amber 40–69%, red < 40% (Document 8, Section 3).
  if (rate >= 70) return 'text-emerald-600';
  if (rate >= 40) return 'text-amber-600';
  return 'text-red-600';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readDate(value: string | string[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first && ISO_DATE.test(first) ? first : '';
}

export default async function ManagementDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const dateFrom = readDate(params.dateFrom);
  const dateTo = readDate(params.dateTo);

  const [summary, staffUser] = await Promise.all([
    dashboardService.getDashboardSummary({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    usersService.getCurrentStaffUser(),
  ]);
  const isAdmin = staffUser?.role === 'admin';
  const hasRange = Boolean(dateFrom || dateTo);
  // Tiles report the chosen window when there is one, "this month" otherwise.
  const periodLabel = hasRange
    ? `${dateFrom ? formatDate(dateFrom) : 'the beginning'} – ${dateTo ? formatDate(dateTo) : 'today'}`
    : 'This Month';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last updated: just now</p>
      </div>

      <div className="space-y-2">
        <DashboardDateRangeForm value={{ dateFrom, dateTo }} />
        {hasRange && (
          <p className="text-sm text-muted-foreground">
            Filtering by registration date: <strong>{periodLabel}</strong>. Cohorts with no
            registrations in this window are hidden. Total Outstanding is a live balance and
            is never date-filtered.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registrations — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.aggregate.registrationsThisMonth}</p>
          </CardContent>
        </Card>
        {/* Repeat business (2026-08-13). Counted from registration history, not
            from the 'Returning' lead source — that only marks people who came
            back via the portal, so it would undercount anyone re-registering
            through the public form. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Repeat Enrolments — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.repeatEnrolment.repeatRate}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.repeatEnrolment.repeatRegistrations} of{' '}
              {summary.repeatEnrolment.registrations} registrations, from{' '}
              {summary.repeatEnrolment.returningParticipants} returning participant
              {summary.repeatEnrolment.returningParticipants === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Received — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatGhs(summary.aggregate.revenueReceivedThisMonth)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatGhs(summary.aggregate.totalOutstandingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {summary.courses.map((batch) => {
          const card = (
            <Card
              key={batch.batchId}
              className={isAdmin ? 'transition-colors hover:border-primary' : undefined}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-baseline justify-between text-base">
                  <span>
                    {batch.courseName}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {batch.cohortLabel}
                    </span>
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    starts {formatDate(batch.startDate)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* A free event has no fee to collect, so the paid/part/unpaid
                    split and the "X of Y received" line are meaningless — show
                    the sign-up count instead of a revenue card reading zero. */}
                {batch.isFree ? (
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm">
                      <strong>{batch.totalRegistered}</strong> registered
                    </p>
                    <p className="text-sm font-medium text-emerald-600">Free event</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-4 text-sm">
                      <span>
                        <strong>{batch.totalRegistered}</strong> registered
                      </span>
                      <span className="text-emerald-600">
                        <strong>{batch.totalPaid}</strong> paid
                      </span>
                      <span className="text-amber-600">
                        <strong>{batch.totalPartPayment}</strong> part
                      </span>
                      <span className="text-red-600">
                        <strong>{batch.totalUnpaid}</strong> unpaid
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm text-muted-foreground">
                        {formatGhs(batch.revenueReceived)} of{' '}
                        {formatGhs(batch.expectedRevenue)} received
                      </p>
                      <p
                        className={`text-2xl font-bold ${conversionColor(batch.paymentConversionRate)}`}
                      >
                        {batch.paymentConversionRate}%
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
          // Only Admin cards navigate; Management cards are intentionally
          // non-interactive (Document 8, Section 3).
          return isAdmin ? (
            <Link key={batch.batchId} href={`/registrations?batchId=${batch.batchId}`}>
              {card}
            </Link>
          ) : (
            card
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Registrations</th>
                <th className="py-2 font-medium">Paid Conversion</th>
              </tr>
            </thead>
            <tbody>
              {summary.leadSources.map((leadSource) => (
                <tr key={leadSource.source} className="border-b last:border-0">
                  <td className="py-2">{leadSource.source}</td>
                  <td className="py-2">{leadSource.count}</td>
                  <td className="py-2">{leadSource.conversionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.leadSources.length === 0 && (
            <p className="text-sm text-muted-foreground">No registrations yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>
                <strong>{summary.leadPipeline.total}</strong> total leads
              </span>
              <span>
                <strong>{summary.leadPipeline.unassigned}</strong> unassigned
              </span>
              <span>
                <strong>{summary.leadPipeline.averageScore}</strong> avg. score
              </span>
            </div>
            <div className="space-y-1 text-sm">
              {Object.entries(summary.leadPipeline.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between border-b py-1 last:border-0">
                  <span className="text-muted-foreground">{status}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(summary.leadPipeline.byStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>
                <strong>{summary.salesPipeline.total}</strong> opportunities
              </span>
              <span className="text-muted-foreground">
                {formatGhs(summary.salesPipeline.openValue)} open
              </span>
              <span className="text-emerald-600">
                {formatGhs(summary.salesPipeline.wonValue)} won
              </span>
            </div>
            <div className="space-y-1 text-sm">
              {Object.entries(summary.salesPipeline.byStage).map(([stage, count]) => (
                <div key={stage} className="flex justify-between border-b py-1 last:border-0">
                  <span className="text-muted-foreground">{stage}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(summary.salesPipeline.byStage).length === 0 && (
                <p className="text-sm text-muted-foreground">No opportunities yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corporate</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span>
                <strong>{summary.corporateSummary.totalCompanies}</strong> companies
              </span>
              <span>
                <strong>{summary.corporateSummary.seatsFilled}</strong>/{summary.corporateSummary.seatsSold} seats filled
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between border-b py-1">
                <span className="text-muted-foreground">Invoiced</span>
                <span className="font-medium">{formatGhs(summary.corporateSummary.amountInvoiced)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Settled</span>
                <span className="font-medium">{formatGhs(summary.corporateSummary.amountSettled)}</span>
              </div>
            </div>
            <Link href="/corporate" className="text-sm font-medium text-primary hover:underline">
              View corporate clients →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
