import { beforeEach, describe, expect, it, vi } from 'vitest';

const arkeselMock = { sendSmsMessage: vi.fn() };
const resendClientMock = { sendTransactionalEmail: vi.fn() };
const receiptPdfMock = { generateReceiptPdf: vi.fn() };
const attendanceServiceMock = { getAttendanceForBatch: vi.fn() };
const campaignsServiceMock = {
  listCampaigns: vi.fn(),
  getCampaignById: vi.fn(),
  previewCampaign: vi.fn(),
  queueCampaign: vi.fn(),
  sendCampaign: vi.fn(),
  getCampaignMembers: vi.fn(),
  createCampaign: vi.fn(),
};
const certificatesServiceMock = {
  listCertificates: vi.fn(),
  verifyCertificate: vi.fn(),
  revokeCertificate: vi.fn(),
  resendCertificateEmail: vi.fn(),
  getBatchIssueContext: vi.fn(),
};
const communicationsServiceMock = {
  getTemplatesForCourse: vi.fn(),
  saveTemplate: vi.fn(),
  getMessageLog: vi.fn(),
};
const coursesServiceMock = {
  getCourses: vi.fn(),
  createCourse: vi.fn(),
  getBatches: vi.fn(),
  createBatch: vi.fn(),
  updateBatch: vi.fn(),
  getActiveBatchesForPublicForm: vi.fn(),
  getBatchByIdSystem: vi.fn(),
  getSeatsRemaining: vi.fn(),
  offerNextWaitlistSeat: vi.fn(),
};
const dashboardServiceMock = { getDashboardSummary: vi.fn() };
const feedbackServiceMock = { getBatchFeedbackSummary: vi.fn() };
const leadsServiceMock = {
  listLeads: vi.fn(),
  listLeadsDueForFollowUp: vi.fn(),
  getLeadWithActivities: vi.fn(),
  getLeadById: vi.fn(),
  updateLead: vi.fn(),
  createLead: vi.fn(),
  sendSmsToLead: vi.fn(),
  sendEmailToLead: vi.fn(),
};
const liveSessionsServiceMock = { getLiveSessions: vi.fn(), updateLiveSession: vi.fn() };
const opportunitiesServiceMock = {
  listOpportunities: vi.fn(),
  getPipelineSummary: vi.fn(),
  createOpportunity: vi.fn(),
};
const paymentsServiceMock = { applyDiscount: vi.fn(), setUpInstallmentPlanForRegistration: vi.fn() };
const portalServiceMock = {
  getReceiptDataForStaff: vi.fn(),
  getStudentStatusForStaff: vi.fn(),
};
const registrationsServiceMock = { getRegistration360: vi.fn(), transferRegistration: vi.fn() };
const usersServiceMock = { getStaffUsers: vi.fn(), createStaffUser: vi.fn(), updateStaffUser: vi.fn() };
const voiceServiceMock = { lookupCustomerForAgent: vi.fn(), recordInboundCall: vi.fn() };
const waitlistServiceMock = { getWaitlistForBatch: vi.fn() };
const agentToolsRepositoryMock = { insertStaffActionAuditLog: vi.fn() };

