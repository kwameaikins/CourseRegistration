import { AppError } from '@/lib/errors';
import * as opportunitiesRepository from '@/modules/opportunities/repository';
import type {
  CreateOpportunityInput,
  Opportunity,
  PipelineSummary,
  UpdateOpportunityInput,
} from '@/modules/opportunities/types';
import type { Database } from '@/lib/supabase/database.types';

type OpportunityRow = Database['public']['Tables']['opportunities']['Row'];

// Mirrors the toPayment/toLead pattern used elsewhere: the repository only
// ever returns raw snake_case rows, so every value handed back to a route or
// the UI must go through this mapper first.
function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    leadId: row.lead_id,
    registrationId: row.registration_id,
    courseName: row.course_name,
    batchLabel: row.batch_label,
    amount: Number(row.amount),
    stage: row.stage as Opportunity['stage'],
    expectedCloseDate: row.expected_close_date,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
  const row = await opportunitiesRepository.insertOpportunity(input);
  return toOpportunity(row);
}

export async function listOpportunities(
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<Opportunity[]> {
  const rows = await opportunitiesRepository.selectOpportunities(range);
  return rows.map(toOpportunity);
}

export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  const row = await opportunitiesRepository.selectOpportunityById(id);
  return row ? toOpportunity(row) : null;
}

export async function updateOpportunity(
  id: string,
  input: UpdateOpportunityInput,
): Promise<Opportunity> {
  const existing = await opportunitiesRepository.selectOpportunityById(id);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Opportunity not found.', 404);
  }

  const changes: Partial<OpportunityRow> = {};
  if (input.stage !== undefined) changes.stage = input.stage;
  if (input.amount !== undefined) changes.amount = input.amount;
  if (input.expectedCloseDate !== undefined) changes.expected_close_date = input.expectedCloseDate;
  if (input.notes !== undefined) changes.notes = input.notes;

  const updated = await opportunitiesRepository.updateOpportunity(id, changes);
  return toOpportunity(updated);
}

// Called from the payments module (non-blocking) whenever a registration's
// payment transitions to Paid. A manually-set Won/Lost is left alone so
// staff corrections are never silently overwritten by this sync.
export async function markWonByRegistrationId(registrationId: string): Promise<void> {
  const existing = await opportunitiesRepository.selectOpportunityByRegistrationId(registrationId);
  if (!existing || existing.stage === 'Won' || existing.stage === 'Lost') return;
  await opportunitiesRepository.updateOpportunity(existing.id, { stage: 'Won' });
}

export async function getPipelineSummary(
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<PipelineSummary> {
  const rows = await opportunitiesRepository.selectOpportunities(range);

  const byStage: Record<string, number> = {};
  let openValue = 0;
  let wonValue = 0;

  for (const row of rows) {
    byStage[row.stage] = (byStage[row.stage] ?? 0) + 1;
    const amount = Number(row.amount);
    if (row.stage === 'Won') {
      wonValue += amount;
    } else if (row.stage !== 'Lost') {
      openValue += amount;
    }
  }

  return {
    total: rows.length,
    openValue,
    wonValue,
    byStage,
  };
}
