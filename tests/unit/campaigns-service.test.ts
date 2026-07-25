import { beforeEach, describe, expect, it, vi } from 'vitest';

const campaignsRepositoryMock = {
  insertCampaign: vi.fn(),
  selectCampaigns: vi.fn(),
  selectCampaignById: vi.fn(),
  markCampaignQueued: vi.fn(),
  markCampaignSent: vi.fn(),
  insertCampaignMembers: vi.fn(),
  selectCampaignMembers: vi.fn(),
  markCampaignMemberSent: vi.fn(),
  markCampaignMemberFailed: vi.fn(),
  selectSendSettings: vi.fn(),
  selectSendSettingByChannel: vi.fn(),
  updateSendSetting: vi.fn(),
};

const leadsServiceMock = {
  listLeads: vi.fn(),
};

const sendTransactionalEmailMock = vi.fn();
const sendSmsMessageMock = vi.fn();

vi.mock('@/modules/campaigns/repository', () => campaignsRepositoryMock);
vi.mock('@/modules/leads/service', () => leadsServiceMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));
vi.mock('@/lib/arkesel/client', () => ({
  sendSmsMessage: (...args: unknown[]) => sendSmsMessageMock(...args),
}));

const {
  createCampaign,
  listCampaigns,
  getCampaignById,
  getCampaignMembers,
  listSendSettings,
  updateSendSetting,
  previewCampaign,
  queueCampaign,
  sendCampaign,
} = await import('@/modules/campaigns/service');

beforeEach(() => {
  vi.clearAllMocks();
  sendTransactionalEmailMock.mockResolvedValue(undefined);
  sendSmsMessageMock.mockResolvedValue(undefined);
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

function campaignMemberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-1',
    campaign_id: 'camp-1',
    lead_id: 'lead-1',
    preview_message: 'Hi Ama, checking in from Acme.',
    sent_at: null,
    send_error: null,
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function sendSettingRow(overrides: Record<string, unknown> = {}) {
  return {
    channel: 'email',
    live_enabled: false,
    updated_at: '2026-07-01T00:00:00Z',
    updated_by: null,
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
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue([campaignMemberRow()]);

    const result = await getCampaignMembers('camp-1');

    expect(result).toEqual([
      {
        id: 'mem-1',
        campaignId: 'camp-1',
        leadId: 'lead-1',
        previewMessage: 'Hi Ama, checking in from Acme.',
        sentAt: null,
        sendError: null,
        createdAt: '2026-07-01T00:00:00Z',
      },
    ]);
  });
});

