import { z } from 'zod';

export interface Lead {
  id: string;
  registrationId: string | null;
  participantId: string | null;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string | null;
  company: string | null;
  leadSource: string;
  status: string;
  score: number;
  assignedTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// One timeline entry for a lead (Phase 1 Revenue OS roadmap): audit trail of
// creation and every change to status/assignment/score/notes, since the
// leads table itself only ever holds the current value.
export interface LeadActivity {
  id: string;
  leadId: string;
  activityType:
    | 'created'
    | 'status_changed'
    | 'assigned'
    | 'unassigned'
    | 'score_changed'
    | 'note_updated';
  description: string;
  performedBy: string | null;
  createdAt: string;
}

export const createLeadInputSchema = z.object({
  registrationId: z.string().uuid().nullable().optional(),
  participantId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(1),
  email: z.email().transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(10),
  jobTitle: z.string().trim().max(150).nullable().optional(),
  company: z.string().trim().max(150).nullable().optional(),
  leadSource: z.string().trim().min(1).max(50),
  status: z.string().trim().max(50).default('New'),
  // Optional on purpose: when omitted, the service computes an automatic
  // score from the lead's signals (calculateLeadScore) instead of a fixed
  // default. Callers that already know the right score (e.g. staff
  // overriding it later via PATCH) can still pass an explicit value.
  score: z.coerce.number().int().min(0).max(100).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;
