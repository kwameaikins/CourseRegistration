import { stringifyCsv } from '@/lib/csv';
import { handleRouteError } from '@/lib/errors';
import * as opportunitiesService from '@/modules/opportunities/service';
import * as usersService from '@/modules/users/service';

// GET /api/opportunities/export — CSV of the sales pipeline (Revenue OS
// Phase 2, 2026-09-03). Same roles as GET /api/opportunities; every row.
export async function GET() {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const opportunities = await opportunitiesService.listOpportunities();

    const csv = stringifyCsv([
      [
        'Deal', 'Cohort', 'Stage', 'Amount', 'In Stage Since',
        'Expected Close', 'Notes', 'Created',
      ],
      ...opportunities.map((opportunity) => [
        opportunity.courseName,
        opportunity.batchLabel,
        opportunity.stage,
        String(opportunity.amount),
        opportunity.stageChangedAt,
        opportunity.expectedCloseDate ?? '',
        opportunity.notes ?? '',
        opportunity.createdAt,
      ]),
    ]);

    const fileName = `opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
