import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';

const registrationsRepositoryMock = {
  findOrCreateParticipant: vi.fn(),
  selectParticipantProfileSystem: vi.fn(),
  insertRegistration: vi.fn(),
  insertInitialPayment: vi.fn(),
  updateRegistrationNotes: vi.fn(),
  updateRegistrationBatch: vi.fn(),
  selectRegistration360: vi.fn(),
  selectRegistrationList: vi.fn(),
  selectAllRegistrationsForExport: vi.fn(),
  callDeleteRegistrationImmediately: vi.fn(),
  callDeleteParticipantImmediately: vi.fn(),
  updateRegistrationLapsedSystem: vi.fn(),
  updateRegistrationReinstatedSystem: vi.fn(),
  selectAutoLapseCandidatesSystem: vi.fn(),
};
const coursesServiceMock = {
  getBatchByIdSystem: vi.fn(),
  getCourseByIdSystem: vi.fn(),
  getSeatsRemaining: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
  getCurrentStaffUser: vi.fn(),
};
const paymentsServiceMock = {
  applyPaymentUpdate: vi.fn(),
  runZeroFeeEnrollmentSideEffects: vi.fn(),
};
const leadsServiceMock = {
  createLead: vi.fn(),
  wasExistingLeadBeforeRegistration: vi.fn(),
};
const opportunitiesServiceMock = {
  createOpportunity: vi.fn(),
};
const attendanceServiceMock = {
  reregisterForZoomAfterTransfer: vi.fn(),
};
const waitlistServiceMock = {
  joinWaitlist: vi.fn(),
  notifyNextIfSeatAvailable: vi.fn(),
};
const partnersServiceMock = {
  previewCode: vi.fn(),
  redeemCodeSystem: vi.fn(),
};
const couponsServiceMock = {
  previewCoupon: vi.fn(),
  computeCouponFee: vi.fn(),
  recordCouponRedemptionSystem: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();
const sendSmsOnceMock = vi.fn();
const sendTransactionalEmailMock = vi.fn();
const sendSmsMessageMock = vi.fn();
const insertStaffActionAuditLogMock = vi.fn();

vi.mock('@/modules/registrations/repository', () => registrationsRepositoryMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/payments/service', () => paymentsServiceMock);
vi.mock('@/modules/leads/service', () => leadsServiceMock);
vi.mock('@/modules/opportunities/service', () => opportunitiesServiceMock);
vi.mock('@/modules/attendance/service', () => attendanceServiceMock);
vi.mock('@/modules/waitlist/service', () => waitlistServiceMock);
vi.mock('@/modules/partners/service', () => partnersServiceMock);
vi.mock('@/modules/coupons/service', () => couponsServiceMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
  sendWhatsappOnce: (...args: unknown[]) => sendWhatsappOnceMock(...args),
  sendSmsOnce: (...args: unknown[]) => sendSmsOnceMock(...args),
}));
vi.mock('@/lib/resend/client', () => ({
  sendTransactionalEmail: (...args: unknown[]) => sendTransactionalEmailMock(...args),
}));
vi.mock('@/lib/arkesel/client', () => ({
  sendSmsMessage: (...args: unknown[]) => sendSmsMessageMock(...args),
}));
// Best-effort timeline entry for a write-off — mocked so the tests never reach
// a Supabase client. The authoritative record is the lapsed_* columns.
vi.mock('@/modules/agent-tools/repository', () => ({
  insertStaffActionAuditLog: (...args: unknown[]) => insertStaffActionAuditLogMock(...args),
}));

const {
  createRegistration,
  enrolExistingParticipant,
  bulkImportRegistrations,
  createCorporateEmployeeRegistration,
  deleteRegistration,
  deleteParticipantImmediately,
  transferRegistration,
  exportRegistrationsCsv,
  listRegistrations,
  getRegistrationContact,
  sendSmsToRegistration,
  sendEmailToRegistration,
  lapseRegistration,
  reinstateRegistration,
  shouldAutoLapse,
  runAutoLapseSweep,
} = await import('@/modules/registrations/service');
const { registrationInputSchema, publicRegistrationInputSchema } = await import(
  '@/modules/registrations/types'
);

const FUTURE_DATE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

function validInput() {
  return {
    firstName: 'Ama',
    middleName: null,
    surname: 'Owusu',
    gender: 'Female' as const,
    email: 'ama.owusu@example.com',
    phone: '+233241234567',
    jobTitle: 'N/A',
    company: 'N/A',
    batchId: '4c9f6ae2-0000-4000-8000-000000000001',
    leadSource: 'WhatsApp' as const,
    consentGiven: true,
    couponCode: null,
  };
}

function activeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: '4c9f6ae2-0000-4000-8000-000000000001',
    courseId: 'course-1',
    cohortLabel: 'JUL-2026',
    courseFee: 1200,
    isFree: false,
    startDate: FUTURE_DATE,
    startTime: '09:00',
    endDate: FUTURE_DATE,
    zoomLink: null,
    whatsappGroupLink: null,
    facilitatorName: 'Mr. Asante',
    facilitatorStaffId: null,
    welcomeEmailEnabled: true,
    paymentReminderEnabled: true,
    classReminderEnabled: true,
    isActive: true,
    discountCutoffDate: null,
    discountedFee: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  coursesServiceMock.getBatchByIdSystem.mockResolvedValue(activeBatch());
  coursesServiceMock.getCourseByIdSystem.mockResolvedValue({
    id: 'course-1',
    courseCode: 'AI05',
    courseName: 'AI-Powered Financial Reporting and Modeling',
    createdAt: '2026-07-01T00:00:00Z',
  });
  // Unlimited capacity by default — waitlist-branch tests override this.
  coursesServiceMock.getSeatsRemaining.mockResolvedValue(null);
  waitlistServiceMock.joinWaitlist.mockResolvedValue({ waitlistId: 'waitlist-1' });
  waitlistServiceMock.notifyNextIfSeatAvailable.mockResolvedValue(undefined);
  registrationsRepositoryMock.findOrCreateParticipant.mockResolvedValue({
    id: 'participant-1',
    email: 'ama.owusu@example.com',
  });
  registrationsRepositoryMock.insertRegistration.mockResolvedValue({
    id: 'reg-1',
    registration_status: 'Registered',
    batch_id: '4c9f6ae2-0000-4000-8000-000000000001',
  });
  registrationsRepositoryMock.insertInitialPayment.mockResolvedValue({
    id: 'pay-1',
    payment_status: 'Unpaid',
  });
  registrationsRepositoryMock.updateRegistrationNotes.mockResolvedValue(undefined);
  registrationsRepositoryMock.updateRegistrationBatch.mockResolvedValue(undefined);
  attendanceServiceMock.reregisterForZoomAfterTransfer.mockResolvedValue('registered');
  sendTransactionalEmailMock.mockResolvedValue(undefined);
  usersServiceMock.requireRole.mockResolvedValue({
    id: 'staff-1',
    fullName: 'Jane Doe',
    role: 'marketing',
  });
  paymentsServiceMock.applyPaymentUpdate.mockResolvedValue({
    registrationId: 'reg-1',
    amountPaid: 1200,
    balance: 0,
    paymentStatus: 'Paid',
    registrationStatus: 'Confirmed',
    verifiedBy: 'Jane Doe (marketing)',
  });
  paymentsServiceMock.runZeroFeeEnrollmentSideEffects.mockResolvedValue(undefined);
  leadsServiceMock.createLead.mockResolvedValue({ id: 'lead-1' });
  leadsServiceMock.wasExistingLeadBeforeRegistration.mockResolvedValue(false);
  partnersServiceMock.previewCode.mockResolvedValue({
    valid: false,
    discountType: null,
    discountValue: null,
    partnerId: null,
  });
  partnersServiceMock.redeemCodeSystem.mockResolvedValue(undefined);
  couponsServiceMock.previewCoupon.mockResolvedValue({
    valid: false,
    couponId: null,
    code: null,
    discountType: null,
    discountValue: null,
  });
  couponsServiceMock.recordCouponRedemptionSystem.mockResolvedValue(undefined);
  opportunitiesServiceMock.createOpportunity.mockResolvedValue({ id: 'opp-1' });
  sendEmailOnceMock.mockResolvedValue('sent');
  sendWhatsappOnceMock.mockResolvedValue('sent');
  sendSmsOnceMock.mockResolvedValue('sent');
});

