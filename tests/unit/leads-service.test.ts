import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadsRepositoryMock = {
  insertLead: vi.fn(),
  selectLeads: vi.fn(),
  selectLeadById: vi.fn(),
  updateLead: vi.fn(),
  insertLeadActivity: vi.fn(),
  selectLeadActivities: vi.fn(),
  selectStaffFullName: vi.fn(),
  selectActiveAssignmentRuleByLeadSource: vi.fn(),
  selectAssignmentRules: vi.fn(),
  insertAssignmentRule: vi.fn(),
  updateAssignmentRule: vi.fn(),
};

vi.mock('@/modules/leads/repository', () => leadsRepositoryMock);

const {
  calculateLeadScore,
  createLead,
  getPipelineSummary,
  getLeadWithActivities,
  updateLead,
  listAssignmentRules,
  createAssignmentRule,
  updateAssignmentRule: updateAssignmentRuleService,
} = await import('@/modules/leads/service');

beforeEach(() => {
  vi.clearAllMocks();
  leadsRepositoryMock.selectActiveAssignmentRuleByLeadSource.mockResolvedValue(null);
});

describe('calculateLeadScore', () => {
  it('scores a bare-minimum lead at the base amount plus its source weight', () => {
    expect(calculateLeadScore({ jobTitle: null, company: null, leadSource: 'Website' })).toBe(
      10 + 15,
    );
  });

  it('treats "N/A" job title/company as absent, not present', () => {
    expect(calculateLeadScore({ jobTitle: 'N/A', company: 'n/a', leadSource: 'Website' })).toBe(
      10 + 15,
    );
  });

  it('rewards a real job title and company', () => {
    expect(
      calculateLeadScore({ jobTitle: 'Finance Manager', company: 'Acme Ltd', leadSource: 'Website' }),
    ).toBe(10 + 20 + 15 + 15);
  });

  it('weights Referral higher than Facebook', () => {
    const referral = calculateLeadScore({ jobTitle: null, company: null, leadSource: 'Referral' });
    const facebook = calculateLeadScore({ jobTitle: null, company: null, leadSource: 'Facebook' });
    expect(referral).toBeGreaterThan(facebook);
  });

  it('caps the score at 100', () => {
    const score = calculateLeadScore({
      jobTitle: 'CEO',
      company: 'Big Corp',
      leadSource: 'Referral',
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('gives an unknown lead source no bonus weight', () => {
    expect(calculateLeadScore({ jobTitle: null, company: null, leadSource: 'Carrier Pigeon' })).toBe(
      10,
    );
  });
});

describe('createLead', () => {
  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      fullName: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      jobTitle: null,
      company: null,
      leadSource: 'WhatsApp',
      status: 'New',
      ...overrides,
    };
  }

  it('computes an automatic score when none is supplied', async () => {
    leadsRepositoryMock.insertLead.mockResolvedValue({ id: 'lead-1' });

    await createLead(validInput());

    expect(leadsRepositoryMock.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ score: 10 + 10 }), // base + WhatsApp weight
    );
  });

  it('respects an explicit score instead of computing one', async () => {
    leadsRepositoryMock.insertLead.mockResolvedValue({ id: 'lead-1' });

    await createLead(validInput({ score: 77 }));

    expect(leadsRepositoryMock.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ score: 77 }),
    );
  });

  it('logs a "created" activity with no actor', async () => {
    leadsRepositoryMock.insertLead.mockResolvedValue({ id: 'lead-1' });

    await createLead(validInput());

    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-1', activity_type: 'created', performed_by: null }),
    );
  });

  it('auto-assigns to the matching active rule when no assignee is given', async () => {
    leadsRepositoryMock.insertLead.mockResolvedValue({ id: 'lead-1' });
    leadsRepositoryMock.selectActiveAssignmentRuleByLeadSource.mockResolvedValue({
      id: 'rule-1',
      lead_source: 'WhatsApp',
      assigned_to: 'staff-1',
      is_active: true,
    });
    leadsRepositoryMock.selectStaffFullName.mockResolvedValue('Jane Doe');

    await createLead(validInput());

    expect(leadsRepositoryMock.selectActiveAssignmentRuleByLeadSource).toHaveBeenCalledWith(
      'WhatsApp',
    );
    expect(leadsRepositoryMock.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: 'staff-1' }),
    );
    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        activity_type: 'assigned',
        description: expect.stringContaining('Jane Doe'),
      }),
    );
  });

  it('does not look up a rule when an explicit assignee is provided', async () => {
    leadsRepositoryMock.insertLead.mockResolvedValue({ id: 'lead-1' });

    await createLead(validInput({ assignedTo: '11111111-1111-4111-8111-111111111111' }));

    expect(leadsRepositoryMock.selectActiveAssignmentRuleByLeadSource).not.toHaveBeenCalled();
    expect(leadsRepositoryMock.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: '11111111-1111-4111-8111-111111111111' }),
    );
  });

  it('leaves the lead unassigned when no matching rule exists', async () => {
    leadsRepositoryMock.insertLead.mockResolvedValue({ id: 'lead-1' });
    leadsRepositoryMock.selectActiveAssignmentRuleByLeadSource.mockResolvedValue(null);

    await createLead(validInput());

    expect(leadsRepositoryMock.insertLead).toHaveBeenCalledWith(
      expect.objectContaining({ assignedTo: null }),
    );
    expect(leadsRepositoryMock.insertLeadActivity).not.toHaveBeenCalledWith(
      expect.objectContaining({ activity_type: 'assigned' }),
    );
  });
});

