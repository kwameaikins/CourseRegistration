// Nurture sequence engine (Revenue OS Phase 2, 2026-09-03).
//
// The missing middle of the marketing stack: lifecycle emails are hardcoded
// one-offs and campaigns are manual blasts; sequences are the automated
// multi-step follow-ups in between. Triggers enroll, the daily cron sends.
//
// Safety posture, in order:
//   1. Seeded sequences are INACTIVE until an admin reviews the copy.
//   2. Every send checks marketing_opt_outs and carries an unsubscribe link.
//   3. One enrollment per person per sequence, ever (DB unique indexes).
//   4. A lead that converts (Enrolled) has every active enrollment stopped —
//      nothing is worse than nurture-emailing a paying customer to sign up.
import { AppError } from '@/lib/errors';
import { sendTransactionalEmail } from '@/lib/resend/client';
import { unsubscribeFooterHtml } from '@/lib/unsubscribe';
import * as marketingConsentService from '@/modules/marketing-consent/service';
import * as sequencesRepository from '@/modules/sequences/repository';
import * as usersService from '@/modules/users/service';
import {
  updateSequenceInputSchema,
  updateStepInputSchema,
  type NurtureStep,
  type SequenceContext,
  type SequenceDispatchSummary,
  type SequenceTrigger,
  type SequenceWithSteps,
  type UpdateSequenceInput,
  type UpdateStepInput,
} from '@/modules/sequences/types';

function toStep(row: sequencesRepository.StepRow): NurtureStep {
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    stepNumber: row.step_number,
    offsetDays: row.offset_days,
    subject: row.subject,
    body: row.body,
  };
}