// One-click enrolment for a Participant who already has an account
// (BR-42/BR-43, 2026-08-12). These run through the REAL createRegistration —
// only the repository and sibling modules are mocked — so they also prove the
// delegation actually reaches the insert rather than just being called.
describe('enrolExistingParticipant', () => {
  const storedProfile = (overrides: Record<string, unknown> = {}) => ({
    id: 'participant-1',
    first_name: 'Ama',
    middle_name: null,
    surname: 'Owusu',
    full_name: 'Ama Owusu',
    gender: 'Female',
    email: 'ama.owusu@example.com',
    phone: '+233241234567',
    job_title: 'Accountant',
    company: 'Knowsia',
    consent_given: true,
    deleted_at: null,
    ...overrides,
  });

  const batchId = '4c9f6ae2-0000-4000-8000-000000000001';

  beforeEach(() => {
    registrationsRepositoryMock.selectParticipantProfileSystem.mockResolvedValue(storedProfile());
  });

  // The point of the feature: nothing already on the record is asked for again.
  it('registers from the stored record alone', async () => {
    const result = await enrolExistingParticipant('participant-1', {
      batchId,
      couponCode: null,
    });

    expect(result).toMatchObject({ outcome: 'registered' });
    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: 'Ama',
        surname: 'Owusu',
        gender: 'Female',
        email: 'ama.owusu@example.com',
        job_title: 'Accountant',
        company: 'Knowsia',
      }),
    );
  });

  // BR-43 — the value that makes repeat enrolments countable.
  it('records lead_source Returning', async () => {
    await enrolExistingParticipant('participant-1', { batchId, couponCode: null });
    expect(registrationsRepositoryMock.insertRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ lead_source: 'Returning', consent_given: true }),
    );
  });

  // BR-15 satisfied from participants.consent_given rather than a fresh
  // checkbox (founder decision 2026-08-12) — no consent field is sent at all.
  it('reuses the consent already on file', async () => {
    await enrolExistingParticipant('participant-1', { batchId, couponCode: null });
    expect(registrationsRepositoryMock.insertRegistration).toHaveBeenCalled();
  });

  // Reusing is not assuming: a record with no consent is refused outright.
  it('refuses a participant with no consent on file', async () => {
    registrationsRepositoryMock.selectParticipantProfileSystem.mockResolvedValue(
      storedProfile({ consent_given: false }),
    );
    await expect(
      enrolExistingParticipant('participant-1', { batchId, couponCode: null }),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(registrationsRepositoryMock.insertRegistration).not.toHaveBeenCalled();
  });

  it('treats a soft-deleted participant as a dead session', async () => {
    registrationsRepositoryMock.selectParticipantProfileSystem.mockResolvedValue(
      storedProfile({ deleted_at: '2026-02-01T00:00:00.000Z' }),
    );
    await expect(
      enrolExistingParticipant('participant-1', { batchId, couponCode: null }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  // Legacy imports predate some columns — ask for the gap, not the whole form.
  it('names only the fields the record is actually missing', async () => {
    registrationsRepositoryMock.selectParticipantProfileSystem.mockResolvedValue(
      storedProfile({ gender: null, job_title: null }),
    );
    await expect(
      enrolExistingParticipant('participant-1', { batchId, couponCode: null }),
    ).rejects.toMatchObject({
      code: 'MISSING_PROFILE_FIELDS',
      message: expect.stringContaining('gender, job title'),
    });
    expect(registrationsRepositoryMock.insertRegistration).not.toHaveBeenCalled();
  });

  it('accepts a top-up for a missing field and enrols', async () => {
    registrationsRepositoryMock.selectParticipantProfileSystem.mockResolvedValue(
      storedProfile({ gender: null }),
    );
    await enrolExistingParticipant('participant-1', {
      batchId,
      couponCode: null,
      gender: 'Male',
    });
    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ gender: 'Male' }),
    );
  });

  // A supplied value must never overwrite a stored one — this enrols, it does
  // not edit a profile (the portal's Account panel does that, and it carries
  // its own certificate-renaming side effects).
  it('ignores a supplied field when the record already has one', async () => {
    await enrolExistingParticipant('participant-1', {
      batchId,
      couponCode: null,
      company: 'Somewhere Else',
    });
    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'Knowsia' }),
    );
  });

  // BR-19 still applies — an authenticated caller gets no extra rights.
  it('still refuses a batch that has ended', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ startDate: '2020-01-01', endDate: '2020-01-05' }),
    );
    await expect(
      enrolExistingParticipant('participant-1', { batchId, couponCode: null }),
    ).rejects.toMatchObject({ code: 'INVALID_BATCH' });
  });

  // A full batch takes createRegistration's existing waitlist branch, which
  // forwards the same lead_source — the reason waitlist_entries' CHECK had to
  // gain 'Returning' alongside registrations'.
  it('falls through to the waitlist on a full batch, still as Returning', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(0);
    const result = await enrolExistingParticipant('participant-1', {
      batchId,
      couponCode: null,
    });
    expect(result).toMatchObject({ outcome: 'waitlisted' });
    expect(waitlistServiceMock.joinWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ leadSource: 'Returning' }),
    );
  });
});

describe('BR-15 — mandatory DPA consent (T-BR15-01 logic)', () => {
  it('rejects consentGiven: false with CONSENT_REQUIRED and creates nothing', async () => {
    await expect(
      createRegistration({ ...validInput(), consentGiven: false }),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', httpStatus: 400 });
    expect(registrationsRepositoryMock.insertRegistration).not.toHaveBeenCalled();
  });
});

describe('BR-01/BR-19 — batch must be Active and not yet ended', () => {
  it('rejects an inactive batch', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(activeBatch({ isActive: false }));
    await expect(createRegistration(validInput())).rejects.toMatchObject({
      code: 'INVALID_BATCH',
    });
  });

  it('rejects a batch that has already ended (T-BR19-01 logic)', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ startDate: '2020-01-01', endDate: '2020-01-05' }),
    );
    await expect(createRegistration(validInput())).rejects.toMatchObject({
      code: 'INVALID_BATCH',
    });
  });

  // Late registration, founder-approved 2026-08-12. This is the exact case that
  // turned a real registrant away on 2026-08-11: the class had begun, so the
  // intake vanished from the form AND the server refused the batch id. A course
  // still running is still joinable; only end_date closes it.
  it('ACCEPTS a batch that has started but not yet ended', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ startDate: '2020-01-01', endDate: FUTURE_DATE }),
    );
    await expect(createRegistration(validInput())).resolves.toMatchObject({
      outcome: 'registered',
    });
  });

  // The boundary the old rule got wrong twice over: a one-day course, today.
  // start_date < today was false only until midnight, so a same-day cohort was
  // open in the morning and gone by the afternoon of its own final session.
  it('ACCEPTS a batch ending today', async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ startDate: '2020-01-01', endDate: todayIso }),
    );
    await expect(createRegistration(validInput())).resolves.toMatchObject({
      outcome: 'registered',
    });
  });

  it('rejects an unknown batch', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(null);
    await expect(createRegistration(validInput())).rejects.toMatchObject({
      code: 'INVALID_BATCH',
    });
  });
});

describe('BR-03 — duplicate registration (T-BR03-01 logic)', () => {
  it('maps the unique-constraint violation to DUPLICATE_REGISTRATION 409 with the exact PRD message', async () => {
    registrationsRepositoryMock.insertRegistration.mockRejectedValue({ code: '23505' });

    await expect(createRegistration(validInput())).rejects.toMatchObject({
      code: 'DUPLICATE_REGISTRATION',
      httpStatus: 409,
      message:
        'You are already registered for this course intake. If you need help, please contact us.',
    });
  });
});

