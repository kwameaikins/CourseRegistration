import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import * as usersService from '@/modules/users/service';

const bodySchema = z.object({
  outcome: z.string().trim().min(3).max(1000),
  // Absent = leave the schedule alone; null = clear it; a datetime = set it.
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

// POST /api/leads/[id]/outcome — US-M02 (PRD §10, previously unbuilt):
// record what happened on a follow-up call and set the next one, in one
// action from the follow-up workspace.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const staffUser = await usersService.requireRole(['admin', 'marketing', 'management']);
    const { id } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid outcome payload.', 400);
    }
    const lead = await leadsService.recordOutcome(
      id,
      parsed.data.outcome,
      parsed.data.nextFollowUpAt,
      staffUser.id,
    );
    return successResponse({ lead });
  } catch (err) {
    return handleRouteError(err);
  }
}
