import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as usersService from '@/modules/users/service';
import * as agentToolsService from '@/modules/agent-tools/service';

const requestSchema = z.object({
  toolName: z.string().min(1),
  input: z.unknown(),
});

// POST /api/assistant/execute-action — the ONLY endpoint that turns an
// Admin Assistant proposal (any write-confirm tool in modules/agent-tools)
// into a real write. There is no path from the assistant's tool-use loop to
// this endpoint — it is reached exclusively by the admin's own "Confirm &
// Execute" button click in the UI, which is what makes the confirmation
// step a genuine human-in-the-loop gate rather than something the model
// could talk itself past.
export async function POST(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin']);

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid action confirmation.', 400);
    }

    const result = await agentToolsService.confirmAndExecuteTool(
      parsed.data.toolName,
      parsed.data.input,
      staffUser,
    );
    return successResponse({ result });
  } catch (err) {
    return handleRouteError(err);
  }
}