// Free events / webinars (founder request 2026-08-03). The payment row is
// still written (course_fee 0) — the DB triggers settle it to Paid and
// confirm the registration on INSERT — but nothing about money is ever shown
// or sent to the registrant.
describe('free events — zero-fee registration (2026-08-03)', () => {
  beforeEach(() => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ isFree: true, courseFee: 0 }),
    );
    registrationsRepositoryMock.insertInitialPayment.mockResolvedValue({
      id: 'pay-1',
      payment_status: 'Paid',
    });
  });

  it('writes a zero-fee payment row and reports the registration as Confirmed/Paid', async () => {
    const result = await createRegistration(validInput());
    if (result.outcome !== 'registered') throw new Error('expected a registered outcome');

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 0,
    });
    expect(result.paymentStatus).toBe('Paid');
    expect(result.registrationStatus).toBe('Confirmed');
    expect(result.courseFee).toBe(0);
  });

  it('runs the zero-fee enrollment side effects so the joining link still goes out', async () => {
    await createRegistration(validInput());

    expect(paymentsServiceMock.runZeroFeeEnrollmentSideEffects).toHaveBeenCalledWith('reg-1');
  });

  it('sends free_welcome only — never the payment instruction or the first chase', async () => {
    await createRegistration(validInput());

    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'free_welcome');
    expect(sendEmailOnceMock).not.toHaveBeenCalledWith('reg-1', 'welcome');
    expect(sendEmailOnceMock).not.toHaveBeenCalledWith('reg-1', 'payment_instruction');
    expect(sendEmailOnceMock).not.toHaveBeenCalledWith('reg-1', 'reminder_1');
  });

  it('suppresses the WhatsApp welcome, whose approved template quotes a fee', async () => {
    await createRegistration(validInput());

    expect(sendWhatsappOnceMock).not.toHaveBeenCalled();
    // SMS keeps the 'welcome' type and branches only its body text.
    expect(sendSmsOnceMock).toHaveBeenCalledWith('reg-1', 'welcome');
  });

  it('never tells a free registrant to check their email for payment instructions', async () => {
    const result = await createRegistration(validInput());
    if (result.outcome !== 'registered') throw new Error('expected a registered outcome');

    expect(result.message).not.toMatch(/payment/i);
    expect(result.message).toMatch(/nothing to pay/i);
  });

  it('takes the same zero-fee path on a paid batch when a code covers the whole fee', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(activeBatch({ courseFee: 1200 }));
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: true,
      discountType: 'percentage',
      discountValue: 100,
      partnerId: 'partner-1',
    });

    const result = await createRegistration({ ...validInput(), couponCode: 'FREE100' });
    if (result.outcome !== 'registered') throw new Error('expected a registered outcome');

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 0,
    });
    expect(paymentsServiceMock.runZeroFeeEnrollmentSideEffects).toHaveBeenCalledWith('reg-1');
    // The BATCH is still a paid one, so the paid templates are still correct.
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'welcome');
  });
});

describe('deep-endpoint orchestration (Document 5, Section 2)', () => {
  it('creates participant, registration, payment, and fires E01+E02+E03', async () => {
    const result = await createRegistration(validInput());
    if (result.outcome !== 'registered') throw new Error('expected a registered outcome');

    expect(result.registrationId).toBe('reg-1');
    expect(result.paymentStatus).toBe('Unpaid');
    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 1200, // BR-18: fee copied from the Batch
    });
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'welcome');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'payment_instruction');
    expect(sendEmailOnceMock).toHaveBeenCalledWith('reg-1', 'reminder_1');
    expect(sendWhatsappOnceMock).toHaveBeenCalledWith('reg-1', 'welcome');
  });

  it('joins the waitlist instead of registering when the batch is at capacity (founder-approved 2026-07-24)', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(0);

    const result = await createRegistration(validInput());
    if (result.outcome !== 'waitlisted') throw new Error('expected a waitlisted outcome');

    expect(result.waitlistId).toBe('waitlist-1');
    expect(waitlistServiceMock.joinWaitlist).toHaveBeenCalledWith(
      expect.objectContaining({ participantId: 'participant-1', batchId: expect.any(String) }),
    );
    expect(registrationsRepositoryMock.insertRegistration).not.toHaveBeenCalled();
    expect(registrationsRepositoryMock.insertInitialPayment).not.toHaveBeenCalled();
  });

  it('registers normally when seats remain (seatsRemaining > 0)', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(5);

    const result = await createRegistration(validInput());

    expect(result.outcome).toBe('registered');
    expect(waitlistServiceMock.joinWaitlist).not.toHaveBeenCalled();
  });

  it('registers normally when the batch has unlimited capacity (seatsRemaining null)', async () => {
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(null);

    const result = await createRegistration(validInput());

    expect(result.outcome).toBe('registered');
    expect(waitlistServiceMock.joinWaitlist).not.toHaveBeenCalled();
  });

  it('passes job title and company through to the participant upsert', async () => {
    await createRegistration({ ...validInput(), jobTitle: 'Finance Manager', company: 'Acme Ltd' });

    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ job_title: 'Finance Manager', company: 'Acme Ltd' }),
    );
  });

  it('creates a lead record from the registration flow', async () => {
    await createRegistration(validInput());

    expect(leadsServiceMock.createLead).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: 'reg-1',
        participantId: 'participant-1',
        fullName: 'Ama Owusu',
        email: 'ama.owusu@example.com',
        phone: '+233241234567',
        company: 'N/A',
        jobTitle: 'N/A',
        leadSource: 'WhatsApp',
      }),
    );
  });

  it('creates a sales opportunity linked to the lead and registration', async () => {
    await createRegistration(validInput());

    expect(opportunitiesServiceMock.createOpportunity).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        registrationId: 'reg-1',
        amount: 1200,
        stage: 'New',
      }),
    );
  });

  it('joins first/middle/surname into full_name and passes gender through', async () => {
    await createRegistration({ ...validInput(), middleName: 'Efua' });

    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Ama Efua Owusu',
        first_name: 'Ama',
        middle_name: 'Efua',
        surname: 'Owusu',
        gender: 'Female',
      }),
    );
  });

  it('omits the middle name from full_name when not given', async () => {
    await createRegistration(validInput());

    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Ama Owusu' }),
    );
  });

  it('still succeeds when an email send fails (P4.01 — email must not block registration)', async () => {
    sendEmailOnceMock.mockRejectedValue(new Error('resend down'));

    const result = await createRegistration(validInput());
    if (result.outcome !== 'registered') throw new Error('expected a registered outcome');

    expect(result.registrationId).toBe('reg-1');
  });
});

describe('BR-18 addendum — early-registration discount decides the copied fee', () => {
  it('charges the discounted fee when registering on or before the cutoff', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ courseFee: 1200, discountCutoffDate: FUTURE_DATE, discountedFee: 900 }),
    );

    await createRegistration(validInput());

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 900,
    });
  });

  it('charges the regular fee once the discount cutoff has passed', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ courseFee: 1200, discountCutoffDate: '2020-01-01', discountedFee: 900 }),
    );

    await createRegistration(validInput());

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 1200,
    });
  });
});

