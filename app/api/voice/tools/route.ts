import { captureToSentry, errorResponse } from '@/lib/errors';
import { isValidVapiSecret } from '@/lib/vapi/client';
import { sendSmsMessage } from '@/lib/arkesel/client';
import * as coursesService from '@/modules/courses/service';
import * as voiceService from '@/modules/voice/service';

// POST /api/voice/tools — custom tool calls from the Vapi assistants (both
// the inbound line and outbound calls). Authenticated by x-vapi-secret.
//
// Tools the dashboard assistants declare against this URL:
//   get_course_catalog      → open batches with fees and start dates
//   send_registration_link  → SMS the registration URL to a phone number
//   request_human_callback  → flags a call for a human to return
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
      results.push({ toolCallId: toolCall.id, result: await runTool(name, args) });
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

async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    switch (name) {
      case 'get_course_catalog': {
        const batches = await coursesService.getActiveBatchesForPublicForm();
        if (batches.length === 0) return 'No batches are currently open for registration.';
        return batches
          .map(
            (batch) =>
              `${batch.courseName} (${batch.cohortLabel}): starts ${batch.startDate}, fee GHS ${batch.courseFee}` +
              (batch.discountedFee !== null && batch.discountCutoffDate !== null
                ? `, early-bird GHS ${batch.discountedFee} until ${batch.discountCutoffDate}`
                : ''),
          )
          .join('. ');
      }
      case 'send_registration_link': {
        const phone = typeof args.phone === 'string' ? args.phone : '';
        if (!phone) return 'A phone number is required to send the link.';
        await sendSmsMessage({
          toPhone: phone,
          message:
            'Register for a Knowsia course here: https://reg.knowsia.com/register - Knowsia',
        });
        return 'Registration link sent by SMS.';
      }
      case 'request_human_callback': {
        const phone = typeof args.phone === 'string' ? args.phone : '';
        const reason = typeof args.reason === 'string' ? args.reason : '';
        await voiceService.recordInboundCall({
          phone,
          summary: reason ? `Callback requested: ${reason}` : 'Callback requested.',
          needsHumanFollowup: true,
        });
        return 'A member of the team will call back shortly.';
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    console.error(`[vapi tool ${name}]`, err);
    return 'The action failed — apologise and offer a human callback.';
  }
}
