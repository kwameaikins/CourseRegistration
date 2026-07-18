// F1.08 — Management Dashboard (Document 8, Section 3). Default landing page
// for admin and management. All figures computed live per request.
import Link from 'next/link';

import * as dashboardService from '@/modules/dashboard/service';
import * as usersService from '@/modules/users/service';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatGhs } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function conversionColor(rate: number): string {
  // Green ≥ 70%, amber 40–69%, red < 40% (Document 8, Section 3).
  if (rate >= 70) return 'text-emerald-600';
  if (rate >= 40) return 'text-amber-600';
  return 'text-red-600';
}

export default async function ManagementDashboardPage() {
  const [summary, staffUser] = await Promise.all([
    dashboardService.getDashboardSummary(),
    usersService.getCurrentStaffUser(),
  ]);
  const isAdmin = staffUser?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Last updated: just now</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registrations This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.aggregate.registrationsThisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Revenue Received This Month
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
                    {formatGhs(batch.revenueReceived)} of {formatGhs(batch.expectedRevenue)}{' '}
                    received
                  </p>
                  <p
                    className={`text-2xl font-bold ${conversionColor(batch.paymentConversionRate)}`}
                  >
                    {batch.paymentConversionRate}%
                  </p>
                </div>
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
    </div>
  );
}
