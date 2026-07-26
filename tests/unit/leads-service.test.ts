import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateLeadInput } from '@/modules/leads/types';

const leadsRepositoryMock = {
  insertLead: vi.fn(),
  selectLeads: vi.fn(),
  selectLeadById: vi.fn(),
  selectLeadByEmail: vi.fn(),
  selectLeadByRegistrationId: vi.fn(),
  selectLeadsDueForFollowUp: vi.fn(),
  selectUnassignedLeadsByLeadSource: vi.fn(),
  updateLead: vi.fn(),
  insertLeadActivity: vi.fn(),
  selectLeadActivities: vi.fn(),
  selectStaffFullName: vi.fn(),
  selectStaffContact: vi.fn(),
  selectActiveAssignmentRuleByLeadSource: vi.fn(),
  selectAssignmentRules: vi.fn(),
  selectAssignmentRuleById: vi.fn(),
  insertAssignmentRule: vi.fn(),
  updateAssignmentRule: vi.fn(),
};
const sendTransactionalEmailMock = vi.fn();

vi.mock('@/modules/leads/repository', () => leadsRepositoryMock);
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));

const {
  calculateLeadScore,
  createLead,
  getPipelineSummary,
  getLeadWithActivities,
  updateLead,
  listAssignmentRules,
  createAssignmentRule,
  updateAssignmentRule: updateAssignmentRuleService,
  markEnrolledByRegistrationId,
  listLeadsDueForFollowUp,
  runFollowUpDispatch,
  backfillAssignmentRule,
} = await import('@/modules/leads/service');

beforeEach(() => {
  vi.clearAllMocks();
  leadsRepositoryMock.selectActiveAssignmentRuleByLeadSource.mockResolvedValue(null);
  leadsRepositoryMock.selectLeadByEmail.mockResolvedValue(null);
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
  function validInput(overrides: Record<string, unknown> = {}): CreateLeadInput {
    return {
      fullName: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      jobTitle: null,
      company: null,
      leadSource: 'WhatsApp',
      status: 'New',
      ...overrides,
    } as CreateLeadInput;
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

describe('createLead — dedup on email', () => {
  function validInput(overrides: Record<string, unknown> = {}): CreateLeadInput {
    return {
      fullName: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      jobTitle: null,
      company: null,
      leadSource: 'WhatsApp',
      status: 'New',
      ...overrides,
    } as CreateLeadInput;
  }

  it('merges into an existing lead found by email instead of creating a duplicate', async () => {
    leadsRepositoryMock.selectLeadByEmail.mockResolvedValue({
      id: 'lead-existing',
      registration_id: null,
      participant_id: null,
      score: 5,
    });
    leadsRepositoryMock.updateLead.mockResolvedValue({ id: 'lead-existing', score: 20 });

    const result = await createLead(
      validInput({ registrationId: '33333333-3333-4333-8333-333333333333' }),
    );

    expect(leadsRepositoryMock.insertLead).not.toHaveBeenCalled();
    expect(leadsRepositoryMock.updateLead).toHaveBeenCalledWith(
      'lead-existing',
      expect.objectContaining({
        registration_id: '33333333-3333-4333-8333-333333333333',
        score: expect.any(Number),
      }),
    );
    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-existing', activity_type: 'duplicate_merged' }),
    );
    expect(result.id).toBe('lead-existing');
  });

  it('never lowers an existing higher score when merging', async () => {
    leadsRepositoryMock.selectLeadByEmail.mockResolvedValue({
      id: 'lead-existing',
      registration_id: 'already-set',
      participant_id: 'already-set',
      score: 90,
    });

    await createLead(validInput());

    // No field needed changing (registration/participant already set, new
    // computed score 20 is lower than the existing 90) — no-op update.
    expect(leadsRepositoryMock.updateLead).not.toHaveBeenCalled();
  });
});

describe('markEnrolledByRegistrationId', () => {
  it('transitions the lead to Enrolled and bumps its score', async () => {
    leadsRepositoryMock.selectLeadByRegistrationId.mockResolvedValue({
      id: 'lead-1',
      status: 'Qualified',
      score: 50,
    });

    await markEnrolledByRegistrationId('reg-1');

    expect(leadsRepositoryMock.updateLead).toHaveBeenCalledWith('lead-1', {
      status: 'Enrolled',
      score: 75,
    });
    expect(leadsRepositoryMock.insertLeadActivity).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-1', activity_type: 'status_changed' }),
    );
  });

  it('caps the score bump at 100', async () => {
    leadsRepositoryMock.selectLeadByRegistrationId.mockResolvedValue({
      id: 'lead-1',
      status: 'New',
      score: 90,
    });

    await markEnrolledByRegistrationId('reg-1');

    expect(leadsRepositoryMock.updateLead).toHaveBeenCalledWith('lead-1', {
      status: 'Enrolled',
      score: 100,
    });
  });

  it('no-ops when no lead exists for the registration', async () => {
    leadsRepositoryMock.selectLeadByRegistrationId.mockResolvedValue(null);

    await markEnrolledByRegistrationId('reg-1');

    expect(leadsRepositoryMock.updateLead).not.toHaveBeenCalled();
  });

  it('no-ops when the lead is already Enrolled or Lost', async () => {
    leadsRepositoryMock.selectLeadByRegistrationId.mockResolvedValue({
      id: 'lead-1',
      status: 'Lost',
      score: 10,
    });

    await markEnrolledByRegistrationId('reg-1');

    expect(leadsRepositoryMock.updateLead).not.toHaveBeenCalled();
  });
});

describe('listLeadsDueForFollowUp / runFollowUpDispatch', () => {
  it('listLeadsDueForFollowUp maps the repository rows to camelCase', async () => {
    leadsRepositoryMock.selectLeadsDueForFollowUp.mockResolvedValue([
      {
        id: 'lead-1',
        registration_id: null,
        participant_id: null,
        full_name: 'Ama Owusu',
        email: 'ama@example.com',
        phone: '+233241234567',
        job_title: null,
        company: null,
        lead_source: 'Website',
        status: 'Follow-up',
        score: 40,
        assigned_to: null,
        notes: null,
        next_follow_up_at: '2026-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const result = await listLeadsDueForFollowUp();

    expect(result).toEqual([expect.objectContaining({ id: 'lead-1', fullName: 'Ama Owusu' })]);
  });

  function dueLeadRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'lead-1',
      registration_id: null,
      participant_id: null,
      full_name: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      job_title: null,
      company: null,
      lead_source: 'Website',
      status: 'Follow-up',
      score: 40,
      assigned_to: 'staff-1',
      notes: null,
      next_follow_up_at: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      ...overrides,
    };
  }

  it('emails the assigned staff member for each due lead', async () => {
    leadsRepositoryMock.selectLeadsDueForFollowUp.mockResolvedValue([dueLeadRow()]);
    leadsRepositoryMock.selectStaffContact.mockResolvedValue({
      fullName: 'Kofi Mensah',
      email: 'kofi@business.com',
    });

    const summary = await runFollowUpDispatch();

    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'kofi@business.com' }),
    );
    expect(summary).toEqual({ notified: 1, skipped: 0, errors: [] });
  });

  it('skips an unassigned lead when no fallback email is configured', async () => {
    const original = process.env.LEADS_FALLBACK_NOTIFY_EMAIL;
    delete process.env.LEADS_FALLBACK_NOTIFY_EMAIL;
    leadsRepositoryMock.selectLeadsDueForFollowUp.mockResolvedValue([
      dueLeadRow({ assigned_to: null }),
    ]);

    const summary = await runFollowUpDispatch();

    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(summary).toEqual({ notified: 0, skipped: 1, errors: [] });
    if (original !== undefined) process.env.LEADS_FALLBACK_NOTIFY_EMAIL = original;
  });

  it('records a per-lead error without blocking the rest of the batch', async () => {
    leadsRepositoryMock.selectLeadsDueForFollowUp.mockResolvedValue([
      dueLeadRow({ id: 'lead-1' }),
      dueLeadRow({ id: 'lead-2' }),
    ]);
    leadsRepositoryMock.selectStaffContact.mockResolvedValue({
      fullName: 'Kofi Mensah',
      email: 'kofi@business.com',
    });
    sendTransactionalEmailMock.mockRejectedValueOnce(new Error('send failed')).mockResolvedValueOnce(undefined);

    const summary = await runFollowUpDispatch();

    expect(summary.notified).toBe(1);
    expect(summary.errors).toHaveLength(1);
  });
});

