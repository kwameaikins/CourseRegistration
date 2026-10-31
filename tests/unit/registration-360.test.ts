import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectRegistration360: vi.fn(),
  callSoftDeleteParticipant: vi.fn(),
  selectRegistrationIdsForParticipant: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};

vi.mock('@/modules/registrations/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/courses/service', () => ({}));
vi.mock('@/modules/communications/service', () => ({}));

const { getRegistration360, softDeleteParticipant } = await import('@/modules/registrations/service');

function fullFixture() {
  return {
    registration: {
      id: 'reg-1',
      participant_id: 'part-1',
      batch_id: 'batch-1',
      registration_status: 'Confirmed',
      lead_source: 'WhatsApp',
      notes: 'Called once, interested.',
      registered_at: '2026-07-01T09:00:00Z',
    },
    participant: {
      full_name: 'Ama Owusu',
      email: 'ama@example.com',
      phone: '+233241234567',
      job_title: 'Analyst',
      company: 'Acme Ltd',
      gender: 'Female',
      deleted_at: null,
    },
    payment: {
      payment_status: 'Paid',
      course_fee: '1200.00',
      amount_paid: '1200.00',
      balance: '0.00',
      payment_method: 'MTN MoMo',
      transaction_id: 'REG-reg-1-123',
      payment_notes: 'Confirmed via webhook',
      payment_date: '2026-07-02T10:00:00Z',
      original_fee: null as string | null,
      discount_amount: '0.00',
      discount_reason: null as string | null,
      discount_granted_at: null as string | null,
    },
    batch: {
      cohort_label: 'JUL-2026',
      start_date: '2026-08-01',
      end_date: '2026-08-05',
      facilitator_name: 'Mr. Asante',
      course_id: 'course-1',
    },
    course: { course_name: 'ICAG Level 1 Prep', course_code: 'ICAG-L1' },
    verifiedByName: 'Finance Officer',
    discountGrantedByName: null as string | null,
    emailLog: [
      { email_type: 'welcome', sent_at: '2026-07-01T09:05:00Z', success: true, error_message: null },
    ],
    whatsappLog: [
      { message_type: 'welcome', sent_at: '2026-07-01T09:06:00Z', success: true, error_message: null },
    ],
    smsLog: [],
    zoomRegistrant: { join_url: 'https://zoom.us/j/personal-link', created_at: '2026-07-02T10:05:00Z' },
    attendance: [
      { session_date: '2026-08-01', join_time: '2026-08-01T09:00:00Z', leave_time: '2026-08-01T12:00:00Z', duration_minutes: 180 },
    ],
    feedback: {
      overall_rating: 5,
      relevance_rating: 4,
      facilitator_rating: 4,
      confidence_rating: 5,
      materials_clarity: 'Yes',
      most_valuable_text: 'The live case study walkthrough.',
      improvement_text: 'More exercises.',
      recommendation: 'Yes',
      other_course_suggestion: null,
      testimonial_choice: 'Named',
      submitted_at: '2026-08-06T08:00:00Z',
    },
    certificates: [
      { id: 'cert-1', certificate_number: 'KNS-ICAG-L1-2026-0001', issued_date: '2026-08-06', revoked: false },
    ],
    calls: [
      {
        id: 'call-1',
        call_type: 'payment_followup',
        status: 'completed',
        summary: 'Confirmed payment plan.',
        needs_human_followup: false,
        created_at: '2026-07-03T10:00:00Z',
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getRegistration360 — not found', () => {
  it('throws NOT_FOUND when the repository returns null', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistration360.mockResolvedValue(null);
    await expect(getRegistration360('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('getRegistration360 — role shaping', () => {
  it('admin sees payment audit fields, every engagement section, and canDelete', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());

    const view = await getRegistration360('reg-1');

    expect(view.canDelete).toBe(true);
    expect(view.payment?.paymentMethod).toBe('MTN MoMo');
    expect(view.payment?.verifiedBy).toBe('Finance Officer');
    expect(view.messages?.email).toHaveLength(1);
    expect(view.messages?.whatsapp).toHaveLength(1);
    expect(view.zoom).toEqual({ joinUrl: 'https://zoom.us/j/personal-link', registeredAt: '2026-07-02T10:05:00Z' });
    expect(view.attendance).toHaveLength(1);
    expect(view.feedback?.overallRating).toBe(5);
    expect(view.feedback?.recommendation).toBe('Yes');
    expect(view.feedback?.testimonialChoice).toBe('Named');
    expect(view.certificates).toHaveLength(1);
    expect(view.calls).toHaveLength(1);
  });

  it('finance sees payment audit fields and calls, but no messages/attendance/feedback/certificates, and cannot delete', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-2', role: 'finance' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());

    const view = await getRegistration360('reg-1');

    expect(view.canDelete).toBe(false);
    expect(view.payment?.paymentMethod).toBe('MTN MoMo');
    expect(view.payment?.verifiedBy).toBe('Finance Officer');
    expect(view.calls).toHaveLength(1);
    expect(view.messages).toBeUndefined();
    expect(view.attendance).toBeUndefined();
    expect(view.feedback).toBeUndefined();
    expect(view.certificates).toBeUndefined();
  });

  it('marketing sees payment status only (no audit fields) and no engagement sections', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-3', role: 'marketing' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());

    const view = await getRegistration360('reg-1');

    expect(view.payment?.paymentStatus).toBe('Paid');
    expect(view.payment?.paymentMethod).toBeUndefined();
    expect(view.payment?.transactionId).toBeUndefined();
    expect(view.payment?.paymentNotes).toBeUndefined();
    expect(view.payment?.verifiedBy).toBeUndefined();
    expect(view.messages).toBeUndefined();
    expect(view.calls).toBeUndefined();
  });

  it('admin/finance see discount audit fields; marketing does not', async () => {
    const fixture = fullFixture();
    fixture.payment.original_fee = '1500.00';
    fixture.payment.discount_amount = '300.00';
    fixture.payment.discount_reason = 'Corporate sponsorship partial waiver';
    fixture.payment.discount_granted_at = '2026-07-05T10:00:00Z';
    fixture.discountGrantedByName = 'Ama Admin';

    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistration360.mockResolvedValue(fixture);
    const adminView = await getRegistration360('reg-1');
    expect(adminView.payment?.originalFee).toBe(1500);
    expect(adminView.payment?.discountAmount).toBe(300);
    expect(adminView.payment?.discountReason).toBe('Corporate sponsorship partial waiver');
    expect(adminView.payment?.discountGrantedByName).toBe('Ama Admin');

    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-3', role: 'marketing' });
    repositoryMock.selectRegistration360.mockResolvedValue(fixture);
    const marketingView = await getRegistration360('reg-1');
    expect(marketingView.payment?.originalFee).toBeUndefined();
    expect(marketingView.payment?.discountAmount).toBeUndefined();
    expect(marketingView.payment?.discountReason).toBeUndefined();
    expect(marketingView.payment?.discountGrantedByName).toBeUndefined();
  });

  it('marks a soft-deleted participant so the UI can hide their PII', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    const fixture = fullFixture();
    fixture.participant.deleted_at = '2026-08-10T00:00:00Z' as unknown as null;
    repositoryMock.selectRegistration360.mockResolvedValue(fixture);

    const view = await getRegistration360('reg-1');
    expect(view.participant?.deleted).toBe(true);
  });
});

