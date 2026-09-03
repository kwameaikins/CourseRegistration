import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const leadsServiceMock = {
  listLeads: vi.fn(),
  getLeadWithActivities: vi.fn(),
  recentAgentSuggestionLeadIdsSystem: vi.fn(),
  recordAgentSuggestionSystem: vi.fn(),
  applyAgentScoreAdjustmentSystem: vi.fn(),
  scheduleAgentFollowUpSystem: vi.fn(),
};
const leadsRepositoryMock = {
  selectLeadByRegistrationId: vi.fn(),
};
const agentsRepositoryMock = {
  selectOutstandingDebtors: vi.fn(),
  selectDigestRecipientEmails: vi.fn(),
  selectUpcomingBatches: vi.fn(),
};
const campaignsServiceMock = {
  listCampaigns: vi.fn(),
  createCampaign: vi.fn(),
};
const dashboardServiceMock = {
  computeDashboardSummary: vi.fn(),
};
const sendTransactionalEmailMock = vi.fn();
const runJsonAgentMock = vi.fn();

vi.mock('@/modules/leads/service', () => leadsServiceMock);
vi.mock('@/modules/leads/repository', () => leadsRepositoryMock);
vi.mock('@/modules/agents/repository', () => agentsRepositoryMock);
vi.mock('@/modules/campaigns/service', () => campaignsServiceMock);
vi.mock('@/modules/dashboard/service', () => dashboardServiceMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));
vi.mock('@/modules/agents/model', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/agents/model')>();
  return {
    ...original,
    runJsonAgent: (...args: unknown[]) => runJsonAgentMock(...args),
    isAgentConfigured: () => Boolean(process.env.ANTHROPIC_API_KEY),
  };
});

const { parseAgentJson } = await import('@/modules/agents/model');
const { runLeadTriageAgent } = await import('@/modules/agents/lead-triage');
const { runCollectionsAgent } = await import('@/modules/agents/collections');
const { runExecDigestAgent } = await import('@/modules/agents/exec-digest');
const { runCampaignProposerAgent } = await import('@/modules/agents/campaign-proposer');
const { runAgentDispatch } = await import('@/modules/agents/service');

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1', registrationId: null, participantId: null,
    fullName: 'Ama Owusu', email: 'ama@example.com', phone: '0245000000',
    jobTitle: null, company: null, leadSource: 'Website', status: 'New',
    score: 40, assignedTo: null, notes: null, nextFollowUpAt: null,
    attribution: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = 'test-key';
  leadsServiceMock.recentAgentSuggestionLeadIdsSystem.mockResolvedValue(new Set());
  leadsServiceMock.getLeadWithActivities.mockResolvedValue({ lead: lead(), activities: [] });
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.AGENT_LEAD_TRIAGE_ENABLED;
  delete process.env.AGENT_COLLECTIONS_ENABLED;
  delete process.env.AGENT_EXEC_DIGEST_ENABLED;
  delete process.env.AGENT_CAMPAIGN_PROPOSER_ENABLED;
  delete process.env.DIGEST_EXTRA_RECIPIENTS;
});

describe('parseAgentJson', () => {
  it('tolerates fences and prose', () => {
    expect(parseAgentJson('Here you go:\n```json\n[{"a": 1}]\n```')).toEqual([{ a: 1 }]);
    expect(parseAgentJson('{"b": 2}')).toEqual({ b: 2 });
  });
  it('refuses non-JSON', () => {
    expect(() => parseAgentJson('I could not decide.')).toThrow();
  });
});

