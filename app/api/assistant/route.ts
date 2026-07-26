import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as usersService from '@/modules/users/service';
import * as agentToolsService from '@/modules/agent-tools/service';
import type { AgentTool, PendingToolAction } from '@/modules/agent-tools/types';

// POST /api/assistant — the Admin AI assistant (founder-approved 2026-07-19).
// Runs a Claude tool-use loop over modules/agent-tools — the shared tool
// registry every AI surface in this app draws from (this one and the Vapi
// voice tools route), so every action passes the same trust/role checks,
// validation, and side effects regardless of which surface triggered it.
// Admin-only; the session's cookies flow into the wrapped services, so
// nothing here escalates privileges.

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});

const SYSTEM_PROMPT = `You are the admin assistant for the Course Registration & Follow-Up System of Knowsia, a Ghana-based training business.

You help the Admin manage the system through your tools: courses, course batches (cohorts), staff user accounts, email templates, the dashboard summary, leads and the sales pipeline, campaigns, live class sessions, the waitlist, attendance, certificates, and feedback.

Domain vocabulary (use these exact terms): Participant, Registration, Batch (a cohort of a Course with a start date and fee in GHS), Payment Status (Unpaid / Part Payment / Paid), Course Fee.

Rules:
- Fees and amounts are in GHS (Ghana cedis).
- Dates are YYYY-MM-DD; times are HH:MM (24h). Ghana is UTC+0.
- A Batch needs an existing Course — list courses first if unsure of the courseId.
- Batch automation toggles (welcome email, payment reminders, class reminders, WhatsApp, SMS) default to on.
- Before a destructive or hard-to-reverse change (deactivating a user, deactivating a batch), confirm the target with the admin first unless they were explicit.
- Email templates use {{placeholder}} syntax: participant_name, course_name, course_code, cohort_label, course_fee, amount_paid, balance, start_date, start_time, end_date, zoom_link, whatsapp_group_link, facilitator_name.
- Report what you did plainly, including IDs the admin may need. If a tool fails, relay the error message honestly and suggest the fix.
- Lead follow-ups: when asked to suggest a follow-up (for one lead or for leads due for follow-up), call get_lead_follow_up_context (or list_leads_due_for_follow_up first if no leadId was given) and use the lead's status, score, job title, company, and activity timeline to draft a short, specific follow-up message and a recommended next action. Present it as a suggestion for the admin to send manually — you never send anything yourself.
- Financial and enrollment actions (discounts, payment plans, batch transfers, cancelling/rescheduling a live session, revoking a certificate, queueing+sending a campaign, updating a lead, creating an opportunity) work differently from every other tool: any tool starting with "propose_" or named discount/installment_plan/transfer NEVER executes anything by itself — calling one only shows the admin a confirmation card. There is no tool available to you that performs any of these writes directly; only the admin's own button click can do that. After calling one of these tools, tell the admin you have prepared it for their review — do not say it is done, applied, or complete, because it is not yet.

Today's date: ${new Date().toISOString().slice(0, 10)}`;

function toBetaZodTool(
  tool: AgentTool,
  staffUser: Awaited<ReturnType<typeof usersService.getCurrentStaffUser>>,
  pendingActionRef: { current: PendingToolAction | null },
) {
  return betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: async (input: unknown) => {
      if (tool.mode === 'write-confirm') {
        const proposal = await agentToolsService.proposeTool(tool.name, input, staffUser);
        pendingActionRef.current = proposal;
        return JSON.stringify({
          proposed: true,
          note: 'This has only been presented to the admin as a confirmation card, NOT executed. Do not tell the admin it is done — wait for their confirmation.',
          proposal,
        });
      }
      const result = await agentToolsService.runTool(tool.name, input, staffUser);
      return JSON.stringify(result);
    },
  });
}

export async function POST(request: Request) {
  try {
    const staffUser = await usersService.requireRole(['admin']);

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AppError(
        'NOT_CONFIGURED',
        'The assistant is not configured yet — add ANTHROPIC_API_KEY to the environment.',
        503,
      );
    }

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Invalid assistant request.', 400);
    }

    const pendingActionRef: { current: PendingToolAction | null } = { current: null };
    const tools = agentToolsService
      .getToolsForSurface('assistant', staffUser)
      .map((tool) => toBetaZodTool(tool, staffUser, pendingActionRef));

    const client = new Anthropic();
    const runner = client.beta.messages.toolRunner({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      tools,
      messages: parsed.data.messages,
      max_iterations: 8,
    });

    // Track executed tool calls so the UI can show what the assistant did.
    const actions: string[] = [];
    let finalMessage: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      finalMessage = message;
      for (const block of message.content) {
        if (block.type === 'tool_use') actions.push(block.name);
      }
    }

    const reply =
      finalMessage?.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim() ?? '';

    return successResponse({
      reply: reply || 'Done.',
      actions,
      pendingAction: pendingActionRef.current,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
