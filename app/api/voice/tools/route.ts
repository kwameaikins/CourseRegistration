import { captureToSentry, errorResponse } from '@/lib/errors';
import { isValidVapiSecret } from '@/lib/vapi/client';
import * as agentToolsService from '@/modules/agent-tools/service';

// POST /api/voice/tools — custom tool calls from the Vapi assistants (both
// the inbound line and outbound calls), authenticated by x-vapi-secret (no
// staff session exists on this path — that's the 'system' trust tier in
// modules/agent-tools/registry.ts). Sourced from the same shared tool
// registry the Admin Assistant uses, so a tool's business logic and role/
// trust checks live in exactly one place regardless of which AI surface
// calls it.
//
// Tools the dashboard assistants declare against this URL:
//   get_course_catalog      → open batches with fees and start dates
//   send_registration_link  → SMS the registration URL to a phone number
//   request_human_callback  → flags a call for a human to return
//   lookup_customer         → looks up a participant + their registrations/
//                             payment status by email or phone (the "CRM"
//                             for the sales follow-up agent, system review
//                             2026-07-22)
export async function POST(request: Request) {
  if (!isValidVapiSecret(request.headers.get('x-vapi-secret'))) {
    return errorResponse({ code: 'UNAUTHENTICATED', message: 'Invalid webhook secret.' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse({ code: 'VALIDATION_ERROR', message: 'Invalid JSON body.' }, 400);
  }

  try {
    const message = (payload as { message?: Record<string, unknown> }).message ?? {};
    const toolCalls = (message.toolCallList ?? message.toolCalls ?? []) as Array<{
      id: string;
      name?: string;
      function?: { name?: string; arguments?: Record<string, unknown> | string };
      arguments?: Record<string, unknown>;
    }>;

    const results: Array<{ toolCallId: string; result: string }> = [];
    for (const toolCall of toolCalls) {
      const name = toolCall.name ?? toolCall.function?.name ?? '';
      const rawArguments = toolCall.arguments ?? toolCall.function?.arguments ?? {};
      const args: Record<string, unknown> =
        typeof rawArguments === 'string'
          ? (JSON.parse(rawArguments) as Record<string, unknown>)
          : rawArguments;
      results.push({ toolCallId: toolCall.id, result: await runVoiceTool(name, args) });
    }

    return Response.json({ results }, { status: 200 });
  } catch (err) {
    captureToSentry(err, { webhook: 'vapi_tools' });
    console.error('[vapi tools]', err);
    return errorResponse(
      { code: 'INTERNAL_ERROR', message: 'Tool processing failed.' },
      500,
    );
  }
}

// Every call here is caught individually so one bad/unknown tool call never
// fails the whole batch — same posture as before this route moved onto the
// shared registry, just now with real Zod validation per tool instead of
// manual typeof checks (a malformed call now fails gracefully here instead
// of silently proceeding with empty-string defaults).
async function runVoiceTool(name: string, args: Record<string, unknown>): Promise<string> {
  const known = agentToolsService.getToolsForSurface('voice', null).some((tool) => tool.name === name);
  if (!known) return `Unknown tool: ${name}`;
  try {
    const result = await agentToolsService.runTool(name, args, null);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (err) {
    console.error(`[vapi tool ${name}]`, err);
    return 'The action failed — apologise and offer a human callback.';
  }
}
