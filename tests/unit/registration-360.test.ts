import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = {
  selectRegistration360: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};

vi.mock('@/modules/registrations/repository', () => repositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/courses/service', () => ({}));
vi.mock('@/modules/communications/service', () => ({}));

const { getRegistration360 } = await import('@/modules/registrations/service');

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
      facilitator_rating: 4,
      recommend_rating: 5,
      improvement_text: 'More exercises.',
      testimonial_consent: true,
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
  it('admin sees payment audit fields and every engagement section', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-1', role: 'admin' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());

    const view = await getRegistration360('reg-1');

    expect(view.payment?.paymentMethod).toBe('MTN MoMo');
    expect(view.payment?.verifiedBy).toBe('Finance Officer');
    expect(view.messages?.email).toHaveLength(1);
    expect(view.messages?.whatsapp).toHaveLength(1);
    expect(view.zoom).toEqual({ joinUrl: 'https://zoom.us/j/personal-link', registeredAt: '2026-07-02T10:05:00Z' });
    expect(view.attendance).toHaveLength(1);
    expect(view.feedback?.overallRating).toBe(5);
    expect(view.certificates).toHaveLength(1);
    expect(view.calls).toHaveLength(1);
  });

  it('finance sees payment audit fields and calls, but no messages/attendance/feedback/certificates', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-2', role: 'finance' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());

    const view = await getRegistration360('reg-1');

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

  it('tutor sees no payment section and no engagement sections', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 'staff-4', role: 'tutor' });
    repositoryMock.selectRegistration360.mockResolvedValue(fullFixture());

    const view = await getRegistration360('reg-1');

    expect(view.payment).toBeNull();
    expect(view.messages).toBeUndefined();
    expect(view.calls).toBeUndefined();
  });

  it('admin/finance see discount audit fields; marketing/tutor do not', async () => {
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