// R3 final review: with the LMS as the registry, the staff detail reads its
// certificates (F2) and a DPA erasure reaches it (F3).
describe('CERTIFICATE_ISSUER=lms', () => {
  const fetchMock = vi.fn();
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.env.KNOWSIA_LMS_API_URL = 'https://lms.test';
    process.env.KNOWSIA_APP_SERVICE_KEY = 'k';
    process.env.CERTIFICATE_ISSUER = 'lms';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CERTIFICATE_ISSUER;
  });

  it('the admin detail lists the LMS certificates for the registration', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());
    fetchMock.mockResolvedValue(ok({ items: [{
      id: 'lms-1', certificateNumber: 'KNS-CA01-2026-0021', issuedDate: '2026-10-31', revoked: true, registrationId: 'reg-1',
    }] }));
    const view = await getRegistration360('reg-1');
    expect(view.certificates).toEqual([
      { id: 'lms-1', certificateNumber: 'KNS-CA01-2026-0021', issuedDate: '2026-10-31', revoked: true },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('registrationRefs=reg-1');
  });

  it('finance never triggers the LMS read (it does not see certificates)', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-2', role: 'finance' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());
    const view = await getRegistration360('reg-1');
    expect(view.certificates).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a DPA erasure also erases the certificates on the LMS', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistrationIdsForParticipant.mockResolvedValue(['reg-1', 'reg-2']);
    repositoryMock.callSoftDeleteParticipant.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(ok({ erased: 2 }));
    await softDeleteParticipant('part-1');
    expect(repositoryMock.callSoftDeleteParticipant).toHaveBeenCalledWith('part-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://lms.test/api/v1/service/lms/certificates/erase');
    expect(JSON.parse(init.body)).toEqual({ registrationRefs: ['reg-1', 'reg-2'] });
  });

  it('an LMS failure fails the erasure loudly', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistrationIdsForParticipant.mockResolvedValue(['reg-1']);
    repositoryMock.callSoftDeleteParticipant.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(softDeleteParticipant('part-1')).rejects.toMatchObject({ code: 'LMS_UNAVAILABLE' });
  });

  it('local mode erases in Supabase only', async () => {
    delete process.env.CERTIFICATE_ISSUER;
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.callSoftDeleteParticipant.mockResolvedValue(undefined);
    await softDeleteParticipant('part-1');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