describe('Knowsia Growth Partner Programme — coupon/referral code resolution (2026-08-02)', () => {
  it('does nothing when no code is typed and no referral cookie is present', async () => {
    await createRegistration(validInput());
    expect(partnersServiceMock.previewCode).not.toHaveBeenCalled();
    expect(partnersServiceMock.redeemCodeSystem).not.toHaveBeenCalled();
  });

  it('an explicitly typed code wins over the referral cookie', async () => {
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: true,
      discountType: null,
      discountValue: null,
      partnerId: 'partner-1',
    });
    await createRegistration({ ...validInput(), couponCode: 'TYPED10' }, 'COOKIECODE');
    expect(partnersServiceMock.previewCode).toHaveBeenCalledWith('TYPED10', expect.any(String));
    expect(partnersServiceMock.redeemCodeSystem).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'TYPED10', attributionMethod: 'code' }),
    );
  });

  it('falls back to the referral cookie when no code was typed', async () => {
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: true,
      discountType: null,
      discountValue: null,
      partnerId: 'partner-1',
    });
    await createRegistration(validInput(), 'COOKIECODE');
    expect(partnersServiceMock.previewCode).toHaveBeenCalledWith('COOKIECODE', expect.any(String));
    expect(partnersServiceMock.redeemCodeSystem).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'COOKIECODE', attributionMethod: 'link' }),
    );
  });

  it('an invalid code never gets redeemed and never checks existing-lead status', async () => {
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: false,
      discountType: null,
      discountValue: null,
      partnerId: null,
      reason: 'This code has expired.',
    });
    await createRegistration({ ...validInput(), couponCode: 'EXPIRED' });
    expect(partnersServiceMock.redeemCodeSystem).not.toHaveBeenCalled();
    expect(leadsServiceMock.wasExistingLeadBeforeRegistration).not.toHaveBeenCalled();
  });

  it('checks existing-lead status BEFORE leadsService.createLead runs, for a valid code', async () => {
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: true,
      discountType: null,
      discountValue: null,
      partnerId: 'partner-1',
    });
    leadsServiceMock.wasExistingLeadBeforeRegistration.mockResolvedValue(true);
    await createRegistration({ ...validInput(), couponCode: 'PARTNER1' });
    expect(leadsServiceMock.wasExistingLeadBeforeRegistration).toHaveBeenCalledWith(
      'ama.owusu@example.com',
    );
    expect(partnersServiceMock.redeemCodeSystem).toHaveBeenCalledWith(
      expect.objectContaining({ existingLeadAtRedemption: true }),
    );
  });

  it('a code redemption failure never fails the registration itself', async () => {
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: true,
      discountType: null,
      discountValue: null,
      partnerId: 'partner-1',
    });
    partnersServiceMock.redeemCodeSystem.mockRejectedValue(new Error('db down'));
    const result = await createRegistration({ ...validInput(), couponCode: 'PARTNER1' });
    expect(result.outcome).toBe('registered');
  });

  describe('best-price-wins fee math (no stacking a code discount with the early-bird price)', () => {
    it('applies the code discount off the original fee when it beats the early-bird price', async () => {
      coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
        activeBatch({ courseFee: 1000, discountCutoffDate: FUTURE_DATE, discountedFee: 900 }),
      );
      partnersServiceMock.previewCode.mockResolvedValue({
        valid: true,
        discountType: 'percentage',
        discountValue: 20, // 1000 * 0.8 = 800, cheaper than the 900 early-bird price
        partnerId: 'partner-1',
      });
      const result = await createRegistration({ ...validInput(), couponCode: 'SAVE20' });
      if (result.outcome !== 'registered') throw new Error('expected registered');
      expect(result.courseFee).toBe(800);
      expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
        registration_id: 'reg-1',
        course_fee: 800,
      });
      expect(partnersServiceMock.redeemCodeSystem).toHaveBeenCalledWith(
        expect.objectContaining({ discountAmountApplied: 100 }), // 900 - 800
      );
    });

    it('keeps the early-bird price when the code discount would be worse for the student', async () => {
      coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
        activeBatch({ courseFee: 1000, discountCutoffDate: FUTURE_DATE, discountedFee: 900 }),
      );
      partnersServiceMock.previewCode.mockResolvedValue({
        valid: true,
        discountType: 'fixed_amount',
        discountValue: 50, // 1000 - 50 = 950, worse than the 900 early-bird price
        partnerId: 'partner-1',
      });
      const result = await createRegistration({ ...validInput(), couponCode: 'SAVE50' });
      if (result.outcome !== 'registered') throw new Error('expected registered');
      expect(result.courseFee).toBe(900);
      expect(partnersServiceMock.redeemCodeSystem).toHaveBeenCalledWith(
        expect.objectContaining({ discountAmountApplied: 0 }),
      );
    });

    it('a pure attribution code (no discount) never changes the fee', async () => {
      partnersServiceMock.previewCode.mockResolvedValue({
        valid: true,
        discountType: null,
        discountValue: null,
        partnerId: 'partner-1',
      });
      const result = await createRegistration({ ...validInput(), couponCode: 'ATTRIBONLY' });
      if (result.outcome !== 'registered') throw new Error('expected registered');
      expect(result.courseFee).toBe(1200);
      expect(partnersServiceMock.redeemCodeSystem).toHaveBeenCalledWith(
        expect.objectContaining({ discountAmountApplied: 0 }),
      );
    });
  });
});

describe('registration input schema', () => {
  it('lowercases the email (BR-02 matching key)', () => {
    const parsed = registrationInputSchema.parse({
      ...validInput(),
      email: 'AMA.OWUSU@Example.COM',
    });
    expect(parsed.email).toBe('ama.owusu@example.com');
  });

  it('rejects a phone shorter than 10 characters', () => {
    const result = registrationInputSchema.safeParse({ ...validInput(), phone: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown lead source', () => {
    const result = registrationInputSchema.safeParse({
      ...validInput(),
      leadSource: 'TikTok',
    });
    expect(result.success).toBe(false);
  });

  // BR-43 (2026-08-12): 'Returning' is system-assigned by the portal's
  // enrolment path, where a session has already proven who the caller is. An
  // anonymous visitor claiming it would corrupt the repeat-enrolment figure the
  // value exists to make countable — so the internal schema carries it and the
  // public one, which POST /api/registrations uses, does not.
  it('accepts Returning on the internal schema', () => {
    const result = registrationInputSchema.safeParse({
      ...validInput(),
      leadSource: 'Returning',
    });
    expect(result.success).toBe(true);
  });

  it('rejects Returning on the public schema', () => {
    const result = publicRegistrationInputSchema.safeParse({
      ...validInput(),
      leadSource: 'Returning',
    });
    expect(result.success).toBe(false);
  });

  it('still accepts a real channel on the public schema', () => {
    const result = publicRegistrationInputSchema.safeParse({
      ...validInput(),
      leadSource: 'Facebook',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown gender', () => {
    const result = registrationInputSchema.safeParse({
      ...validInput(),
      gender: 'Other',
    });
    expect(result.success).toBe(false);
  });

  it('transforms an omitted middle name to null', () => {
    const input = validInput();
    delete (input as { middleName?: unknown }).middleName;
    const parsed = registrationInputSchema.parse(input);
    expect(parsed.middleName).toBeNull();
  });
});

describe('bulkImportRegistrations — backfill of registrations collected outside the system', () => {
  function validBulkRow(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Kofi',
      middleName: null,
      surname: 'Mensah',
      gender: 'Male' as const,
      email: 'kofi.mensah@example.com',
      phone: '+233201234567',
      jobTitle: null,
      company: null,
      amountPaid: 0,
      ...overrides,
    };
  }

  function validBulkRequest(overrides: Record<string, unknown> = {}) {
    return {
      batchId: '4c9f6ae2-0000-4000-8000-000000000001',
      leadSource: 'Other' as const,
      paymentMethod: 'Cash' as const,
      notesSuffix: null,
      consentConfirmed: true as const,
      rows: [validBulkRow()],
      ...overrides,
    };
  }

  it('imports against a batch that is inactive/in the past — unlike createRegistration it does not enforce BR-01/19', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ isActive: false, startDate: '2020-01-01' }),
    );

    const result = await bulkImportRegistrations(validBulkRequest());

    expect(result.summary.created).toBe(1);
    expect(registrationsRepositoryMock.insertRegistration).toHaveBeenCalled();
  });

  it('rejects when the batch does not exist', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(null);

    await expect(bulkImportRegistrations(validBulkRequest())).rejects.toMatchObject({
      code: 'INVALID_BATCH',
    });
  });

  it('applies a payment only for rows with amountPaid > 0, leaving unpaid rows untouched', async () => {
    const result = await bulkImportRegistrations(
      validBulkRequest({
        rows: [
          validBulkRow({ email: 'unpaid@example.com', amountPaid: 0 }),
          validBulkRow({ email: 'paid@example.com', amountPaid: 1200 }),
        ],
      }),
    );

    expect(registrationsRepositoryMock.insertRegistration).toHaveBeenCalledTimes(2);
    expect(paymentsServiceMock.applyPaymentUpdate).toHaveBeenCalledTimes(1);
    expect(paymentsServiceMock.applyPaymentUpdate).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ amountPaid: 1200, paymentMethod: 'Cash' }),
      { id: 'staff-1', fullName: 'Jane Doe', role: 'marketing' },
    );
    expect(result.summary.created).toBe(2);
    expect(result.summary.unpaid).toBe(1);
    expect(result.summary.paid).toBe(1);
  });

  it('defaults course_fee to the batch effective fee, but honors a per-row override for early-discount payers', async () => {
    await bulkImportRegistrations(
      validBulkRequest({
        rows: [
          validBulkRow({ email: 'full-price@example.com', amountPaid: 1200 }),
          validBulkRow({ email: 'early-bird@example.com', amountPaid: 900, courseFee: 900 }),
        ],
      }),
    );

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenNthCalledWith(1, {
      registration_id: 'reg-1',
      course_fee: 1200,
    });
    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenNthCalledWith(2, {
      registration_id: 'reg-1',
      course_fee: 900,
    });
  });

  it('records a duplicate row and continues importing the remaining rows (does not abort the batch)', async () => {
    registrationsRepositoryMock.insertRegistration
      .mockRejectedValueOnce({ code: '23505' })
      .mockResolvedValueOnce({ id: 'reg-2', registration_status: 'Registered' });

    const result = await bulkImportRegistrations(
      validBulkRequest({
        rows: [
          validBulkRow({ email: 'already-registered@example.com' }),
          validBulkRow({ email: 'new@example.com' }),
        ],
      }),
    );

    expect(result.summary.duplicates).toBe(1);
    expect(result.summary.created).toBe(1);
    expect(result.results[0]).toMatchObject({ status: 'duplicate', email: 'already-registered@example.com' });
    expect(result.results[1]).toMatchObject({ status: 'created', email: 'new@example.com' });
  });

  it('applies the notes suffix to every created registration', async () => {
    await bulkImportRegistrations(validBulkRequest({ notesSuffix: 'Imported from Google Form' }));

    expect(registrationsRepositoryMock.updateRegistrationNotes).toHaveBeenCalledWith(
      'reg-1',
      'Imported from Google Form',
    );
  });
});