vi.mock('@/lib/arkesel/client', () => arkeselMock);
vi.mock('@/lib/resend/client', () => resendClientMock);
vi.mock('@/lib/portal/receipt-pdf', () => receiptPdfMock);
vi.mock('@/modules/attendance/service', () => attendanceServiceMock);
vi.mock('@/modules/campaigns/service', () => campaignsServiceMock);
vi.mock('@/modules/certificates/service', () => certificatesServiceMock);
vi.mock('@/modules/communications/service', () => communicationsServiceMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/dashboard/service', () => dashboardServiceMock);
vi.mock('@/modules/feedback/service', () => feedbackServiceMock);
vi.mock('@/modules/leads/service', () => leadsServiceMock);
vi.mock('@/modules/live-sessions/service', () => liveSessionsServiceMock);
vi.mock('@/modules/opportunities/service', () => opportunitiesServiceMock);
vi.mock('@/modules/payments/service', () => paymentsServiceMock);
vi.mock('@/modules/portal/service', () => portalServiceMock);
vi.mock('@/modules/registrations/service', () => registrationsServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/voice/service', () => voiceServiceMock);
vi.mock('@/modules/waitlist/service', () => waitlistServiceMock);
vi.mock('@/modules/agent-tools/repository', () => agentToolsRepositoryMock);

const { getToolsForSurface, runTool, proposeTool, confirmAndExecuteTool } = await import(
  '@/modules/agent-tools/service'
);

const ADMIN_STAFF = {
  id: 'staff-admin-1',
  userId: 'auth-1',
  fullName: 'Ama Admin',
  email: 'admin@business.com',
  role: 'admin' as const,
  isActive: true,
  createdAt: '2026-06-01T00:00:00Z',
};

const MANAGEMENT_STAFF = { ...ADMIN_STAFF, id: 'staff-management-1', role: 'management' as const };
const FINANCE_STAFF = { ...ADMIN_STAFF, id: 'staff-finance-1', role: 'finance' as const };
const MARKETING_STAFF = { ...ADMIN_STAFF, id: 'staff-marketing-1', role: 'marketing' as const };

function registration360(overrides: Record<string, unknown> = {}) {
  return {
    canDelete: true,
    registration: { id: 'reg-1', registrationStatus: 'Registered', leadSource: 'Website', notes: null, registeredAt: '2026-06-01T00:00:00Z' },
    participant: { fullName: 'Kojo Participant', email: 'k@x.com', phone: '+233...', jobTitle: null, company: null, gender: null, deleted: false },
    course: { courseId: 'course-1', batchId: 'batch-1', courseName: 'AI For Business', courseCode: 'AI01', cohortLabel: 'AUG-2026', startDate: '2099-08-01', endDate: '2099-08-05', facilitatorName: 'Tutor' },
    payment: { paymentStatus: 'Unpaid', courseFee: 1200, amountPaid: 0, balance: 1200 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getToolsForSurface / trust enforcement', () => {
  it('excludes voice-only tools from the assistant surface and vice versa', () => {
    const assistantTools = getToolsForSurface('assistant', ADMIN_STAFF);
    const voiceTools = getToolsForSurface('voice', null);
    expect(assistantTools.some((t) => t.name === 'get_course_catalog')).toBe(false);
    expect(voiceTools.some((t) => t.name === 'list_courses')).toBe(false);
    expect(voiceTools.some((t) => t.name === 'get_course_catalog')).toBe(true);
  });

  it('excludes admin-only tools for a non-admin staff role', () => {
    const managementTools = getToolsForSurface('assistant', MANAGEMENT_STAFF);
    expect(managementTools.some((t) => t.name === 'create_staff_user')).toBe(false);
    expect(managementTools.some((t) => t.name === 'list_live_sessions')).toBe(true);
  });

  it('rejects a tool call for a role outside its trust list, even for a module whose service.ts has no internal gate (campaigns)', async () => {
    await expect(runTool('list_campaigns', {}, FINANCE_STAFF)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(campaignsServiceMock.listCampaigns).not.toHaveBeenCalled();
  });

  it('allows a system-trust (Vapi) tool with no staff user at all', async () => {
    coursesServiceMock.getActiveBatchesForPublicForm.mockResolvedValue([]);
    const result = await runTool('get_course_catalog', {}, null);
    expect(result).toBe('No batches are currently open for registration.');
  });
});

describe('runTool — read/write-direct execute immediately', () => {
  it('rejects calling a write-confirm tool through runTool', async () => {
    await expect(runTool('discount', { registrationId: 'reg-1', discountAmount: 50, reason: 'x' }, ADMIN_STAFF)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(paymentsServiceMock.applyDiscount).not.toHaveBeenCalled();
  });

  it('validates input against the tool schema before calling run', async () => {
    await expect(runTool('create_course', { courseCode: 'A' }, ADMIN_STAFF)).rejects.toThrow();
    expect(coursesServiceMock.createCourse).not.toHaveBeenCalled();
  });
});

describe('proposeTool — write-confirm tools are only ever previewed, never executed', () => {
  it('never calls run() for the discount tool', async () => {
    registrationsServiceMock.getRegistration360.mockResolvedValue(registration360());
    const proposal = await proposeTool(
      'discount',
      { registrationId: 'reg-1', discountAmount: 100, reason: 'Loyal repeat participant' },
      ADMIN_STAFF,
    );
    expect(paymentsServiceMock.applyDiscount).not.toHaveBeenCalled();
    expect(proposal.toolName).toBe('discount');
    expect(proposal.preview.currentCourseFee).toBe(1200);
  });

  it('rejects proposing a read tool', async () => {
    await expect(proposeTool('list_courses', {}, ADMIN_STAFF)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects a mandatory-reason validation failure for cancel/reschedule before any preview is built', async () => {
    await expect(
      proposeTool(
        'propose_cancel_or_reschedule_live_session',
        { liveSessionId: 'ls-1', status: 'cancelled', statusReason: 'hi' },
        ADMIN_STAFF,
      ),
    ).rejects.toThrow();
    expect(liveSessionsServiceMock.getLiveSessions).not.toHaveBeenCalled();
  });

  it('never calls createLead for propose_create_lead — only builds a preview', async () => {
    const proposal = await proposeTool(
      'propose_create_lead',
      { fullName: 'New Person', email: 'new@example.com', phone: '+233241234567', leadSource: 'Website' },
      ADMIN_STAFF,
    );
    expect(leadsServiceMock.createLead).not.toHaveBeenCalled();
    expect(proposal.toolName).toBe('propose_create_lead');
    expect(proposal.preview.fullName).toBe('New Person');
  });
});

describe('confirmAndExecuteTool — the sole path to a real write', () => {
  it('calls run then writes the audit row with the reason', async () => {
    paymentsServiceMock.applyDiscount.mockResolvedValue({ registrationId: 'reg-1', originalFee: 1200 });

    const result = await confirmAndExecuteTool(
      'discount',
      { registrationId: 'reg-1', discountAmount: 100, reason: 'Loyal repeat participant' },
      ADMIN_STAFF,
    );

    expect(paymentsServiceMock.applyDiscount).toHaveBeenCalledWith('reg-1', {
      discountAmount: 100,
      reason: 'Loyal repeat participant',
    });
    expect(agentToolsRepositoryMock.insertStaffActionAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_staff_id: 'staff-admin-1',
        action_type: 'discount',
        target_registration_id: 'reg-1',
        reason: 'Loyal repeat participant',
      }),
    );
    expect(result).toEqual({ registrationId: 'reg-1', originalFee: 1200 });
  });

  it('does not let an audit-log failure mask a successful write', async () => {
    paymentsServiceMock.applyDiscount.mockResolvedValue({ registrationId: 'reg-1' });
    agentToolsRepositoryMock.insertStaffActionAuditLog.mockRejectedValue(new Error('db down'));

    const result = await confirmAndExecuteTool(
      'discount',
      { registrationId: 'reg-1', discountAmount: 50, reason: 'Test discount reason' },
      ADMIN_STAFF,
    );

    expect(result).toEqual({ registrationId: 'reg-1' });
  });

  it('rejects a non-admin caller for an admin-only write-confirm tool', async () => {
    await expect(
      confirmAndExecuteTool(
        'propose_revoke_certificate',
        { certificateId: 'cert-1', reason: 'Issued in error' },
        MANAGEMENT_STAFF,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(certificatesServiceMock.revokeCertificate).not.toHaveBeenCalled();
  });

  it('queue-and-send campaign: queues if draft, then re-derives a fresh count rather than trusting a stale one', async () => {
    campaignsServiceMock.getCampaignById.mockResolvedValue({ id: 'camp-1', status: 'draft' });
    campaignsServiceMock.queueCampaign.mockResolvedValue(undefined);
    campaignsServiceMock.getCampaignMembers.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
    campaignsServiceMock.sendCampaign.mockResolvedValue({ campaign: {}, attempted: 3, sent: 3, failed: 0 });

    await confirmAndExecuteTool('propose_queue_and_send_campaign', { campaignId: 'camp-1' }, ADMIN_STAFF);

    expect(campaignsServiceMock.queueCampaign).toHaveBeenCalledWith('camp-1');
    expect(campaignsServiceMock.sendCampaign).toHaveBeenCalledWith('camp-1', {
      confirmedRecipientCount: 3,
      confirmationText: 'SEND 3',
    });
  });

  it('queue-and-send campaign: skips re-queueing an already-queued campaign', async () => {
    campaignsServiceMock.getCampaignById.mockResolvedValue({ id: 'camp-1', status: 'queued' });
    campaignsServiceMock.getCampaignMembers.mockResolvedValue([{ id: 'm1' }]);
    campaignsServiceMock.sendCampaign.mockResolvedValue({ campaign: {}, attempted: 1, sent: 1, failed: 0 });

    await confirmAndExecuteTool('propose_queue_and_send_campaign', { campaignId: 'camp-1' }, ADMIN_STAFF);

    expect(campaignsServiceMock.queueCampaign).not.toHaveBeenCalled();
    expect(campaignsServiceMock.sendCampaign).toHaveBeenCalledWith('camp-1', {
      confirmedRecipientCount: 1,
      confirmationText: 'SEND 1',
    });
  });

  it('cancel/reschedule live session passes the staff user id as actor', async () => {
    liveSessionsServiceMock.updateLiveSession.mockResolvedValue({ id: 'ls-1', status: 'cancelled' });

    await confirmAndExecuteTool(
      'propose_cancel_or_reschedule_live_session',
      { liveSessionId: 'ls-1', status: 'cancelled', statusReason: 'Facilitator unavailable' },
      ADMIN_STAFF,
    );

    expect(liveSessionsServiceMock.updateLiveSession).toHaveBeenCalledWith(
      'ls-1',
      { status: 'cancelled', statusReason: 'Facilitator unavailable' },
      'staff-admin-1',
    );
  });
});

describe('student-support tools (2026-07-27)', () => {
  it('getToolsForSurface exposes all 8 new tools to an admin on the assistant surface, none on voice', () => {
    const newToolNames = [
      'propose_send_sms_to_lead',
      'propose_send_email_to_lead',
      'propose_create_campaign',
      'propose_resend_receipt',
      'propose_resend_certificate',
      'propose_offer_waitlist_seat',
      'get_student_status',
      'get_certificate_candidates_for_batch',
    ];
    const assistantTools = getToolsForSurface('assistant', ADMIN_STAFF).map((t) => t.name);
    const voiceTools = getToolsForSurface('voice', null).map((t) => t.name);

    for (const name of newToolNames) {
      expect(assistantTools).toContain(name);
      expect(voiceTools).not.toContain(name);
    }
  });

  it('propose_send_sms_to_lead: builds a preview from the lead, never sends', async () => {
    leadsServiceMock.getLeadById.mockResolvedValue({
      id: 'lead-1',
      fullName: 'Ama Owusu',
      phone: '+233241234567',
    });

    const proposal = await proposeTool(
      'propose_send_sms_to_lead',
      { leadId: 'lead-1', message: 'Hi Ama' },
      ADMIN_STAFF,
    );

    expect(leadsServiceMock.sendSmsToLead).not.toHaveBeenCalled();
    expect(proposal.preview).toMatchObject({ fullName: 'Ama Owusu', phone: '+233241234567' });
  });

  it('propose_send_sms_to_lead: rejects a role outside its trust list (finance)', async () => {
    await expect(
      proposeTool('propose_send_sms_to_lead', { leadId: 'lead-1', message: 'Hi' }, FINANCE_STAFF),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(leadsServiceMock.getLeadById).not.toHaveBeenCalled();
  });

  it('propose_send_sms_to_lead: confirming actually sends via leadsService', async () => {
    leadsServiceMock.getLeadById.mockResolvedValue({ id: 'lead-1', fullName: 'Ama', phone: '+233' });
    leadsServiceMock.sendSmsToLead.mockResolvedValue(undefined);

    const result = await confirmAndExecuteTool(
      'propose_send_sms_to_lead',
      { leadId: 'lead-1', message: 'Hi Ama' },
      MARKETING_STAFF,
    );

    expect(leadsServiceMock.sendSmsToLead).toHaveBeenCalledWith('lead-1', 'Hi Ama');
    expect(result).toEqual({ leadId: 'lead-1', channel: 'sms', sent: true });
  });

  it('propose_send_email_to_lead: confirming sends via leadsService', async () => {
    leadsServiceMock.getLeadById.mockResolvedValue({ id: 'lead-1', fullName: 'Ama', email: 'a@x.com' });
    leadsServiceMock.sendEmailToLead.mockResolvedValue(undefined);

    const result = await confirmAndExecuteTool(
      'propose_send_email_to_lead',
      { leadId: 'lead-1', subject: 'Hi', body: 'Body' },
      ADMIN_STAFF,
    );

    expect(leadsServiceMock.sendEmailToLead).toHaveBeenCalledWith('lead-1', 'Hi', 'Body');
    expect(result).toEqual({ leadId: 'lead-1', channel: 'email', sent: true });
  });

  it('propose_create_campaign: never calls createCampaign while only proposing, counts matched leads client-side', async () => {
    leadsServiceMock.listLeads.mockResolvedValue([
      { leadSource: 'Facebook', status: 'New', score: 50 },
      { leadSource: 'Facebook', status: 'New', score: 10 },
      { leadSource: 'Website', status: 'New', score: 90 },
    ]);

    const proposal = await proposeTool(
      'propose_create_campaign',
      {
        name: 'Facebook re-engagement',
        channel: 'sms',
        messageBody: 'Hello',
        filterLeadSource: 'Facebook',
        filterMinScore: 20,
      },
      MARKETING_STAFF,
    );

    expect(campaignsServiceMock.createCampaign).not.toHaveBeenCalled();
    expect(proposal.preview).toMatchObject({ matchedLeadCount: 1 });
  });

  it('propose_create_campaign: rejects a role outside its trust list (finance)', async () => {
    await expect(
      proposeTool(
        'propose_create_campaign',
        { name: 'Test', channel: 'sms', messageBody: 'Hi' },
        FINANCE_STAFF,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('propose_create_campaign: confirming creates a draft only, via campaignsService.createCampaign', async () => {
    leadsServiceMock.listLeads.mockResolvedValue([]);
    campaignsServiceMock.createCampaign.mockResolvedValue({ id: 'camp-1', status: 'draft' });

    const result = await confirmAndExecuteTool(
      'propose_create_campaign',
      { name: 'Test', channel: 'sms', messageBody: 'Hi' },
      ADMIN_STAFF,
    );

    expect(campaignsServiceMock.createCampaign).toHaveBeenCalledWith(
      { name: 'Test', channel: 'sms', messageBody: 'Hi', audienceType: 'leads' },
      'staff-admin-1',
    );
    expect(result).toEqual({ id: 'camp-1', status: 'draft' });
  });

  it('propose_resend_receipt: preview reads via getReceiptDataForStaff, run emails a PDF attachment', async () => {
    portalServiceMock.getReceiptDataForStaff.mockResolvedValue({
      participantName: 'Ama Owusu',
      participantEmail: 'ama@example.com',
      courseName: 'ICAG Level 1 Prep',
      balance: 0,
    });
    receiptPdfMock.generateReceiptPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    resendClientMock.sendTransactionalEmail.mockResolvedValue(undefined);

    const proposal = await proposeTool(
      'propose_resend_receipt',
      { registrationId: 'reg-1' },
      FINANCE_STAFF,
    );
    expect(proposal.preview).toMatchObject({ participantName: 'Ama Owusu', courseName: 'ICAG Level 1 Prep' });

    const result = await confirmAndExecuteTool(
      'propose_resend_receipt',
      { registrationId: 'reg-1' },
      FINANCE_STAFF,
    );
    expect(resendClientMock.sendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ama@example.com',
        attachments: [expect.objectContaining({ contentType: 'application/pdf' })],
      }),
    );
    expect(result).toEqual({ registrationId: 'reg-1', sent: true });
  });

  it('propose_resend_certificate: admin-only — rejects management', async () => {
    await expect(
      proposeTool('propose_resend_certificate', { certificateId: 'cert-1' }, MANAGEMENT_STAFF),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('propose_resend_certificate: confirming calls resendCertificateEmail', async () => {
    certificatesServiceMock.listCertificates.mockResolvedValue([
      {
        id: 'cert-1',
        certificateNumber: 'KNS-AI01-2026-0001',
        recipientName: 'Ama Owusu',
        recipientEmail: 'ama@example.com',
        courseTitle: 'AI For Business',
      },
    ]);
    certificatesServiceMock.resendCertificateEmail.mockResolvedValue(true);

    const result = await confirmAndExecuteTool(
      'propose_resend_certificate',
      { certificateId: 'cert-1' },
      ADMIN_STAFF,
    );

    expect(certificatesServiceMock.resendCertificateEmail).toHaveBeenCalledWith('cert-1');
    expect(result).toEqual({ certificateId: 'cert-1', sent: true });
  });

  it('propose_offer_waitlist_seat: preview reads batch/waitlist/seats without offering', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue({ id: 'batch-1', cohortLabel: 'AUG-2026' });
    waitlistServiceMock.getWaitlistForBatch.mockResolvedValue([
      { status: 'Waiting', fullName: 'Kojo', email: 'kojo@example.com' },
    ]);
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(2);

    const proposal = await proposeTool(
      'propose_offer_waitlist_seat',
      { batchId: 'batch-1' },
      MARKETING_STAFF,
    );

    expect(coursesServiceMock.offerNextWaitlistSeat).not.toHaveBeenCalled();
    expect(proposal.preview).toMatchObject({
      cohortLabel: 'AUG-2026',
      seatsRemaining: 2,
      nextPerson: { fullName: 'Kojo', email: 'kojo@example.com' },
    });
  });

  it('propose_offer_waitlist_seat: confirming calls coursesService.offerNextWaitlistSeat', async () => {
    coursesServiceMock.offerNextWaitlistSeat.mockResolvedValue({ offered: true, participantName: 'Kojo' });

    const result = await confirmAndExecuteTool(
      'propose_offer_waitlist_seat',
      { batchId: 'batch-1' },
      ADMIN_STAFF,
    );

    expect(coursesServiceMock.offerNextWaitlistSeat).toHaveBeenCalledWith('batch-1');
    expect(result).toEqual({ offered: true, participantName: 'Kojo' });
  });

  it('get_student_status: read tool, reachable by finance, delegates to portalService', async () => {
    portalServiceMock.getStudentStatusForStaff.mockResolvedValue({
      fullName: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      registrations: [],
    });

    const result = await runTool('get_student_status', { identifier: 'ama@example.com' }, FINANCE_STAFF);

    expect(portalServiceMock.getStudentStatusForStaff).toHaveBeenCalledWith('ama@example.com');
    expect(result).toMatchObject({ fullName: 'Ama Owusu' });
  });

  it('get_certificate_candidates_for_batch: admin-only — rejects finance', async () => {
    await expect(
      runTool('get_certificate_candidates_for_batch', { batchId: 'batch-1' }, FINANCE_STAFF),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(certificatesServiceMock.getBatchIssueContext).not.toHaveBeenCalled();
  });

  it('get_certificate_candidates_for_batch: delegates to certificatesService for an admin', async () => {
    certificatesServiceMock.getBatchIssueContext.mockResolvedValue({ courseCode: 'AI01', candidates: [] });

    const result = await runTool('get_certificate_candidates_for_batch', { batchId: 'batch-1' }, ADMIN_STAFF);

    expect(certificatesServiceMock.getBatchIssueContext).toHaveBeenCalledWith('batch-1');
    expect(result).toMatchObject({ courseCode: 'AI01' });
  });
});
