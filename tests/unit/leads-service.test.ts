import { beforeEach, describe, expect, it, vi } from 'vitest';

const leadsRepositoryMock = {
  insertLead: vi.fn(),
  selectLeads: vi.fn(),
  selectLeadById: vi.fn(),
  updateLead: vi.fn(),
  insertLeadActivity: vi.fn(),
  selectLeadActivities: vi.fn(),
  selectStaffFullName: vi.fn(),
};

vi.mock('@/modules/leads/repository', () => leadsRepositoryMock);

const { calculateLeadScore, createLead, getPipelineSummary, getLeadWithActivities, updateLead } =
  await import('@/modules/leads/service');

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe('updateLead', () => {
  function existingLead(overrides: Record<string, unknown> = {}) {
    return {
      id: 'lead-1',
      status: 'New',
      notes: null,
      assigned_to: null,
      score: 30,
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
});

describe('getLeadWithActivities', () => {
  it('returns the lead paired with its activity timeline', async () => {
    leadsRepositoryMock.selectLeadById.mockResolvedValue({ id: 'lead-1', status: 'New' });
    leadsRepositoryMock.selectLeadActivities.mockResolvedValue([{ id: 'act-1' }]);

    const result = await getLeadWithActivities('lead-1');

    expect(result).toEqual({ lead: { id: 'lead-1', status: 'New' }, activities: [{ id: 'act-1' }] });
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