describe('createCorporateEmployeeRegistration — one employee row under a company seat allocation (2026-07-26)', () => {
  const actor = { id: 'staff-1', fullName: 'Jane Doe', role: 'admin' };
  function employeeRow(overrides: Record<string, unknown> = {}) {
    return {
      firstName: 'Ama',
      middleName: null,
      surname: 'Owusu',
      gender: 'Female' as const,
      email: 'ama.owusu@acme.com',
      phone: '+233201234567',
      jobTitle: null,
      company: null,
      amountPaid: 0,
      ...overrides,
    };
  }
  const context = {
    batchId: '4c9f6ae2-0000-4000-8000-000000000001',
    leadSource: 'Other' as const,
    paymentMethod: 'Bank Transfer' as const,
    courseFee: 1200,
    isFree: false,
    companyAllocationId: 'allocation-1',
    companyName: 'Acme Ltd',
  };

  it('tags the registration with the company_allocation_id', async () => {
    await createCorporateEmployeeRegistration(employeeRow(), context, actor);

    expect(registrationsRepositoryMock.insertRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ company_allocation_id: 'allocation-1' }),
    );
  });

  it('returns duplicate status instead of throwing on a unique-violation', async () => {
    registrationsRepositoryMock.insertRegistration.mockRejectedValueOnce({ code: '23505' });

    const result = await createCorporateEmployeeRegistration(employeeRow(), context, actor);

    expect(result).toEqual({ status: 'duplicate' });
  });

  it('notes the company name on the registration and, if paid, on the payment', async () => {
    await createCorporateEmployeeRegistration(employeeRow({ amountPaid: 600 }), context, actor);

    expect(registrationsRepositoryMock.updateRegistrationNotes).toHaveBeenCalledWith(
      'reg-1',
      'Corporate registration — Acme Ltd',
    );
    expect(paymentsServiceMock.applyPaymentUpdate).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ paymentNotes: 'Corporate registration — Acme Ltd', paymentMethod: 'Bank Transfer' }),
      actor,
    );
  });
});

describe('deleteRegistration — immediate hard delete of wrongly-entered/test data', () => {
  beforeEach(() => {
    usersServiceMock.requireRole.mockResolvedValue({
      id: 'staff-admin-1',
      fullName: 'Ama Admin',
      role: 'admin',
    });
    registrationsRepositoryMock.callDeleteRegistrationImmediately.mockResolvedValue(undefined);
  });

  it('requires the admin role', async () => {
    await deleteRegistration('reg-1', 'Duplicate test entry');
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('passes the calling staff id (not any client-supplied value) and the reason through', async () => {
    await deleteRegistration('reg-1', 'Duplicate test entry');
    expect(registrationsRepositoryMock.callDeleteRegistrationImmediately).toHaveBeenCalledWith(
      'reg-1',
      'staff-admin-1',
      'Duplicate test entry',
    );
  });
});

// Write-off (founder direction 2026-08-09). The point of the feature is that a
// registrant who never paid and never attended stops counting as receivable
// WITHOUT anything being deleted and WITHOUT a payment being invented — so
// these tests care most about what is NOT done: amount_paid is never touched,
// and a fully-paid row can never be written off.
describe('lapseRegistration — writing off an uncollectible balance', () => {
  function lapseRow(overrides: Record<string, unknown> = {}) {
    return {
      registration: {
        id: 'reg-1',
        batch_id: 'batch-1',
        registration_status: 'Registered',
        lead_source: 'WhatsApp',
        lapsed_at: null,
        lapsed_by: null,
        lapsed_reason: null,
      },
      payment: { payment_status: 'Unpaid', balance: '1200.00', amount_paid: '0.00' },
      batch: { id: 'batch-1', capacity: null, cohort_label: 'JUL-2026' },
      course: { course_name: 'Understanding ESG' },
      lapsedByName: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    usersServiceMock.requireRole.mockResolvedValue({
      id: 'staff-finance-1',
      fullName: 'Kofi Finance',
      role: 'finance',
    });
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(lapseRow());
    registrationsRepositoryMock.updateRegistrationLapsedSystem.mockResolvedValue(undefined);
    registrationsRepositoryMock.updateRegistrationReinstatedSystem.mockResolvedValue(undefined);
  });

  it('is open to finance as well as admin — a receivable is finance\'s call', async () => {
    await lapseRegistration('reg-1', 'Never paid, never attended');
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'finance']);
  });

  it('records the acting staff member and the reason', async () => {
    await lapseRegistration('reg-1', 'No response to four follow-ups');
    expect(registrationsRepositoryMock.updateRegistrationLapsedSystem).toHaveBeenCalledWith({
      registrationId: 'reg-1',
      staffId: 'staff-finance-1',
      reason: 'No response to four follow-ups',
    });
  });

  it('refuses a fully-paid registration — there is nothing to write off', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      lapseRow({ payment: { payment_status: 'Paid', balance: '0.00', amount_paid: '1200.00' } }),
    );
    await expect(lapseRegistration('reg-1', 'Did not attend')).rejects.toThrow(
      /fully paid/i,
    );
    expect(registrationsRepositoryMock.updateRegistrationLapsedSystem).not.toHaveBeenCalled();
  });

  it('refuses a registration that is already written off', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      lapseRow({
        registration: { ...lapseRow().registration, registration_status: 'Lapsed' },
      }),
    );
    await expect(lapseRegistration('reg-1', 'Never paid')).rejects.toThrow(/already been written off/i);
    expect(registrationsRepositoryMock.updateRegistrationLapsedSystem).not.toHaveBeenCalled();
  });

  it('frees the seat — a capped batch notifies the waitlist, same as a deletion', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      lapseRow({ batch: { id: 'batch-1', capacity: 30, cohort_label: 'JUL-2026' } }),
    );
    coursesServiceMock.getSeatsRemaining.mockResolvedValue(1);

    await lapseRegistration('reg-1', 'Never paid, never attended');

    expect(waitlistServiceMock.notifyNextIfSeatAvailable).toHaveBeenCalledWith('batch-1', 1, {
      courseName: 'Understanding ESG',
      cohortLabel: 'JUL-2026',
    });
  });

  it('reinstates to Confirmed when the fee is settled, Registered otherwise', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      lapseRow({
        registration: { ...lapseRow().registration, registration_status: 'Lapsed' },
        payment: { payment_status: 'Paid', balance: '0.00', amount_paid: '1200.00' },
      }),
    );
    await reinstateRegistration('reg-1');
    expect(registrationsRepositoryMock.updateRegistrationReinstatedSystem).toHaveBeenCalledWith(
      'reg-1',
      'Confirmed',
    );

    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      lapseRow({
        registration: { ...lapseRow().registration, registration_status: 'Lapsed' },
      }),
    );
    await reinstateRegistration('reg-1');
    expect(registrationsRepositoryMock.updateRegistrationReinstatedSystem).toHaveBeenLastCalledWith(
      'reg-1',
      'Registered',
    );
  });
});

