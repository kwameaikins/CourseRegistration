import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';

import { AppError, handleRouteError, successResponse } from '@/lib/errors';
import * as coursesService from '@/modules/courses/service';
import * as usersService from '@/modules/users/service';
import * as dashboardService from '@/modules/dashboard/service';
import * as communicationsService from '@/modules/communications/service';
import {
  batchInputSchema,
  batchUpdateSchema,
  courseInputSchema,
} from '@/modules/courses/types';
import { templateUpsertSchema } from '@/modules/communications/types';

// POST /api/assistant — the Admin AI assistant (founder-approved 2026-07-19).
// Runs a Claude tool-use loop over the SAME service functions the screens
// use, so every action passes the module boundary rules, validation, and RLS
// exactly as a manual action would. Admin-only; the session's cookies flow
// into the services, so nothing here escalates privileges.

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

You help the Admin manage the system through your tools: courses, course batches (cohorts), staff user accounts, email templates, and the dashboard summary.

Domain vocabulary (use these exact terms): Participant, Registration, Batch (a cohort of a Course with a start date and fee in GHS), Payment Status (Unpaid / Part Payment / Paid), Course Fee.

Rules:
- Fees and amounts are in GHS (Ghana cedis).
- Dates are YYYY-MM-DD; times are HH:MM (24h). Ghana is UTC+0.
- A Batch needs an existing Course — list courses first if unsure of the courseId.
- Batch automation toggles (welcome email, payment reminders, class reminders, WhatsApp, SMS) default to on.
- Before a destructive or hard-to-reverse change (deactivating a user, deactivating a batch), confirm the target with the admin first unless they were explicit.
- Email templates use {{placeholder}} syntax: participant_name, course_name, course_code, cohort_label, course_fee, amount_paid, balance, start_date, start_time, end_date, zoom_link, whatsapp_group_link, facilitator_name.
- Report what you did plainly, including IDs the admin may need. If a tool fails, relay the error message honestly and suggest the fix.

Today's date: ${new Date().toISOString().slice(0, 10)}`;

function buildTools() {
  return [
    betaZodTool({
      name: 'list_courses',
      description:
        'List all courses with their IDs, codes, and names. Call this before creating a batch when the courseId is unknown.',
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await coursesService.getCourses()),
    }),
    betaZodTool({
      name: 'create_course',
      description: 'Create a new course. courseCode is a short unique code (e.g. AI05).',
      inputSchema: z.object({
        courseCode: z.string().min(2),
        courseName: z.string().min(2),
      }),
      run: async (input) =>
        JSON.stringify(await coursesService.createCourse(courseInputSchema.parse(input))),
    }),
    betaZodTool({
      name: 'list_batches',
      description:
        'List batches (cohorts), optionally filtered by courseId. Returns fees, dates, toggles, and IDs.',
      inputSchema: z.object({ courseId: z.string().optional() }),
      run: async (input) => JSON.stringify(await coursesService.getBatches(input.courseId)),
    }),
    betaZodTool({
      name: 'create_batch',
      description:
        'Create a course batch (cohort). Requires an existing courseId. Fee in GHS. Dates YYYY-MM-DD, startTime HH:MM. Optional: zoomLink, zoomMeetingId (numeric ID enabling Zoom attendance), whatsappGroupLink, early-registration discount (discountCutoffDate + discountedFee, set together).',
      inputSchema: z.object({
        courseId: z.string(),
        cohortLabel: z.string(),
        courseFee: z.number().min(0),
        startDate: z.string(),
        startTime: z.string(),
        endDate: z.string(),
        facilitatorName: z.string(),
        zoomLink: z.string().optional(),
        zoomMeetingId: z.string().optional(),
        whatsappGroupLink: z.string().optional(),
        discountCutoffDate: z.string().optional(),
        discountedFee: z.number().optional(),
      }),
      run: async (input) =>
        JSON.stringify(await coursesService.createBatch(batchInputSchema.parse(input))),
    }),
    betaZodTool({
      name: 'update_batch',
      description:
        'Update fields on an existing batch: cohortLabel, courseFee, dates, links, zoomMeetingId, facilitatorName, automation toggles (welcomeEmailEnabled, paymentReminderEnabled, classReminderEnabled, whatsappEnabled, smsEnabled), isActive, discount fields. Only include fields being changed.',
      inputSchema: z.object({
        batchId: z.string(),
        changes: z.record(z.string(), z.unknown()),
      }),
      run: async (input) =>
        JSON.stringify(
          await coursesService.updateBatch(
            input.batchId,
            batchUpdateSchema.parse(input.changes),
          ),
        ),
    }),
    betaZodTool({
      name: 'list_staff_users',
      description: 'List all staff user accounts with their roles and active status.',
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await usersService.getStaffUsers()),
    }),
    betaZodTool({
      name: 'create_staff_user',
      description:
        'Create a staff account. Role is one of: admin, finance, marketing, tutor, management. The new user signs in with Google using this email.',
      inputSchema: z.object({
        fullName: z.string().min(2),
        email: z.string().email(),
        role: z.enum(['admin', 'finance', 'marketing', 'tutor', 'management']),
      }),
      run: async (input) => JSON.stringify(await usersService.createStaffUser(input)),
    }),
    betaZodTool({
      name: 'update_staff_user',
      description:
        'Update a staff account: fullName, role, or isActive (false deactivates the account).',
      inputSchema: z.object({
        staffUserId: z.string(),
        fullName: z.string().optional(),
        role: z.enum(['admin', 'finance', 'marketing', 'tutor', 'management']).optional(),
        isActive: z.boolean().optional(),
      }),
      run: async ({ staffUserId, ...changes }) =>
        JSON.stringify(await usersService.updateStaffUser(staffUserId, changes)),
    }),
    betaZodTool({
      name: 'get_dashboard_summary',
      description:
        'Read the management dashboard: per-batch registration/payment counts, revenue, conversion, lead sources.',
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await dashboardService.getDashboardSummary()),
    }),
    betaZodTool({
      name: 'list_email_templates',
      description: 'List the email templates configured for a course.',
      inputSchema: z.object({ courseId: z.string() }),
      run: async (input) =>
        JSON.stringify(await communicationsService.getTemplatesForCourse(input.courseId)),
    }),
    betaZodTool({
      name: 'save_email_template',
      description:
        'Create or update one email template for a course. emailType is one of: welcome, payment_instruction, reminder_1, reminder_2, reminder_3, reminder_4, payment_confirmation, class_reminder_24h, class_reminder_2h, zoom_link, whatsapp_invite, post_training_thankyou, upsell. Body is HTML with {{placeholders}}.',
      inputSchema: z.object({
        courseId: z.string(),
        emailType: z.string(),
        subject: z.string().min(1),
        body: z.string().min(1),
        isActive: z.boolean().default(true),
      }),
      run: async (input) =>
        JSON.stringify(
          await communicationsService.saveTemplate(templateUpsertSchema.parse(input)),
        ),
    }),
  ];
}

export async function POST(request: Request) {
  try {
    await usersService.requireRole(['admin']);

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

    const client = new Anthropic();
    const runner = client.beta.messages.toolRunner({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SYSTEM_PROMPT,
      tools: buildTools(),
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

    return successResponse({ reply: reply || 'Done.', actions });
  } catch (err) {
    return handleRouteError(err);
  }
}