describe('lead assignment rules', () => {
  it('lists rules mapped to camelCase', async () => {
    leadsRepositoryMock.selectAssignmentRules.mockResolvedValue([
      {
        id: 'rule-1',
        lead_source: 'WhatsApp',
        assigned_to: 'staff-1',
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const result = await listAssignmentRules();

    expect(result).toEqual([
      {
        id: 'rule-1',
        leadSource: 'WhatsApp',
        assignedTo: 'staff-1',
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('creates a rule via the repository and maps the result', async () => {
    leadsRepositoryMock.insertAssignmentRule.mockResolvedValue({
      id: 'rule-2',
      lead_source: 'Referral',
      assigned_to: 'staff-3',
      is_active: true,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });

    const result = await createAssignmentRule({ leadSource: 'Referral', assignedTo: 'staff-3' });

    expect(leadsRepositoryMock.insertAssignmentRule).toHaveBeenCalledWith({
      leadSource: 'Referral',
      assignedTo: 'staff-3',
    });
    expect(result.leadSource).toBe('Referral');
    expect(result.assignedTo).toBe('staff-3');
  });

  it('updates a rule via the repository and maps the result', async () => {
    leadsRepositoryMock.updateAssignmentRule.mockResolvedValue({
      id: 'rule-2',
      lead_source: 'Referral',
      assigned_to: 'staff-3',
      is_active: false,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
    });

    const result = await updateAssignmentRuleService('rule-2', { isActive: false });

    expect(leadsRepositoryMock.updateAssignmentRule).toHaveBeenCalledWith('rule-2', {
      isActive: false,
    });
    expect(result.isActive).toBe(false);
  });
});

describe('updateLead', () => {
  function existingLead(overrides: Record<string, unknown> = {}) {
    return {
      id: 'lead-1',
      status: 'New',
      notes: null,
      assigned_to: null,
      score: 30,
      next_follow_up_at: null,
      ...overrides,
    };
  }

  it('throws NOT_FOUND when the lead does not exist', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(null);

    await expect(updateLead('missing', { status: 'Qualified' })).rejects.toThrow('Lead not found.');
  });

  it('logs a status_changed activity when status changes', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(existingLead());
    leadsRepositoryMock.updateLead.mockResolvedValue(existingLead({ status: 'Qualified' }));

    await updateLead('lead-1', { status: 'Qualified' }, 'staff-1');

    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        lead_id: 'lead-1',
        activity_type: 'status_changed',
        performed_by: 'staff-1',
      }),
    );
  });

  it('logs an assigned activity naming the staff member', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(existingLead());
    leadsRepositoryMock.updateLead.mockResolvedValue(existingLead({ assigned_to: 'staff-2' }));
    leadsRepositoryMock.selectStaffFullName.mockResolvedValue('Kofi Mensah');

    await updateLead('lead-1', { assignedTo: 'staff-2' }, 'staff-1');

    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_type: 'assigned',
        description: expect.stringContaining('Kofi Mensah'),
      }),
    );
  });

  it('logs an unassigned activity when assignedTo is cleared', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(existingLead({ assigned_to: 'staff-2' }));
    leadsRepositoryMock.updateLead.mockResolvedValue(existingLead({ assigned_to: null }));

    await updateLead('lead-1', { assignedTo: null }, 'staff-1');

    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({ activity_type: 'unassigned' }),
    );
  });

  it('does not log anything when no tracked field actually changes', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(existingLead());
    leadsRepositoryMock.updateLead.mockResolvedValue(existingLead());

    await updateLead('lead-1', { status: 'New' }, 'staff-1');

    expect(leadsRepositoryMock.insertLeadActivity).not.toHaveBeenCalled();
  });

  it('logs a follow_up_scheduled activity naming the new date when a follow-up is set', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(existingLead());
    leadsRepositoryMock.updateLead.mockResolvedValue(
      existingLead({ next_follow_up_at: '2026-08-01T00:00:00Z' }),
    );

    await updateLead('lead-1', { nextFollowUpAt: '2026-08-01T00:00:00Z' }, 'staff-1');

    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_type: 'follow_up_scheduled',
        description: expect.stringContaining('Follow-up scheduled for'),
      }),
    );
  });

  it('logs a follow_up_scheduled activity noting the reminder was cleared', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue(
      existingLead({ next_follow_up_at: '2026-08-01T00:00:00Z' }),
    );
    leadsRepositoryMock.updateLead.mockResolvedValue(existingLead({ next_follow_up_at: null }));

    await updateLead('lead-1', { nextFollowUpAt: null }, 'staff-1');

    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activity_type: 'follow_up_scheduled',
        description: expect.stringContaining('cleared'),
      }),
    );
  });
});