// The rule the nightly sweep applies. Pure, so it is tested directly rather
// than through a mocked database — the arithmetic of "who gets closed out" is
// the part worth pinning down.
describe('shouldAutoLapse — the 15-day rule (founder decision 2026-08-09)', () => {
  it('closes a registration with no money and no attendance', () => {
    expect(shouldAutoLapse({ amountPaid: 0, attendanceRows: 0 })).toEqual({
      lapse: true,
      skipReason: null,
    });
  });

  it('leaves part-payers alone — real money changed hands, a human decides', () => {
    expect(shouldAutoLapse({ amountPaid: 500, attendanceRows: 0 })).toEqual({
      lapse: false,
      skipReason: 'part_payment',
    });
  });

  it('leaves anyone the Zoom sync saw, however briefly', () => {
    expect(shouldAutoLapse({ amountPaid: 0, attendanceRows: 1 })).toEqual({
      lapse: false,
      skipReason: 'attended',
    });
  });
});

describe('runAutoLapseSweep', () => {
  beforeEach(() => {
    registrationsRepositoryMock.updateRegistrationLapsedSystem.mockResolvedValue(undefined);
    registrationsRepositoryMock.selectAutoLapseCandidatesSystem.mockResolvedValue([
      { registrationId: 'reg-unpaid', batchId: 'b1', amountPaid: 0, paymentStatus: 'Unpaid', attendanceRows: 0 },
      { registrationId: 'reg-part', batchId: 'b1', amountPaid: 400, paymentStatus: 'Part Payment', attendanceRows: 0 },
      { registrationId: 'reg-attended', batchId: 'b1', amountPaid: 0, paymentStatus: 'Unpaid', attendanceRows: 2 },
    ]);
  });

  it('writes off only the unpaid no-show, and attributes it to no staff member', async () => {
    const summary = await runAutoLapseSweep({ now: new Date('2026-08-09T07:00:00Z') });

    expect(summary).toMatchObject({
      dryRun: false,
      candidatesEvaluated: 3,
      lapsed: 1,
      skippedPartPayment: 1,
      skippedAttended: 1,
    });
    expect(registrationsRepositoryMock.updateRegistrationLapsedSystem).toHaveBeenCalledTimes(1);
    expect(registrationsRepositoryMock.updateRegistrationLapsedSystem).toHaveBeenCalledWith(
      expect.objectContaining({ registrationId: 'reg-unpaid', staffId: null }),
    );
  });

  it('counts back 15 days from today to pick the batch end-date cutoff', async () => {
    await runAutoLapseSweep({ now: new Date('2026-08-09T07:00:00Z') });
    expect(registrationsRepositoryMock.selectAutoLapseCandidatesSystem).toHaveBeenCalledWith(
      '2026-07-25',
    );
  });

  it('a dry run reports what it would close without writing anything', async () => {
    const summary = await runAutoLapseSweep({ dryRun: true });
    expect(summary).toMatchObject({ dryRun: true, lapsed: 1 });
    expect(registrationsRepositoryMock.updateRegistrationLapsedSystem).not.toHaveBeenCalled();
  });

  it('one failing row does not abort the rest of the sweep', async () => {
    registrationsRepositoryMock.selectAutoLapseCandidatesSystem.mockResolvedValue([
      { registrationId: 'reg-a', batchId: 'b1', amountPaid: 0, paymentStatus: 'Unpaid', attendanceRows: 0 },
      { registrationId: 'reg-b', batchId: 'b1', amountPaid: 0, paymentStatus: 'Unpaid', attendanceRows: 0 },
    ]);
    registrationsRepositoryMock.updateRegistrationLapsedSystem
      .mockRejectedValueOnce(new Error('constraint violation'))
      .mockResolvedValueOnce(undefined);

    const summary = await runAutoLapseSweep();

    expect(summary.lapsed).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toContain('reg-a');
  });
});

describe('deleteParticipantImmediately — immediate hard delete distinct from the DPA flow', () => {
  beforeEach(() => {
    usersServiceMock.requireRole.mockResolvedValue({
      id: 'staff-admin-1',
      fullName: 'Ama Admin',
      role: 'admin',
    });
    registrationsRepositoryMock.callDeleteParticipantImmediately.mockResolvedValue(undefined);
  });

  it('requires the admin role', async () => {
    await deleteParticipantImmediately('participant-1', 'Test participant from staging');
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('passes the calling staff id and the reason through', async () => {
    await deleteParticipantImmediately('participant-1', 'Test participant from staging');
    expect(registrationsRepositoryMock.callDeleteParticipantImmediately).toHaveBeenCalledWith(
      'participant-1',
      'staff-admin-1',
      'Test participant from staging',
    );
  });
});

describe('transferRegistration — batch/cohort transfer (system review, 2026-07-24)', () => {
  function registration360Row(overrides: Record<string, unknown> = {}) {
    return {
      registration: {
        id: 'reg-1',
        participant_id: 'participant-1',
        batch_id: 'old-batch-1',
        registration_status: 'Registered',
        lead_source: 'WhatsApp',
        consent_given: true,
        notes: null,
        registered_at: '2026-07-01T09:00:00Z',
      },
      participant: {
        id: 'participant-1',
        full_name: 'Ama Owusu',
        email: 'ama.owusu@example.com',
        phone: '+233241234567',
        deleted_at: null,
      },
      payment: { payment_status: 'Unpaid' },
      batch: { id: 'old-batch-1', course_id: 'course-1', cohort_label: 'JUL-2026' },
      course: { course_name: 'AI-Powered Financial Reporting and Modeling', course_code: 'AI05' },
      verifiedByName: null,
      discountGrantedByName: null,
      emailLog: [],
      whatsappLog: [],
      smsLog: [],
      zoomRegistrant: null,
      attendance: [],
      feedback: null,
      certificates: [],
      calls: [],
      ...overrides,
    };
  }

  const destinationBatch = (overrides: Record<string, unknown> = {}) =>
    activeBatch({ id: 'new-batch-1', cohortLabel: 'AUG-2026', ...overrides });

  beforeEach(() => {
    usersServiceMock.requireRole.mockResolvedValue({
      id: 'staff-admin-1',
      fullName: 'Ama Admin',
      role: 'admin',
    });
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(registration360Row());
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(destinationBatch());
  });

  it('requires the admin role', async () => {
    await transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' });
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin']);
  });

  it('moves the batch, appends a note, and does not touch Zoom for an Unpaid registration', async () => {
    await transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' });

    expect(registrationsRepositoryMock.updateRegistrationBatch).toHaveBeenCalledWith(
      'reg-1',
      'new-batch-1',
    );
    expect(registrationsRepositoryMock.updateRegistrationNotes).toHaveBeenCalledWith(
      'reg-1',
      expect.stringContaining('Transferred from JUL-2026 to AUG-2026'),
    );
    expect(attendanceServiceMock.reregisterForZoomAfterTransfer).not.toHaveBeenCalled();
    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ama.owusu@example.com' }),
    );
  });

  it('prepends to existing notes rather than overwriting them', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      registration360Row({
        registration: {
          ...registration360Row().registration,
          notes: 'Original note from registration.',
        },
      }),
    );

    await transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' });

    const [, writtenNotes] = registrationsRepositoryMock.updateRegistrationNotes.mock.calls[0];
    expect(writtenNotes).toContain('Original note from registration.');
    expect(writtenNotes).toContain('Transferred from JUL-2026 to AUG-2026');
  });

  it('re-registers Zoom against the new batch for an already-Paid registration', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      registration360Row({ payment: { payment_status: 'Paid' } }),
    );

    await transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' });

    expect(attendanceServiceMock.reregisterForZoomAfterTransfer).toHaveBeenCalledWith('reg-1');
  });

  it('still completes the transfer even if Zoom re-registration fails', async () => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
      registration360Row({ payment: { payment_status: 'Paid' } }),
    );
    attendanceServiceMock.reregisterForZoomAfterTransfer.mockRejectedValue(
      new Error('zoom down'),
    );

    await expect(
      transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' }),
    ).resolves.toBeUndefined();
    expect(registrationsRepositoryMock.updateRegistrationBatch).toHaveBeenCalled();
  });

  it('rejects when the registration is already on the destination batch', async () => {
    await expect(
      transferRegistration('reg-1', { newBatchId: 'old-batch-1', reason: 'Schedule clash' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(registrationsRepositoryMock.updateRegistrationBatch).not.toHaveBeenCalled();
  });

  it('rejects a destination batch from a different course', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      destinationBatch({ courseId: 'a-different-course' }),
    );
    await expect(
      transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' }),
    ).rejects.toMatchObject({ code: 'INVALID_BATCH' });
  });

  it('rejects an inactive destination batch', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(destinationBatch({ isActive: false }));
    await expect(
      transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' }),
    ).rejects.toMatchObject({ code: 'INVALID_BATCH' });
  });

  it('rejects a destination batch that has already ended', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      destinationBatch({ startDate: '2020-01-01', endDate: '2020-01-05' }),
    );
    await expect(
      transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' }),
    ).rejects.toMatchObject({ code: 'INVALID_BATCH' });
  });

  // Mirrors createRegistration's late-registration window (2026-08-12) — if
  // someone can register onto a running cohort directly, refusing to transfer
  // them onto the same one would be one rule answering two ways.
  it('ACCEPTS a destination batch that has started but not yet ended', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      destinationBatch({ startDate: '2020-01-01', endDate: FUTURE_DATE }),
    );
    await transferRegistration('reg-1', {
      newBatchId: 'new-batch-1',
      reason: 'Joining the cohort already under way',
    });
    expect(registrationsRepositoryMock.updateRegistrationBatch).toHaveBeenCalledWith(
      'reg-1',
      'new-batch-1',
    );
  });

  it('surfaces BR-03 as DUPLICATE_REGISTRATION when the destination move violates the unique constraint', async () => {
    registrationsRepositoryMock.updateRegistrationBatch.mockRejectedValueOnce({ code: '23505' });
    await expect(
      transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_REGISTRATION' });
  });
});

