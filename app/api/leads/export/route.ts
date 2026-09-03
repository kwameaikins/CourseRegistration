import { stringifyCsv } from '@/lib/csv';
import { AppError, handleRouteError } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import { listLeadsFiltersSchema } from '@/modules/leads/types';
import * as usersService from '@/modules/users/service';

// GET /api/leads/export — CSV of leads (Revenue OS Phase 2, 2026-09-03).
// Same filters and same roles as GET /api/leads; every matching row, no page.
export async function GET(request: Request) {
  try {
    await usersService.requireRole(['admin', 'marketing', 'management']);
    const { searchParams } = new URL(request.url);
    const parsed = listLeadsFiltersSchema.safeParse(
      Object.fromEntries(searchParams.entries()),
    );
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid filter parameters.', 400);
    }

    const leads = await leadsService.listLeads(parsed.data);
    const csv = stringifyCsv([
      [
        'Name', 'Email', 'Phone', 'Company', 'Job Title', 'Source', 'Status',
        'Score', 'Next Follow-up', 'UTM Source', 'UTM Campaign', 'Notes', 'Created',
      ],
      ...leads.map((lead) => [
        lead.fullName,
        lead.email,
        lead.phone,
        lead.company ?? '',
        lead.jobTitle ?? '',
        lead.leadSource,
        lead.status,
        String(lead.score),
        lead.nextFollowUpAt ?? '',
        lead.attribution?.utm_source ?? '',
        lead.attribution?.utm_campaign ?? '',
        lead.notes ?? '',
        lead.createdAt,
      ]),
    ]);

    const fileName = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
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
