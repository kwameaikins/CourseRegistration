import { beforeEach, describe, expect, it, vi } from 'vitest';

const campaignsRepositoryMock = {
  insertCampaign: vi.fn(),
  selectCampaigns: vi.fn(),
  selectCampaignById: vi.fn(),
  markCampaignQueued: vi.fn(),
  insertCampaignMembers: vi.fn(),
  selectCampaignMembers: vi.fn(),
};

const leadsServiceMock = {
  listLeads: vi.fn(),
};

vi.mock('@/modules/campaigns/repository', () => campaignsRepositoryMock);
vi.mock('@/modules/leads/service', () => leadsServiceMock);

const {
  createCampaign,
  listCampaigns,
  getCampaignById,
  getCampaignMembers,
  previewCampaign,
  queueCampaign,
} = await import('@/modules/campaigns/service');

beforeEach(() => {
  vi.clearAllMocks();
});

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'camp-1',
    name: 'Reengage warm leads',
    channel: 'email',
    message_subject: 'Hey {{firstName}}',
    message_body: 'Hi {{firstName}}, checking in from {{company}}.',
    filter_lead_source: null,
    filter_status: null,
    filter_min_score: null,
    status: 'draft',
    created_by: 'staff-1',
    queued_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    fullName: 'Ama Owusu',
    email: 'ama@example.com',
    phone: '+233241234567',
    jobTitle: null,
    company: 'Acme',
    leadSource: 'WhatsApp',
    status: 'New',
    score: 40,
    assignedTo: null,
    notes: null,
    nextFollowUpAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    registrationId: null,
    participantId: null,
    ...overrides,
  };
}

describe('createCampaign', () => {
  it('inserts the campaign and maps the result', async () => {
    campaignsRepositoryMock.insertCampaign.mockResolvedValue(campaignRow());

    const result = await createCampaign(
      { name: 'Reengage warm leads', channel: 'email', messageBody: 'Hi {{firstName}}' },
      'staff-1',
    );

    expect(campaignsRepositoryMock.insertCampaign).toHaveBeenCalledWith(
      { name: 'Reengage warm leads', channel: 'email', messageBody: 'Hi {{firstName}}' },
      'staff-1',
    );
    expect(result.id).toBe('camp-1');
    expect(result.status).toBe('draft');
  });
});

describe('listCampaigns / getCampaignById / getCampaignMembers', () => {
  it('lists campaigns mapped to camelCase', async () => {
    campaignsRepositoryMock.selectCampaigns.mockResolvedValue([campaignRow()]);

    const result = await listCampaigns();

    expect(result).toHaveLength(1);
    expect(result[0].messageBody).toBe('Hi {{firstName}}, checking in from {{company}}.');
  });

  it('throws NOT_FOUND when the campaign does not exist', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(null);

    await expect(getCampaignById('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists campaign members mapped to camelCase', async () => {
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue([
      {
        id: 'mem-1',
        campaign_id: 'camp-1',
        lead_id: 'lead-1',
        preview_message: 'Hi Ama, checking in from Acme.',
        created_at: '2026-07-01T00:00:00Z',
      },
    ]);

    const result = await getCampaignMembers('camp-1');

    expect(result).toEqual([
      {
        id: 'mem-1',
        campaignId: 'camp-1',
        leadId: 'lead-1',
        previewMessage: 'Hi Ama, checking in from Acme.',
        createdAt: '2026-07-01T00:00:00Z',
      },
    ]);
  });
});

describe('previewCampaign', () => {
  it('computes the matched audience and rendered messages without persisting anything', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(
      campaignRow({ filter_lead_source: 'WhatsApp' }),
    );
    leadsServiceMock.listLeads.mockResolvedValue([
      lead({ id: 'lead-1', leadSource: 'WhatsApp', fullName: 'Ama Owusu', company: 'Acme' }),
      lead({ id: 'lead-2', leadSource: 'Website' }),
    ]);

    const result = await previewCampaign('camp-1');

    expect(result.matchedLeadCount).toBe(1);
    expect(result.sample).toEqual([
      { leadId: 'lead-1', leadName: 'Ama Owusu', previewMessage: 'Hi Ama, checking in from Acme.' },
    ]);
    expect(campaignsRepositoryMock.insertCampaignMembers).not.toHaveBeenCalled();
    expect(campaignsRepositoryMock.markCampaignQueued).not.toHaveBeenCalled();
  });
});

describe('queueCampaign', () => {
  it('rejects queueing a campaign that is already queued', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'queued' }));

    await expect(queueCampaign('camp-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(campaignsRepositoryMock.insertCampaignMembers).not.toHaveBeenCalled();
  });

  it('rejects queueing when no leads match the filters', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow());
    leadsServiceMock.listLeads.mockResolvedValue([]);

    await expect(queueCampaign('camp-1')).rejects.toMatchObject({ code: 'NO_MATCHING_LEADS' });
    expect(campaignsRepositoryMock.insertCampaignMembers).not.toHaveBeenCalled();
  });

  it('records a dry-run preview per matched lead and marks the campaign queued — never dispatches anything', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow());
    leadsServiceMock.listLeads.mockResolvedValue([
      lead({ id: 'lead-1', fullName: 'Ama Owusu', company: 'Acme' }),
    ]);
    campaignsRepositoryMock.insertCampaignMembers.mockResolvedValue([]);
    campaignsRepositoryMock.markCampaignQueued.mockResolvedValue(campaignRow({ status: 'queued' }));

    const result = await queueCampaign('camp-1');

    expect(campaignsRepositoryMock.insertCampaignMembers).toHaveBeenCalledWith([
      {
        campaign_id: 'camp-1',
        lead_id: 'lead-1',
        preview_message: 'Hi Ama, checking in from Acme.',
      },
    ]);
    expect(campaignsRepositoryMock.markCampaignQueued).toHaveBeenCalledWith('camp-1');
    expect(result.status).toBe('queued');
  });

  it('filters by minimum score', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(
      campaignRow({ filter_min_score: 50 }),
    );
    leadsServiceMock.listLeads.mockResolvedValue([
      lead({ id: 'lead-1', score: 60 }),
      lead({ id: 'lead-2', score: 30 }),
    ]);
    campaignsRepositoryMock.insertCampaignMembers.mockResolvedValue([]);
    campaignsRepositoryMock.markCampaignQueued.mockResolvedValue(campaignRow({ status: 'queued' }));

    await queueCampaign('camp-1');

    expect(campaignsRepositoryMock.insertCampaignMembers).toHaveBeenCalledWith([
      expect.objectContaining({ lead_id: 'lead-1' }),
    ]);
  });
});