function renderTokens(template: string, context: SequenceContext): string {
  return template
    .replaceAll('{{first_name}}', context.first_name ?? 'there')
    .replaceAll('{{full_name}}', context.full_name ?? 'there')
    .replaceAll('{{course_name}}', context.course_name ?? 'our programmes');
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

// ---------------------------------------------------------------------------
// Seeded defaults — same insertIfMissing posture as communications'
// default-templates: safe to run repeatedly, never overwrites an edit.
// ---------------------------------------------------------------------------

const SEEDS: Array<{
  key: string;
  name: string;
  trigger: SequenceTrigger;
  steps: Array<{ stepNumber: number; offsetDays: number; subject: string; body: string }>;
}> = [
  {
    key: 'lead-nurture',
    name: 'New lead nurture',
    trigger: 'lead_new',
    steps: [
      {
        stepNumber: 1,
        offsetDays: 1,
        subject: 'Your questions about {{course_name}}, answered',
        body: 'Hi {{first_name}},\n\nThanks for your interest in {{course_name}}. Most professionals who join us are balancing full-time work, so every session is live online in the evening, recorded, and led by practising facilitators.\n\nIf you are weighing it up, just reply to this email with your question — a real person answers.\n\nWarm regards,\nThe Knowsia Team',
      },
      {
        stepNumber: 2,
        offsetDays: 3,
        subject: 'What past participants say',
        body: 'Hi {{first_name}},\n\nStill thinking it over? Here is what recent participants told us after finishing: they came for the certificate and stayed for facilitators who answer real workplace questions.\n\nYou can read verified feedback on every programme page at reg.knowsia.com/programmes.\n\nWarm regards,\nThe Knowsia Team',
      },
      {
        stepNumber: 3,
        offsetDays: 6,
        subject: 'Seats fill before the cohort starts',
        body: 'Hi {{first_name}},\n\nA quick heads-up: cohorts close to new registrations once they fill, and payment plans are available if spreading the fee helps.\n\nRegister at reg.knowsia.com/register or reply here and we will call you.\n\nWarm regards,\nThe Knowsia Team',
      },
    ],
  },
  {
    key: 'lead-winback',
    name: 'Lost lead win-back',
    trigger: 'lead_lost',
    steps: [
      {
        stepNumber: 1,
        offsetDays: 14,
        subject: 'Should we keep your seat request open?',
        body: 'Hi {{first_name}},\n\nWe spoke a little while ago about {{course_name}} and the timing was not right. New cohort dates are now published — if the timing works better this quarter, reply and we will walk you through the options (including payment plans).\n\nNo pressure either way.\n\nWarm regards,\nThe Knowsia Team',
      },
    ],
  },
  {
    key: 'lapsed-winback',
    name: 'Lapsed registration win-back',
    trigger: 'registration_lapsed',
    steps: [
      {
        stepNumber: 1,
        offsetDays: 21,
        subject: 'Your place on {{course_name}} — pick up where you left off',
        body: 'Hi {{first_name}},\n\nYou registered for {{course_name}} but life clearly got in the way — it happens. When a new cohort opens we would love to have you back, and your registration details are already with us, so restarting takes two minutes.\n\nReply to this email or visit reg.knowsia.com/programmes to see upcoming dates.\n\nWarm regards,\nThe Knowsia Team',
      },
    ],
  },
  {
    key: 'upsell-wave',
    name: 'Post-course next-step wave',
    trigger: 'post_course',
    steps: [
      {
        stepNumber: 1,
        offsetDays: 7,
        subject: 'What comes after {{course_name}}?',
        body: 'Hi {{first_name}},\n\nCongratulations again on completing {{course_name}}. Most alumni take a second programme within the year — the skills compound, and returning students already know how our cohorts run.\n\nBrowse what is open now at reg.knowsia.com/programmes. As an alum, reply here if you want a recommendation for the natural next step.\n\nWarm regards,\nThe Knowsia Team',
      },
      {
        stepNumber: 2,
        offsetDays: 21,
        subject: 'Earn while you refer',
        body: 'Hi {{first_name}},\n\nOne more thing: our Refer & Earn programme pays a commission (or course credit) for every colleague you refer who enrols. It takes one click to join from your student portal.\n\nLog in at reg.knowsia.com/portal and look for Refer & Earn.\n\nWarm regards,\nThe Knowsia Team',
      },
    ],
  },
];

export async function seedDefaultSequences(): Promise<void> {
  for (const seed of SEEDS) {
    await sequencesRepository.insertSequenceIfMissing({
      key: seed.key,
      name: seed.name,
      trigger: seed.trigger,
    });
    const sequence = await sequencesRepository.selectSequenceByKey(seed.key);
    if (!sequence) continue;
    for (const step of seed.steps) {
      await sequencesRepository.insertStepIfMissing({
        sequence_id: sequence.id,
        step_number: step.stepNumber,
        offset_days: step.offsetDays,
        subject: step.subject,
        body: step.body,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Enrollment — called from other modules' flows, always fail-soft there.
// ---------------------------------------------------------------------------

async function activeSequenceForTrigger(trigger: SequenceTrigger) {
  const sequences = await sequencesRepository.selectSequences();
  return sequences.find((row) => row.trigger === trigger && row.is_active) ?? null;
}

export async function enrollLeadSystem(
  trigger: Extract<SequenceTrigger, 'lead_new' | 'lead_lost'>,
  lead: { id: string; email: string; fullName: string; courseName?: string | null },
): Promise<void> {
  const sequence = await activeSequenceForTrigger(trigger);
  if (!sequence) return;
  const steps = await sequencesRepository.selectSteps([sequence.id]);
  if (steps.length === 0) return;
  const context: SequenceContext = {
    first_name: firstNameOf(lead.fullName),
    full_name: lead.fullName,
    course_name: lead.courseName ?? undefined,
  };
  await sequencesRepository.insertEnrollmentIfMissing({
    sequence_id: sequence.id,
    lead_id: lead.id,
    email: lead.email.toLowerCase(),
    full_name: lead.fullName,
    context: { ...context },
    next_step: steps[0].step_number,
    next_send_at: new Date(
      Date.now() + steps[0].offset_days * 86_400_000,
    ).toISOString(),
  });
}

export async function enrollRegistrationSystem(
  trigger: Extract<SequenceTrigger, 'registration_lapsed' | 'post_course'>,
  registration: {
    id: string;
    email: string;
    fullName: string;
    courseName?: string | null;
  },
): Promise<void> {
  const sequence = await activeSequenceForTrigger(trigger);
  if (!sequence) return;
  const steps = await sequencesRepository.selectSteps([sequence.id]);
  if (steps.length === 0) return;
  const context: SequenceContext = {
    first_name: firstNameOf(registration.fullName),
    full_name: registration.fullName,
    course_name: registration.courseName ?? undefined,
  };
  await sequencesRepository.insertEnrollmentIfMissing({
    sequence_id: sequence.id,
    registration_id: registration.id,
    email: registration.email.toLowerCase(),
    full_name: registration.fullName,
    context: { ...context },
    next_step: steps[0].step_number,
    next_send_at: new Date(
      Date.now() + steps[0].offset_days * 86_400_000,
    ).toISOString(),
  });
}

// Convenience for callers that only hold a registration id (the upsell
// scheduler): resolves the contact itself, skips anonymised participants.
export async function enrollRegistrationByIdSystem(
  trigger: Extract<SequenceTrigger, 'registration_lapsed' | 'post_course'>,
  registrationId: string,
): Promise<void> {
  const contact = await sequencesRepository.selectRegistrationContact(registrationId);
  if (!contact || contact.deleted) return;
  await enrollRegistrationSystem(trigger, {
    id: registrationId,
    email: contact.email,
    fullName: contact.fullName,
    courseName: contact.courseName,
  });
}

// A converted lead must never keep receiving "come sign up" emails.
export async function stopForLeadSystem(leadId: string, reason: string): Promise<void> {
  await sequencesRepository.stopEnrollmentsForLead(leadId, reason);
}

// ---------------------------------------------------------------------------
// Dispatch — runs from the bundled daily cron.
// ---------------------------------------------------------------------------

export async function runSequenceDispatch(): Promise<SequenceDispatchSummary> {
  const due = await sequencesRepository.selectDueEnrollments();
  const summary: SequenceDispatchSummary = {
    due: due.length, sent: 0, completed: 0, stopped: 0, errors: 0,
  };
  if (due.length === 0) return summary;

  const sequenceIds = [...new Set(due.map((row) => row.sequence_id))];
  const sequences = await sequencesRepository.selectSequences();
  const sequenceById = new Map(sequences.map((row) => [row.id, row]));
  const steps = await sequencesRepository.selectSteps(sequenceIds);
  const stepsBySequence = new Map<string, sequencesRepository.StepRow[]>();
  for (const step of steps) {
    const list = stepsBySequence.get(step.sequence_id) ?? [];
    list.push(step);
    stepsBySequence.set(step.sequence_id, list);
  }
  const optedOut = await marketingConsentService.optedOutSubset(due.map((row) => row.email));

  for (const enrollment of due) {
    try {
      const sequence = sequenceById.get(enrollment.sequence_id);
      // A sequence turned OFF stops sending mid-flight but keeps enrollments
      // active, so turning it back on resumes rather than loses everyone.
      if (!sequence || !sequence.is_active) continue;

      if (optedOut.has(enrollment.email)) {
        await sequencesRepository.updateEnrollment(enrollment.id, {
          status: 'stopped', stopped_reason: 'opted_out',
        });
        summary.stopped += 1;
        continue;
      }

      const sequenceSteps = stepsBySequence.get(enrollment.sequence_id) ?? [];
      const step = sequenceSteps.find((row) => row.step_number === enrollment.next_step);
      if (!step) {
        await sequencesRepository.updateEnrollment(enrollment.id, {
          status: 'completed', next_send_at: null,
        });
        summary.completed += 1;
        continue;
      }

      const context = (enrollment.context ?? {}) as SequenceContext;
      const bodyHtml =
        renderTokens(step.body, context)
          .split('\n\n')
          .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br/>')}</p>`)
          .join('') + unsubscribeFooterHtml(enrollment.email);

      await sendTransactionalEmail({
        to: enrollment.email,
        subject: renderTokens(step.subject, context),
        html: bodyHtml,
      });
      summary.sent += 1;

      const next = sequenceSteps.find((row) => row.step_number > step.step_number);
      if (next) {
        await sequencesRepository.updateEnrollment(enrollment.id, {
          next_step: next.step_number,
          next_send_at: new Date(
            new Date(enrollment.enrolled_at).getTime() + next.offset_days * 86_400_000,
          ).toISOString(),
        });
      } else {
        await sequencesRepository.updateEnrollment(enrollment.id, {
          status: 'completed', next_send_at: null,
        });
        summary.completed += 1;
      }
    } catch (err) {
      // Per-row isolation: one bad address must not sink the day's dispatch.
      // The row keeps its due date and is retried tomorrow.
      console.error('[sequence dispatch]', enrollment.id, err);
      summary.errors += 1;
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Staff management (admin + marketing, matching campaigns).
// ---------------------------------------------------------------------------

export async function listSequences(): Promise<SequenceWithSteps[]> {
  await usersService.requireRole(['admin', 'marketing']);
  // Listing is also where the defaults materialise on first visit — same
  // pattern as course templates seeding on course creation.
  await seedDefaultSequences();
  const sequences = await sequencesRepository.selectSequences();
  const ids = sequences.map((row) => row.id);
  const [steps, counts] = await Promise.all([
    sequencesRepository.selectSteps(ids),
    sequencesRepository.selectEnrollmentCounts(ids),
  ]);
  return sequences.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    trigger: row.trigger as SequenceTrigger,
    channel: 'email',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    steps: steps.filter((step) => step.sequence_id === row.id).map(toStep),
    activeEnrollments: counts.get(row.id)?.active ?? 0,
    completedEnrollments: counts.get(row.id)?.completed ?? 0,
  }));
}

export async function updateSequence(
  id: string,
  input: UpdateSequenceInput,
): Promise<void> {
  await usersService.requireRole(['admin', 'marketing']);
  const parsed = updateSequenceInputSchema.parse(input);
  const existing = await sequencesRepository.selectSequenceById(id);
  if (!existing) throw new AppError('NOT_FOUND', 'Sequence not found.', 404);
  await sequencesRepository.updateSequence(id, {
    ...(parsed.isActive !== undefined ? { is_active: parsed.isActive } : {}),
    ...(parsed.name !== undefined ? { name: parsed.name } : {}),
  });
}

export async function updateStep(id: string, input: UpdateStepInput): Promise<void> {
  await usersService.requireRole(['admin', 'marketing']);
  const parsed = updateStepInputSchema.parse(input);
  await sequencesRepository.updateStep(id, {
    ...(parsed.offsetDays !== undefined ? { offset_days: parsed.offsetDays } : {}),
    ...(parsed.subject !== undefined ? { subject: parsed.subject } : {}),
    ...(parsed.body !== undefined ? { body: parsed.body } : {}),
  });
}