describe('getLeadWithActivities', () => {
  it('returns the lead (mapped to camelCase) paired with its activity timeline', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue({
      id: 'lead-1',
      registration_id: null,
      participant_id: null,
      full_name: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      job_title: null,
      company: null,
      lead_source: 'Website',
      status: 'New',
      score: 25,
      assigned_to: null,
      notes: null,
      next_follow_up_at: null,
      created_at: '2026-07-01T00:00:00Z',
      updated_at: '2026-07-01T00:00:00Z',
    });
    leadsRepositoryMock.selectLeadActivities.mockResolvedValue([
      {
        id: 'act-1',
        lead_id: 'lead-1',
        activity_type: 'created',
        description: 'Lead captured from Website.',
        performed_by: null,
        created_at: '2026-07-01T00:00:00Z',
      },
    ]);

    const result = await getLeadWithActivities('lead-1');

    expect(result.lead).toEqual(
      expect.objectContaining({ id: 'lead-1', fullName: 'Ama Owusu', status: 'New' }),
    );
    expect(result.activities).toEqual([
      expect.objectContaining({
        id: 'act-1',
        leadId: 'lead-1',
        activityType: 'created',
        description: 'Lead captured from Website.',
      }),
    ]);
  });
});

describe('getPipelineSummary', () => {
  it('summarises total, by-status counts, average score, and unassigned count', async () => {
    leadsRepositoryMock.selectLeads.mockResolvedValue([
      { status: 'New', score: 30, assigned_to: null },
      { status: 'New', score: 50, assigned_to: 'staff-1' },
      { status: 'Qualified', score: 70, assigned_to: null },
    ]);

    const summary = await getPipelineSummary();

    expect(summary).toEqual({
      total: 3,
      byStatus: { New: 2, Qualified: 1 },
      averageScore: 50,
      unassigned: 2,
    });
  });
});
