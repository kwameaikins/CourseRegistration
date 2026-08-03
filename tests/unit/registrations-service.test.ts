import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';

const registrationsRepositoryMock = {
  findOrCreateParticipant: vi.fn(),
  insertRegistration: vi.fn(),
  insertInitialPayment: vi.fn(),
  updateRegistrationNotes: vi.fn(),
  updateRegistrationBatch: vi.fn(),
  selectRegistration360: vi.fn(),
  selectRegistrationList: vi.fn(),
  selectAllRegistrationsForExport: vi.fn(),
  callDeleteRegistrationImmediately: vi.fn(),
  callDeleteParticipantImmediately: vi.fn(),
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
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();
const sendSmsOnceMock = vi.fn();
const sendTransactionalEmailMock = vi.fn();
const sendSmsMessageMock = vi.fn();

vi.mock('@/modules/registrations/repository', () => registrationsRepositoryMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/payments/service', () => paymentsServiceMock);
vi.mock('@/modules/leads/service', () => leadsServiceMock);
vi.mock('@/modules/opportunities/service', () => opportunitiesServiceMock);
vi.mock('@/modules/attendance/service', () => attendanceServiceMock);
vi.mock('@/modules/waitlist/service', () => waitlistServiceMock);
vi.mock('@/modules/partners/service', () => partnersServiceMock);
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

const {
  createRegistration,
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
} = await import('@/modules/registrations/service');
const { registrationInputSchema } = await import('@/modules/registrations/types');

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
  opportunitiesServiceMock.createOpportunity.mockResolvedValue({ id: 'opp-1' });
  sendEmailOnceMock.mockResolvedValue('sent');
  sendWhatsappOnceMock.mockResolvedValue('sent');
  sendSmsOnceMock.mockResolvedValue('sent');
});

describe('BR-15 — mandatory DPA consent (T-BR15-01 logic)', () => {
  it('rejects consentGiven: false with CONSENT_REQUIRED and creates nothing', async () => {
    await expect(
      createRegistration({ ...validInput(), consentGiven: false }),
    ).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', httpStatus: 400 });
    expect(registrationsRepositoryMock.insertRegistration).not.toHaveBeenCalled();
  });
});

describe('BR-01/BR-19 — batch must be Active and in the future', () => {
  it('rejects an inactive batch', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(activeBatch({ isActive: false }));
    await expect(createRegistration(validInput())).rejects.toMatchObject({
      code: 'INVALID_BATCH',
    });
  });

  it('rejects a past batch (T-BR19-01 logic)', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      activeBatch({ startDate: '2020-01-01' }),
    );
    await expect(createRegistration(validInput())).rejects.toMatchObject({
      code: 'INVALID_BATCH',
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

  it('rejects a destination batch that has already started', async () => {
    coursesServiceMock.getBatchByIdSystem.mockResolvedValue(
      destinationBatch({ startDate: '2020-01-01' }),
    );
    await expect(
      transferRegistration('reg-1', { newBatchId: 'new-batch-1', reason: 'Schedule clash' }),
    ).rejects.toMatchObject({ code: 'INVALID_BATCH' });
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