describe('backfillAssignmentRule', () => {
  it('assigns only currently-unassigned leads matching the rule source', async () => {
    leadsRepositoryMock.selectAssignmentRuleById.mockResolvedValue({
      id: 'rule-1',
      lead_source: 'WhatsApp',
      assigned_to: 'staff-1',
      is_active: true,
    });
    leadsRepositoryMock.selectUnassignedLeadsByLeadSource.mockResolvedValue([
      { id: 'lead-1' },
      { id: 'lead-2' },
    ]);
    leadsRepositoryMock.selectStaffFullName.mockResolvedValue('Jane Doe');

    const result = await backfillAssignmentRule('rule-1');

    expect(leadsRepositoryMock.selectUnassignedLeadsByLeadSource).toHaveBeenCalledWith('WhatsApp');
    expect(leadsRepositoryMock.updateLead).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ assignedCount: 2 });
  });

  it('rejects applying an inactive rule', async () => {
    leadsRepositoryMock.selectAssignmentRuleById.mockResolvedValue({
      id: 'rule-1',
      lead_source: 'WhatsApp',
      assigned_to: 'staff-1',
      is_active: false,
    });

    await expect(backfillAssignmentRule('rule-1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(leadsRepositoryMock.selectUnassignedLeadsByLeadSource).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND for a missing rule', async () => {
    leadsRepositoryMock.selectAssignmentRuleById.mockResolvedValue(null);

    await expect(backfillAssignmentRule('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('updateLead — schema validation', () => {
  it('rejects an invalid status', async () => {
    await expect(updateLead('lead-1', { status: 'NotARealStatus' as never })).rejects.toThrow();
    expect(leadsRepositoryMock.selectLeadById).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range score', async () => {
    await expect(updateLead('lead-1', { score: 9999 })).rejects.toThrow();
    expect(leadsRepositoryMock.selectLeadById).not.toHaveBeenCalled();
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
    const staffId = '22222222-2222-4222-8222-222222222222';
    leadsRepositoryMock.selectLeadById.mockResolvedValue(existingLead());
    leadsRepositoryMock.updateLead.mockResolvedValue(existingLead({ assigned_to: staffId }));
    leadsRepositoryMock.selectStaffFullName.mockResolvedValue('Kofi Mensah');

    await updateLead('lead-1', { assignedTo: staffId }, 'staff-1');

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