describe('exportRegistrationsCsv — CSV export (system review, 2026-07-24)', () => {
  function exportRow(overrides: Record<string, unknown> = {}) {
    return {
      registration: {
        id: 'reg-1',
        batch_id: 'batch-1',
        registration_status: 'Confirmed',
        lead_source: 'WhatsApp',
        notes: null,
        registered_at: '2026-07-01T09:00:00Z',
      },
      participant: {
        full_name: 'Ama Owusu',
        email: 'ama.owusu@example.com',
        phone: '+233241234567',
        job_title: 'Accountant',
        company: 'Acme Ltd',
        gender: 'Female',
      },
      payment: {
        payment_status: 'Paid',
        course_fee: '1200.00',
        original_fee: null,
        amount_paid: '1200.00',
        payment_method: 'Paystack Card',
        transaction_id: 'TXN-1',
      },
      batch: { cohort_label: 'JUL-2026', course_id: 'course-1' },
      course: { course_name: 'AI-Powered Financial Reporting and Modeling', course_code: 'AI05' },
      verifiedByName: 'Jane Doe',
      ...overrides,
    };
  }

  beforeEach(() => {
    registrationsRepositoryMock.selectAllRegistrationsForExport.mockResolvedValue({
      rows: [exportRow()],
    });
  });

  it('produces a header row plus one data row per registration', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 's-1', fullName: 'Jane', role: 'admin' });
    const csv = await exportRegistrationsCsv({});
    const lines = csv.split('\r\n');
    expect(lines[0]).toContain('Full Name');
    expect(lines[1]).toContain('Ama Owusu');
  });

  it('strips payment audit columns (Transaction ID, Verified By) for Marketing', async () => {
    usersServiceMock.requireRole.mockResolvedValue({
      id: 's-1',
      fullName: 'Jane',
      role: 'marketing',
    });
    const csv = await exportRegistrationsCsv({});
    expect(csv.split('\r\n')[0]).not.toContain('Transaction ID');
    expect(csv.split('\r\n')[0]).not.toContain('Verified By');
  });

  it('filters by paymentStatus over the full unpaginated set (not just one page)', async () => {
    registrationsRepositoryMock.selectAllRegistrationsForExport.mockResolvedValue({
      rows: [
        exportRow({ registration: { ...exportRow().registration, id: 'reg-1' } }),
        exportRow({
          registration: { ...exportRow().registration, id: 'reg-2' },
          payment: { ...exportRow().payment, payment_status: 'Unpaid', amount_paid: '0.00' },
        }),
      ],
    });
    usersServiceMock.requireRole.mockResolvedValue({ id: 's-1', fullName: 'Jane', role: 'admin' });

    const csv = await exportRegistrationsCsv({ paymentStatus: 'Unpaid' });
    const dataLines = csv.split('\r\n').slice(1);
    expect(dataLines).toHaveLength(1);
  });
});

describe('listRegistrations — role-based field shaping (T-RLS-03)', () => {
  function listRow(overrides: Record<string, unknown> = {}) {
    return {
      registration: {
        id: 'reg-1',
        batch_id: 'batch-1',
        registration_status: 'Confirmed',
        lead_source: 'WhatsApp',
        notes: null,
        registered_at: '2026-07-01T09:00:00Z',
      },
      participant: {
        full_name: 'Ama Owusu',
        email: 'ama.owusu@example.com',
        phone: '+233241234567',
        job_title: 'Accountant',
        company: 'Acme Ltd',
        gender: 'Female',
      },
      payment: {
        payment_status: 'Paid',
        course_fee: '1200.00',
        original_fee: null,
        amount_paid: '1200.00',
        balance: '0.00',
        payment_method: 'Paystack Card',
        payment_notes: 'Paid via card, ref 88213',
        transaction_id: 'TXN-1',
      },
      batch: { cohort_label: 'JUL-2026', course_id: 'course-1' },
      course: { course_name: 'AI-Powered Financial Reporting and Modeling', course_code: 'AI05' },
      verifiedByName: 'Jane Doe',
      ...overrides,
    };
  }

  beforeEach(() => {
    registrationsRepositoryMock.selectRegistrationList.mockResolvedValue({
      rows: [listRow()],
      total: 1,
    });
  });

  // The Payments screen asks for paymentStatus 'outstanding'. No row's
  // payment_status ever equals that string, so a plain === comparison in the
  // post-join pass matches nothing and the screen reads "No outstanding
  // payments" while balances are in fact owed.
  describe('paymentStatus filtering', () => {
    beforeEach(() => {
      usersServiceMock.requireRole.mockResolvedValue({ id: 's-1', fullName: 'Jane', role: 'admin' });
      registrationsRepositoryMock.selectRegistrationList.mockResolvedValue({
        rows: [
          listRow({ payment: { ...listRow().payment, payment_status: 'Unpaid' } }),
          listRow({ payment: { ...listRow().payment, payment_status: 'Part Payment' } }),
          listRow({ payment: { ...listRow().payment, payment_status: 'Paid' } }),
        ],
        total: 3,
      });
    });

    it("'outstanding' keeps every row that is not fully Paid", async () => {
      const { registrations } = await listRegistrations({
        page: 1,
        limit: 50,
        paymentStatus: 'outstanding',
      });
      expect(registrations.map((row) => row.paymentStatus)).toEqual(['Unpaid', 'Part Payment']);
    });

    it('a concrete status still matches only itself', async () => {
      const { registrations } = await listRegistrations({
        page: 1,
        limit: 50,
        paymentStatus: 'Unpaid',
      });
      expect(registrations.map((row) => row.paymentStatus)).toEqual(['Unpaid']);
    });

    it('no filter returns everything', async () => {
      const { registrations } = await listRegistrations({ page: 1, limit: 50 });
      expect(registrations).toHaveLength(3);
    });

    // 'outstanding' is the collections view, and a written-off registration is
    // not being collected — it still has a balance, but nobody is pursuing it.
    // The repository narrows on lapsed_at too; this pass is the row-level
    // guarantee, exactly as for the 'outstanding' string itself.
    it("'outstanding' excludes a written-off registration despite its balance", async () => {
      registrationsRepositoryMock.selectRegistrationList.mockResolvedValue({
        rows: [
          listRow({ payment: { ...listRow().payment, payment_status: 'Unpaid' } }),
          listRow({
            registration: { ...listRow().registration, registration_status: 'Lapsed' },
            payment: { ...listRow().payment, payment_status: 'Unpaid' },
          }),
        ],
        total: 2,
      });

      const { registrations } = await listRegistrations({
        page: 1,
        limit: 50,
        paymentStatus: 'outstanding',
      });

      expect(registrations).toHaveLength(1);
      expect(registrations[0].registrationStatus).toBe('Confirmed');
    });

    it('the Registrations screen can still find written-off rows by status', async () => {
      registrationsRepositoryMock.selectRegistrationList.mockResolvedValue({
        rows: [
          listRow({
            registration: { ...listRow().registration, registration_status: 'Lapsed' },
            payment: { ...listRow().payment, payment_status: 'Unpaid' },
          }),
        ],
        total: 1,
      });

      const { registrations } = await listRegistrations({
        page: 1,
        limit: 50,
        registrationStatus: 'Lapsed',
      });

      expect(registrations).toHaveLength(1);
    });
  });

  it('admin and finance see payment audit fields, including payment_notes', async () => {
    for (const role of ['admin', 'finance'] as const) {
      usersServiceMock.requireRole.mockResolvedValue({ id: 's-1', fullName: 'Jane', role });
      const { registrations } = await listRegistrations({ page: 1, limit: 50 });
      expect(registrations[0].paymentNotes).toBe('Paid via card, ref 88213');
      expect(registrations[0].transactionId).toBe('TXN-1');
      expect(registrations[0].verifiedBy).toBe('Jane Doe');
    }
  });

  it('marketing never sees payment_notes, transactionId, or verifiedBy (T-RLS-03)', async () => {
    usersServiceMock.requireRole.mockResolvedValue({ id: 's-1', fullName: 'Jane', role: 'marketing' });

    const { registrations } = await listRegistrations({ page: 1, limit: 50 });

    expect(registrations[0].paymentStatus).toBe('Paid'); // Payment Status itself is still visible
    expect(registrations[0].paymentNotes).toBeUndefined();
    expect(registrations[0].transactionId).toBeUndefined();
    expect(registrations[0].verifiedBy).toBeUndefined();
  });

});

