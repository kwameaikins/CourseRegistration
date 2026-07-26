import { z } from 'zod';

import type { LeadSource } from '@/lib/domain/types';

// Real pipeline definition (previously only existed as a hardcoded <select>
// in app/(staff)/leads/page.tsx) — 'Lost' is new, everything else matches
// values already live in the data.
export const LEAD_STATUSES = ['New', 'Qualified', 'Follow-up', 'Enrolled', 'Lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Same literal set as lib/domain/parsers.ts's parseLeadSource — reused here
// as a real zod enum instead of an independently-validated free string, and
// exported so the leads UI can build its source filter dropdown from it.
export const LEAD_SOURCE_VALUES = ['WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other'] as const;

export interface Lead {
  id: string;
  registrationId: string | null;
  participantId: string | null;
  fullName: string;
  email: string;
  phone: string;
  jobTitle: string | null;
  company: string | null;
  leadSource: LeadSource;
  status: LeadStatus;
  score: number;
  assignedTo: string | null;
  notes: string | null;
  nextFollowUpAt: string | null;
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
    | 'note_updated'
    | 'follow_up_scheduled'
    | 'duplicate_merged';
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
  leadSource: z.enum(LEAD_SOURCE_VALUES),
  status: z.enum(LEAD_STATUSES).default('New'),
  // Optional on purpose: when omitted, the service computes an automatic
  // score from the lead's signals (calculateLeadScore) instead of a fixed
  // default. Callers that already know the right score (e.g. staff
  // overriding it later via PATCH) can still pass an explicit value.
  score: z.coerce.number().int().min(0).max(100).optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadInputSchema>;

// PATCH /api/leads/[id] previously had NO schema validation at all — this
// closes that gap; every field mirrors updateLead's inline param shape.
export const updateLeadInputSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  score: z.coerce.number().int().min(0).max(100).optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

export type UpdateLeadInput = z.infer<typeof updateLeadInputSchema>;

// Server-side list filters (replaces "fetch everything, filter in the
// browser" — the leads page and the leads-due-for-follow-up agent tool both
// used to pull the full table into memory).
export const listLeadsFiltersSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  leadSource: z.enum(LEAD_SOURCE_VALUES).optional(),
  assignedTo: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  // Real boolean by the time it reaches this schema — the route computes it
  // from presence/equality of the query param rather than coercing a raw
  // string here, since z.coerce.boolean() would treat the literal string
  // "false" as truthy (any non-empty string coerces to true in JS).
  dueForFollowUp: z.boolean().optional(),
});

export type ListLeadsFilters = z.infer<typeof listLeadsFiltersSchema>;

// Lead assignment rules (Revenue OS Phase 2 roadmap item): auto-route a new
// lead to a staff member based on its lead_source, one active rule per
// source.
export interface LeadAssignmentRule {
  id: string;
  leadSource: string;
  assignedTo: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const createLeadAssignmentRuleInputSchema = z.object({
  leadSource: z.string().trim().min(1).max(50),
  assignedTo: z.string().uuid(),
});

export type CreateLeadAssignmentRuleInput = z.infer<typeof createLeadAssignmentRuleInputSchema>;

export const updateLeadAssignmentRuleInputSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateLeadAssignmentRuleInput = z.infer<typeof updateLeadAssignmentRuleInputSchema>;
