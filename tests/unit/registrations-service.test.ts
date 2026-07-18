import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '@/lib/errors';

const registrationsRepositoryMock = {
  findOrCreateParticipant: vi.fn(),
  insertRegistration: vi.fn(),
  insertInitialPayment: vi.fn(),
};
const coursesServiceMock = {
  getBatchByIdSystem: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
  getCurrentStaffUser: vi.fn(),
};
const sendEmailOnceMock = vi.fn();
const sendWhatsappOnceMock = vi.fn();

vi.mock('@/modules/registrations/repository', () => registrationsRepositoryMock);
vi.mock('@/modules/courses/service', () => coursesServiceMock);
vi.mock('@/modules/users/service', () => usersServiceMock);
vi.mock('@/modules/communications/service', () => ({
  sendEmailOnce: (...args: unknown[]) => sendEmailOnceMock(...args),
  sendWhatsappOnce: (...args: unknown[]) => sendWhatsappOnceMock(...args),
}));

const { createRegistration } = await import('@/modules/registrations/service');
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
    jobTitle: null,
    company: null,
    batchId: '4c9f6ae2-0000-4000-8000-000000000001',
    leadSource: 'WhatsApp' as const,
    consentGiven: true,
  };
}

function activeBatch(overrides: Record<string, unknown> = {}) {
  return {
    id: '4c9f6ae2-0000-4000-8000-000000000001',
    courseId: 'course-1',
    cohortLabel: 'JUL-2026',
    courseFee: 1200,
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
  sendEmailOnceMock.mockResolvedValue('sent');
  sendWhatsappOnceMock.mockResolvedValue('sent');
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

describe('deep-endpoint orchestration (Document 5, Section 2)', () => {
  it('creates participant, registration, payment, and fires E01+E02+E03', async () => {
    const result = await createRegistration(validInput());

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

  it('passes job title and company through to the participant upsert', async () => {
    await createRegistration({ ...validInput(), jobTitle: 'Finance Manager', company: 'Acme Ltd' });

    expect(registrationsRepositoryMock.findOrCreateParticipant).toHaveBeenCalledWith(
      expect.objectContaining({ job_title: 'Finance Manager', company: 'Acme Ltd' }),
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

describe('AppError shape', () => {
  it('carries code and status for the route layer', () => {
    const err = new AppError('FORBIDDEN', 'no', 403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.httpStatus).toBe(403);
  });
});
