import { z } from 'zod';

// Nurture sequence engine (Revenue OS Phase 2, 2026-09-03).
//
// A sequence is a trigger plus ordered steps; an enrollment is one person
// walking through those steps. Everything ships INACTIVE — an admin reviews
// the copy and flips a sequence on before anything sends (same posture as
// campaign live-send toggles).

export const SEQUENCE_TRIGGERS = [
  'lead_new',
  'lead_lost',
  'registration_lapsed',
  'post_course',
] as const;
export type SequenceTrigger = (typeof SEQUENCE_TRIGGERS)[number];

export interface NurtureSequence {
  id: string;
  key: string;
  name: string;
  trigger: SequenceTrigger;
  channel: 'email';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NurtureStep {
  id: string;
  sequenceId: string;
  stepNumber: number;
  offsetDays: number;
  subject: string;
  body: string;
}

export interface SequenceWithSteps extends NurtureSequence {
  steps: NurtureStep[];
  activeEnrollments: number;
  completedEnrollments: number;
}

export const updateSequenceInputSchema = z.object({
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1).max(200).optional(),
});
export type UpdateSequenceInput = z.infer<typeof updateSequenceInputSchema>;

export const updateStepInputSchema = z.object({
  offsetDays: z.coerce.number().int().min(0).max(365).optional(),
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(10_000).optional(),
});
export type UpdateStepInput = z.infer<typeof updateStepInputSchema>;

// Tokens available to step copy. Frozen into the enrollment's context at
// enroll time, because the thing referenced may not be resolvable later.
export interface SequenceContext {
  first_name?: string;
  full_name?: string;
  course_name?: string;
}

export interface SequenceDispatchSummary {
  due: number;
  sent: number;
  completed: number;
  stopped: number;
  errors: number;
}
