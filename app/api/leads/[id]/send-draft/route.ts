import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as leadsService from '@/modules/leads/service';
import * as usersService from '@/modules/users/service';

const bodySchema = z.object({
  message: z.string().trim().min(5).max(500),
  // Whether the human sent the agent's draft verbatim — the edit-rate signal
  // that decides autonomy promotion. Computed client-side by comparing the
  // sent text to the original draft; verified nowhere because the honest
  // failure mode (a staffer tweaking whitespace) only makes the metric
  // CONSERVATIVE, never inflated.
  unedited: z.boolean(),
});

// POST /api/leads/[id]/send-draft — send an agent-drafted SMS from the
// follow-up queue (Autonomy tier 1, 2026-09-03).
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
      throw new AppError('VALIDATION_ERROR', 'Invalid message payload.', 400);
    }
    const outcome = await leadsService.sendAgentSmsSystem(
      id,
      parsed.data.message,
      parsed.data.unedited ? 'manual_unedited' : 'manual_edited',
      staffUser.id,
    );
    if (outcome === 'skipped_no_phone') {
      throw new AppError('VALIDATION_ERROR', 'This lead has no phone number on file.', 400);
    }
    if (outcome === 'skipped_opt_out') {
      throw new AppError(
        'VALIDATION_ERROR',
        'This person has unsubscribed from marketing messages.',
        400,
      );
    }
    return successResponse({ sent: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
