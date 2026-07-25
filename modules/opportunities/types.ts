import { z } from 'zod';

export const OPPORTUNITY_STAGES = ['New', 'Contacted', 'Proposal', 'Won', 'Lost'] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export interface Opportunity {
  id: string;
  leadId: string | null;
  registrationId: string | null;
  courseName: string;
  batchLabel: string;
  amount: number;
  stage: OpportunityStage;
  expectedCloseDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const createOpportunityInputSchema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  registrationId: z.string().uuid().nullable().optional(),
  courseName: z.string().trim().min(1),
  batchLabel: z.string().trim().min(1),
  amount: z.coerce.number().min(0),
  stage: z.enum(OPPORTUNITY_STAGES).default('New'),
  expectedCloseDate: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreateOpportunityInput = z.infer<typeof createOpportunityInputSchema>;

export const updateOpportunityInputSchema = z.object({
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  amount: z.coerce.number().min(0).optional(),
  expectedCloseDate: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type UpdateOpportunityInput = z.infer<typeof updateOpportunityInputSchema>;

export interface PipelineSummary {
  total: number;
  openValue: number;
  wonValue: number;
  byStage: Record<string, number>;
}
