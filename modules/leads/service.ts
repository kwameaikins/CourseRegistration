import { AppError } from '@/lib/errors';
import * as leadsRepository from '@/modules/leads/repository';
import type { CreateLeadInput } from '@/modules/leads/types';
import { createLeadInputSchema } from '@/modules/leads/types';

export async function createLead(input: CreateLeadInput) {
  try {
    const parsed = createLeadInputSchema.parse(input);
    return await leadsRepository.insertLead(parsed);
  } catch (err) {
    console.error('[leads createLead]', err);
    if (err instanceof AppError) throw err;
    throw new AppError('LEAD_CREATE_FAILED', 'Unable to create lead right now.', 500);
  }
}

export async function listLeads() {
  return leadsRepository.selectLeads();
}

export async function getLeadById(id: string) {
  const lead = await leadsRepository.selectLeadById(id);
  if (!lead) {
    throw new AppError('NOT_FOUND', 'Lead not found.', 404);
  }
  return lead;
}

export async function getPipelineSummary() {
  const leads = await leadsRepository.selectLeads();
  const byStatus: Record<string, number> = {};
  for (const lead of leads) {
    byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;
  }
  const averageScore =
    leads.length > 0
      ? Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / leads.length)
      : 0;
  return {
    total: leads.length,
    byStatus,
    averageScore,
    unassigned: leads.filter((lead) => !lead.assigned_to).length,
  };
}

export async function updateLead(
  id: string,
  input: { status?: string; notes?: string | null; assignedTo?: string | null; score?: number },
) {
  if (!id) {
    throw new AppError('VALIDATION_ERROR', 'Lead id is required.', 400);
  }

  const changes: Record<string, string | number | null> = {};
  if (input.status !== undefined) changes.status = input.status;
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.assignedTo !== undefined) changes.assigned_to = input.assignedTo;
  if (input.score !== undefined) changes.score = input.score;

  return leadsRepository.updateLead(id, changes);
}