describe('registrant ad-hoc messaging (Admin Assistant tools, 2026-08-01)', () => {
  function contactRow(overrides: Record<string, unknown> = {}) {
    return {
      registration: { id: 'reg-1' },
      participant: {
        full_name: 'Ama Owusu',
        email: 'ama.owusu@example.com',
        phone: '+233241234567',
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    registrationsRepositoryMock.selectRegistration360.mockResolvedValue(contactRow());
  });

  describe('getRegistrationContact', () => {
    it('returns the participant contact info for a registration', async () => {
      await expect(getRegistrationContact('reg-1')).resolves.toEqual({
        registrationId: 'reg-1',
        fullName: 'Ama Owusu',
        email: 'ama.owusu@example.com',
        phone: '+233241234567',
      });
    });

    it('throws NOT_FOUND when the registration does not exist', async () => {
      registrationsRepositoryMock.selectRegistration360.mockResolvedValue(null);
      await expect(getRegistrationContact('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('sendSmsToRegistration', () => {
    it('sends via Arkesel using the participant phone', async () => {
      await sendSmsToRegistration('reg-1', 'Hello from Knowsia');
      expect(sendSmsMessageMock).toHaveBeenCalledWith({
        toPhone: '+233241234567',
        message: 'Hello from Knowsia',
      });
    });

    it('rejects when the registrant has no phone on file', async () => {
      registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
        contactRow({ participant: { full_name: 'Ama Owusu', email: 'ama@example.com', phone: null } }),
      );
      await expect(sendSmsToRegistration('reg-1', 'Hi')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(sendSmsMessageMock).not.toHaveBeenCalled();
    });
  });

  describe('sendEmailToRegistration', () => {
    it('sends via Resend using the participant email', async () => {
      await sendEmailToRegistration('reg-1', 'Subject line', '<p>Body</p>');
      expect(sendTransactionalEmailMock).toHaveBeenCalledWith({
        to: 'ama.owusu@example.com',
        subject: 'Subject line',
        html: '<p>Body</p>',
      });
    });

    it('rejects when the registrant has no email on file', async () => {
      registrationsRepositoryMock.selectRegistration360.mockResolvedValue(
        contactRow({
          participant: { full_name: 'Ama Owusu', email: null, phone: '+233241234567' },
        }),
      );
      await expect(sendEmailToRegistration('reg-1', 'Subject', 'Body')).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    });
  });
});

describe('AppError shape', () => {
  it('carries code and status for the route layer', () => {
    const err = new AppError('FORBIDDEN', 'no', 403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.httpStatus).toBe(403);
  });
});

describe('Standalone coupons at registration (2026-08-07)', () => {
  // One field on the form serves both systems: partner code first, coupon
  // second. A code that resolves as a partner code is never looked up as a
  // coupon.
  it('only tries a coupon when the typed code is not a partner code', async () => {
    partnersServiceMock.previewCode.mockResolvedValue({
      valid: true,
      discountType: null,
      discountValue: null,
      partnerId: 'partner-1',
    });

    await createRegistration({ ...validInput(), couponCode: 'PARTNER10' });
    expect(couponsServiceMock.previewCoupon).not.toHaveBeenCalled();
  });

  it('falls through to the coupon lookup when the code is not a partner code', async () => {
    await createRegistration({ ...validInput(), couponCode: 'NEWYEAR25' });
    expect(couponsServiceMock.previewCoupon).toHaveBeenCalledWith('NEWYEAR25', expect.any(String));
  });

  // A referral-link cookie is attribution, not a discount a student typed —
  // it must never resolve to a coupon.
  it('never resolves a referral cookie as a coupon', async () => {
    await createRegistration(validInput(), 'COOKIECODE');
    expect(couponsServiceMock.previewCoupon).not.toHaveBeenCalled();
  });

  it('applies the coupon when it beats the early-bird price, and consumes it', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ courseFee: 1200, discountCutoffDate: FUTURE_DATE, discountedFee: 1000 }),
    );
    couponsServiceMock.previewCoupon.mockResolvedValue({
      valid: true,
      couponId: 'coupon-1',
      code: 'NEWYEAR25',
      discountType: 'percentage',
      discountValue: 25,
    });
    couponsServiceMock.computeCouponFee.mockReturnValue(900);

    await createRegistration({ ...validInput(), couponCode: 'NEWYEAR25' });

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 900,
    });
    expect(couponsServiceMock.recordCouponRedemptionSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        couponId: 'coupon-1',
        discountAmountApplied: 100,
        stage: 'registration',
        appliedByStaffId: null,
      }),
    );
  });

  // A single-use coupon must not be burnt on a registration whose fee it
  // never changed.
  it('leaves the coupon unconsumed when the early-bird price already wins', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ courseFee: 1200, discountCutoffDate: FUTURE_DATE, discountedFee: 800 }),
    );
    couponsServiceMock.previewCoupon.mockResolvedValue({
      valid: true,
      couponId: 'coupon-1',
      code: 'SMALL',
      discountType: 'fixed_amount',
      discountValue: 100,
    });
    couponsServiceMock.computeCouponFee.mockReturnValue(1100);

    await createRegistration({ ...validInput(), couponCode: 'SMALL' });

    expect(registrationsRepositoryMock.insertInitialPayment).toHaveBeenCalledWith({
      registration_id: 'reg-1',
      course_fee: 800,
    });
    expect(couponsServiceMock.recordCouponRedemptionSystem).not.toHaveBeenCalled();
  });

  it('does not block the registration when recording the coupon fails', async () => {
    couponsServiceMock.previewCoupon.mockResolvedValue({
      valid: true,
      couponId: 'coupon-1',
      code: 'NEWYEAR25',
      discountType: 'percentage',
      discountValue: 25,
    });
    couponsServiceMock.computeCouponFee.mockReturnValue(900);
    couponsServiceMock.recordCouponRedemptionSystem.mockRejectedValue(new Error('db down'));

    await expect(
      createRegistration({ ...validInput(), couponCode: 'NEWYEAR25' }),
    ).resolves.toBeDefined();
  });
});