describe('lead triage agent', () => {
  it('suggestions are recorded, bounded actions applied, nothing sent', async () => {
    leadsServiceMock.listLeads.mockResolvedValue([
      lead(), lead({ id: 'lead-2', fullName: 'Kwame Mensah' }),
    ]);
    runJsonAgentMock.mockResolvedValue([
      {
        leadId: 'lead-1', action: 'suggest_message',
        reason: 'warm', draftMessage: 'Hi Ama — seats for Nov are filling.',
        scoreAdjustment: 10,
      },
      { leadId: 'lead-2', action: 'schedule_follow_up', reason: 'said call after payday', nextFollowUpDays: 5 },
    ]);

    const summary = await runLeadTriageAgent();

    expect(summary).toMatchObject({ evaluated: 2, suggestions: 1, followUpsScheduled: 1, scoresAdjusted: 1 });
    expect(leadsServiceMock.recordAgentSuggestionSystem).toHaveBeenCalledWith(
      'lead-1',
      expect.stringContaining('Hi Ama'),
    );
    expect(leadsServiceMock.scheduleAgentFollowUpSystem).toHaveBeenCalledWith(
      'lead-2', 5, 'said call after payday',
    );
  });

  it('an invented leadId from the model is a no-op', async () => {
    leadsServiceMock.listLeads.mockResolvedValue([lead()]);
    runJsonAgentMock.mockResolvedValue([
      { leadId: 'lead-i-made-up', action: 'suggest_message', reason: 'x', draftMessage: 'y' },
    ]);
    const summary = await runLeadTriageAgent();
    expect(summary.suggestions).toBe(0);
    expect(leadsServiceMock.recordAgentSuggestionSystem).not.toHaveBeenCalled();
  });

  it('honours the suggestion cooldown before spending tokens', async () => {
    leadsServiceMock.listLeads.mockResolvedValue([lead()]);
    leadsServiceMock.recentAgentSuggestionLeadIdsSystem.mockResolvedValue(new Set(['lead-1']));
    const summary = await runLeadTriageAgent();
    expect(summary.skippedCooldown).toBe(1);
    expect(runJsonAgentMock).not.toHaveBeenCalled();
  });

  it('only triages open statuses — Enrolled and Lost are left alone', async () => {
    leadsServiceMock.listLeads.mockResolvedValue([
      lead({ id: 'won', status: 'Enrolled' }),
      lead({ id: 'gone', status: 'Lost' }),
    ]);
    const summary = await runLeadTriageAgent();
    expect(summary.evaluated).toBe(0);
    expect(runJsonAgentMock).not.toHaveBeenCalled();
  });
});

describe('collections agent', () => {
  const debtor = {
    registrationId: 'reg-1', participantName: 'Ama Owusu',
    courseName: 'Financial Management', cohortLabel: 'NOV-2026',
    batchStartDate: '2026-11-01', courseFee: 1900, amountPaid: 500,
    balance: 1400, paymentStatus: 'Part Payment',
    brokenPromiseDate: '2026-08-30', installmentDueDate: null,
  };

  it('drafts land on the lead as suggestions — never a direct send', async () => {
    agentsRepositoryMock.selectOutstandingDebtors.mockResolvedValue([debtor]);
    leadsRepositoryMock.selectLeadByRegistrationId.mockResolvedValue({ id: 'lead-1' });
    runJsonAgentMock.mockResolvedValue([
      { registrationId: 'reg-1', action: 'draft_sms', reason: 'broken promise', message: 'Hi Ama…' },
    ]);

    const summary = await runCollectionsAgent();

    expect(summary).toMatchObject({ evaluated: 1, drafts: 1, escalations: 0 });
    expect(leadsServiceMock.recordAgentSuggestionSystem).toHaveBeenCalledWith(
      'lead-1',
      expect.stringContaining('Collections draft (SMS)'),
    );
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it('a debtor with no lead row is reported, not silently skipped', async () => {
    agentsRepositoryMock.selectOutstandingDebtors.mockResolvedValue([debtor]);
    leadsRepositoryMock.selectLeadByRegistrationId.mockResolvedValue(null);
    const summary = await runCollectionsAgent();
    expect(summary.noLeadRow).toBe(1);
    expect(runJsonAgentMock).not.toHaveBeenCalled();
  });
});

describe('executive digest agent', () => {
  it('emails admin+management plus env extras, numbers from the dashboard', async () => {
    dashboardServiceMock.computeDashboardSummary.mockResolvedValue({
      aggregate: {
        registrationsThisMonth: 12, revenueReceivedThisMonth: 8000,
        revenueCollectedInPeriod: 9500, totalOutstandingBalance: 30000,
        collectedBySource: {}, ledgerActive: true,
      },
      funnel: { leadsCreated: 20, leadsQualified: 8, registrations: 12, paidRegistrations: 6, leadToRegistrationRate: 60, registrationToPaidRate: 50 },
      leadSources: [], campaignPerformance: [],
      repeatEnrolment: { repeatRate: 10, registrations: 12, repeatRegistrations: 1, returningParticipants: 1 },
      leadPipeline: { total: 40, unassigned: 3, averageScore: 44, byStatus: {} },
      salesPipeline: { total: 12, openValue: 20000, wonValue: 8000, byStage: {} },
      lifetimeValue: { participants: 30, averageLtv: 1500, bySource: [] },
      courses: [], corporateSummary: {}, appliedRange: { dateFrom: null, dateTo: null },
    });
    agentsRepositoryMock.selectDigestRecipientEmails.mockResolvedValue(['boss@knowsia.com']);
    process.env.DIGEST_EXTRA_RECIPIENTS = 'advisor@example.com';
    runJsonAgentMock.mockResolvedValue({
      subject: 'Weekly digest: steady week',
      paragraphs: ['Registrations held at 12.'],
      recommendation: 'Chase the GHS 30,000 outstanding.',
    });

    const summary = await runExecDigestAgent(new Date('2026-09-07T07:00:00Z'));

    expect(summary.sent).toBe(2);
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'boss@knowsia.com', subject: 'Weekly digest: steady week' }),
    );
  });
});