describe('send settings', () => {
  it('lists and updates live-send settings', async () => {
    campaignsRepositoryMock.selectSendSettings.mockResolvedValue([sendSettingRow()]);
    campaignsRepositoryMock.updateSendSetting.mockResolvedValue(
      sendSettingRow({ live_enabled: true, updated_by: 'staff-1' }),
    );

    await expect(listSendSettings()).resolves.toEqual([
      {
        channel: 'email',
        liveEnabled: false,
        updatedAt: '2026-07-01T00:00:00Z',
        updatedBy: null,
      },
    ]);

    const updated = await updateSendSetting('email', true, 'staff-1');

    expect(campaignsRepositoryMock.updateSendSetting).toHaveBeenCalledWith(
      'email',
      true,
      'staff-1',
    );
    expect(updated.liveEnabled).toBe(true);
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

  it('records a dry-run preview per matched lead and marks the campaign queued - never dispatches anything', async () => {
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
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
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

describe('sendCampaign', () => {
  it('rejects live sending unless the campaign is queued', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'draft' }));

    await expect(
      sendCampaign('camp-1', { confirmedRecipientCount: 1, confirmationText: 'SEND 1' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('rejects WhatsApp live sending until the channel is wired', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(
      campaignRow({ status: 'queued', channel: 'whatsapp' }),
    );

    await expect(
      sendCampaign('camp-1', { confirmedRecipientCount: 1, confirmationText: 'SEND 1' }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CHANNEL' });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(sendSmsMessageMock).not.toHaveBeenCalled();
  });

  it('requires the email live-send toggle to be enabled', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'queued' }));
    campaignsRepositoryMock.selectSendSettingByChannel.mockResolvedValue(sendSettingRow());

    await expect(
      sendCampaign('camp-1', { confirmedRecipientCount: 1, confirmationText: 'SEND 1' }),
    ).rejects.toMatchObject({ code: 'LIVE_SEND_DISABLED' });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('requires exact recipient count and typed confirmation', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'queued' }));
    campaignsRepositoryMock.selectSendSettingByChannel.mockResolvedValue(
      sendSettingRow({ live_enabled: true }),
    );
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue([campaignMemberRow()]);

    await expect(
      sendCampaign('camp-1', { confirmedRecipientCount: 2, confirmationText: 'SEND 2' }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
    await expect(
      sendCampaign('camp-1', { confirmedRecipientCount: 1, confirmationText: 'send 1' }),
    ).rejects.toMatchObject({ code: 'CONFIRMATION_MISMATCH' });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('caps live sends at 100 queued recipients', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'queued' }));
    campaignsRepositoryMock.selectSendSettingByChannel.mockResolvedValue(
      sendSettingRow({ live_enabled: true }),
    );
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue(
      Array.from({ length: 101 }, (_, index) =>
        campaignMemberRow({ id: `mem-${index}`, lead_id: `lead-${index}` }),
      ),
    );

    await expect(
      sendCampaign('camp-1', { confirmedRecipientCount: 101, confirmationText: 'SEND 101' }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_LIMIT_EXCEEDED' });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('sends email, records member status, and marks the campaign sent', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'queued' }));
    campaignsRepositoryMock.selectSendSettingByChannel.mockResolvedValue(
      sendSettingRow({ live_enabled: true }),
    );
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue([
      campaignMemberRow(),
      campaignMemberRow({
        id: 'mem-2',
        lead_id: 'lead-2',
        preview_message: 'Hi Kojo, checking in from Beta.',
      }),
    ]);
    leadsServiceMock.listLeads.mockResolvedValue([
      lead({ id: 'lead-1', email: 'ama@example.com' }),
      lead({ id: 'lead-2', email: 'kojo@example.com', fullName: 'Kojo Mensah', company: 'Beta' }),
    ]);
    campaignsRepositoryMock.markCampaignSent.mockResolvedValue(
      campaignRow({ status: 'sent', updated_at: '2026-07-02T00:00:00Z' }),
    );

    const result = await sendCampaign('camp-1', {
      confirmedRecipientCount: 2,
      confirmationText: 'SEND 2',
    });

    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(2);
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ama@example.com',
        from: 'Knowsia <reg@knowsia.com>',
        subject: 'Hey {{firstName}}',
      }),
    );
    expect(campaignsRepositoryMock.markCampaignMemberSent).toHaveBeenCalledTimes(2);
    expect(campaignsRepositoryMock.markCampaignSent).toHaveBeenCalledWith('camp-1');
    expect(result).toMatchObject({ attempted: 2, sent: 2, failed: 0 });
    expect(result.campaign.status).toBe('sent');
  });

  it('sends SMS through Arkesel and records the member status', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(
      campaignRow({ status: 'queued', channel: 'sms', message_subject: null }),
    );
    campaignsRepositoryMock.selectSendSettingByChannel.mockResolvedValue(
      sendSettingRow({ channel: 'sms', live_enabled: true }),
    );
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue([campaignMemberRow()]);
    leadsServiceMock.listLeads.mockResolvedValue([lead({ phone: '+233241234567' })]);
    campaignsRepositoryMock.markCampaignSent.mockResolvedValue(
      campaignRow({ status: 'sent', channel: 'sms' }),
    );

    const result = await sendCampaign('camp-1', {
      confirmedRecipientCount: 1,
      confirmationText: 'SEND 1',
    });

    expect(sendSmsMessageMock).toHaveBeenCalledWith({
      toPhone: '+233241234567',
      message: 'Hi Ama, checking in from Acme.',
    });
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(campaignsRepositoryMock.markCampaignMemberSent).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
  });
  it('records per-member send failures without stopping the batch', async () => {
    campaignsRepositoryMock.selectCampaignById.mockResolvedValue(campaignRow({ status: 'queued' }));
    campaignsRepositoryMock.selectSendSettingByChannel.mockResolvedValue(
      sendSettingRow({ live_enabled: true }),
    );
    campaignsRepositoryMock.selectCampaignMembers.mockResolvedValue([
      campaignMemberRow(),
      campaignMemberRow({ id: 'mem-2', lead_id: 'lead-2' }),
    ]);
    leadsServiceMock.listLeads.mockResolvedValue([
      lead({ id: 'lead-1', email: 'ama@example.com' }),
      lead({ id: 'lead-2', email: null }),
    ]);
    sendTransactionalEmailMock.mockRejectedValueOnce(new Error('resend down'));
    campaignsRepositoryMock.markCampaignSent.mockResolvedValue(campaignRow({ status: 'sent' }));

    const result = await sendCampaign('camp-1', {
      confirmedRecipientCount: 2,
      confirmationText: 'SEND 2',
    });

    expect(campaignsRepositoryMock.markCampaignMemberFailed).toHaveBeenCalledWith(
      'mem-1',
      'resend down',
    );
    expect(campaignsRepositoryMock.markCampaignMemberFailed).toHaveBeenCalledWith(
      'mem-2',
      'Lead has no email address.',
    );
    expect(result).toMatchObject({ attempted: 2, sent: 0, failed: 2 });
  });
});
