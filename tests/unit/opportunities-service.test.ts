import { beforeEach, describe, expect, it, vi } from 'vitest';

const opportunitiesRepositoryMock = {
  insertOpportunity: vi.fn(),
  selectOpportunities: vi.fn(),
  selectOpportunityById: vi.fn(),
  selectOpportunityByRegistrationId: vi.fn(),
  updateOpportunity: vi.fn(),
};

vi.mock('@/modules/opportunities/repository', () => opportunitiesRepositoryMock);

const {
  createOpportunity,
  listOpportunities,
  getOpportunityById,
  updateOpportunity,
  markWonByRegistrationId,
  getPipelineSummary,
} = await import('@/modules/opportunities/service');

beforeEach(() => {
  vi.clearAllMocks();
});

function opportunityRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'opp-1',
    lead_id: 'lead-1',
    registration_id: 'reg-1',
    course_name: 'Data Analytics',
    batch_label: 'JUL-2026',
    amount: 1200,
    stage: 'New',
    expected_close_date: null,
    notes: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('createOpportunity', () => {
  it('creates and returns the opportunity mapped to camelCase', async () => {
    opportunitiesRepositoryMock.insertOpportunity.mockResolvedValue(opportunityRow());

    const result = await createOpportunity({
      leadId: 'lead-1',
      registrationId: 'reg-1',
      courseName: 'Data Analytics',
      batchLabel: 'JUL-2026',
      amount: 1200,
      stage: 'New',
    });

    expect(result).toMatchObject({
      id: 'opp-1',
      leadId: 'lead-1',
      registrationId: 'reg-1',
      courseName: 'Data Analytics',
      batchLabel: 'JUL-2026',
      amount: 1200,
      stage: 'New',
    });
  });
});

describe('listOpportunities', () => {
  it('maps every row to camelCase', async () => {
    opportunitiesRepositoryMock.selectOpportunities.mockResolvedValue([opportunityRow()]);

    const result = await listOpportunities();

    expect(result).toEqual([expect.objectContaining({ id: 'opp-1', courseName: 'Data Analytics' })]);
  });
});

describe('getOpportunityById', () => {
  it('returns null when not found', async () => {
    opportunitiesRepositoryMock.selectOpportunityById.mockResolvedValue(null);
    expect(await getOpportunityById('missing')).toBeNull();
  });

  it('maps the row when found', async () => {
    opportunitiesRepositoryMock.selectOpportunityById.mockResolvedValue(opportunityRow());
    const result = await getOpportunityById('opp-1');
    expect(result).toMatchObject({ id: 'opp-1' });
  });
});

describe('updateOpportunity', () => {
  it('throws NOT_FOUND when the opportunity does not exist', async () => {
    opportunitiesRepositoryMock.selectOpportunityById.mockResolvedValue(null);

    await expect(updateOpportunity('missing', { stage: 'Won' })).rejects.toThrow(
      'Opportunity not found.',
    );
  });

  it('applies partial changes and returns the mapped result', async () => {
    opportunitiesRepositoryMock.selectOpportunityById.mockResolvedValue(opportunityRow());
    opportunitiesRepositoryMock.updateOpportunity.mockResolvedValue(
      opportunityRow({ stage: 'Proposal', amount: 1500 }),
    );

    const result = await updateOpportunity('opp-1', { stage: 'Proposal', amount: 1500 });

    expect(opportunitiesRepositoryMock.updateOpportunity).toHaveBeenCalledWith('opp-1', {
      stage: 'Proposal',
      amount: 1500,
    });
    expect(result).toMatchObject({ stage: 'Proposal', amount: 1500 });
  });
});

describe('markWonByRegistrationId', () => {
  it('does nothing when there is no matching opportunity', async () => {
    opportunitiesRepositoryMock.selectOpportunityByRegistrationId.mockResolvedValue(null);

    await markWonByRegistrationId('reg-1');

    expect(opportunitiesRepositoryMock.updateOpportunity).not.toHaveBeenCalled();
  });

  it('leaves an already Won or Lost opportunity untouched', async () => {
    opportunitiesRepositoryMock.selectOpportunityByRegistrationId.mockResolvedValue(
      opportunityRow({ stage: 'Lost' }),
    );

    await markWonByRegistrationId('reg-1');

    expect(opportunitiesRepositoryMock.updateOpportunity).not.toHaveBeenCalled();
  });

  it('marks a New/Contacted/Proposal opportunity as Won', async () => {
    opportunitiesRepositoryMock.selectOpportunityByRegistrationId.mockResolvedValue(
      opportunityRow({ stage: 'Proposal' }),
    );

    await markWonByRegistrationId('reg-1');

    expect(opportunitiesRepositoryMock.updateOpportunity).toHaveBeenCalledWith('opp-1', {
      stage: 'Won',
    });
  });
});

describe('getPipelineSummary', () => {
  it('summarises total, open/won value, and by-stage counts', async () => {
    opportunitiesRepositoryMock.selectOpportunities.mockResolvedValue([
      opportunityRow({ id: 'opp-1', stage: 'New', amount: 1000 }),
      opportunityRow({ id: 'opp-2', stage: 'Won', amount: 1200 }),
      opportunityRow({ id: 'opp-3', stage: 'Lost', amount: 900 }),
    ]);

    const result = await getPipelineSummary();

    expect(result).toEqual({
      total: 3,
      openValue: 1000,
      wonValue: 1200,
      byStage: { New: 1, Won: 1, Lost: 1 },
    });
  });
});