describe('campaign proposer agent', () => {
  it('creates a DRAFT with the [Agent] prefix — the human machinery is the gate', async () => {
    campaignsServiceMock.listCampaigns.mockResolvedValue([]);
    agentsRepositoryMock.selectUpcomingBatches.mockResolvedValue([
      { courseName: 'Financial Management', cohortLabel: 'NOV-2026', startDate: '2026-11-01', courseFee: 1900 },
    ]);
    leadsServiceMock.listLeads.mockResolvedValue([lead()]);
    runJsonAgentMock.mockResolvedValue({
      name: 'November FM push', messageSubject: 'Evening classes, real skills',
      messageBody: 'Hi {{firstName}}, the November cohort opens soon…',
      filterStatus: null, filterLeadSource: null, filterMinScore: null, reason: 'open cohort',
    });
    campaignsServiceMock.createCampaign.mockResolvedValue({ id: 'camp-1' });

    const summary = await runCampaignProposerAgent();

    expect(summary).toMatchObject({ created: true, campaignId: 'camp-1' });
    expect(campaignsServiceMock.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ name: '[Agent] November FM push', channel: 'email' }),
      null,
    );
  });

  it('one draft a week — skips while a recent [Agent] draft awaits review', async () => {
    campaignsServiceMock.listCampaigns.mockResolvedValue([
      { name: '[Agent] last week', createdAt: new Date().toISOString() },
    ]);
    const summary = await runCampaignProposerAgent();
    expect(summary.created).toBe(false);
    expect(runJsonAgentMock).not.toHaveBeenCalled();
  });
});

describe('agent dispatch', () => {
  it('everything ships DISARMED — no env flags, no runs, no model calls', async () => {
    const summary = await runAgentDispatch(new Date('2026-09-07T07:00:00Z')); // a Monday
    expect(summary.leadTriage.status).toBe('disabled');
    expect(summary.collections.status).toBe('disabled');
    expect(summary.execDigest.status).toBe('disabled');
    expect(summary.campaignProposer.status).toBe('disabled');
    expect(runJsonAgentMock).not.toHaveBeenCalled();
  });

  it('weekly agents respect their day even when enabled', async () => {
    process.env.AGENT_EXEC_DIGEST_ENABLED = 'true';
    process.env.AGENT_CAMPAIGN_PROPOSER_ENABLED = 'true';
    const wednesday = new Date('2026-09-09T07:00:00Z');
    const summary = await runAgentDispatch(wednesday);
    expect(summary.execDigest.status).toBe('not_scheduled_today');
    expect(summary.campaignProposer.status).toBe('not_scheduled_today');
  });

  it('one agent failing reports as failed without sinking the others', async () => {
    process.env.AGENT_LEAD_TRIAGE_ENABLED = 'true';
    process.env.AGENT_COLLECTIONS_ENABLED = 'true';
    leadsServiceMock.listLeads.mockRejectedValue(new Error('db down'));
    agentsRepositoryMock.selectOutstandingDebtors.mockResolvedValue([]);

    const summary = await runAgentDispatch(new Date('2026-09-09T07:00:00Z'));

    expect(summary.leadTriage.status).toBe('failed');
    expect(summary.collections.status).toBe('ran');
  });
});
