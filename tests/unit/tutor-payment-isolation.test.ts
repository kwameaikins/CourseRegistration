import { beforeEach, describe, expect, it, vi } from 'vitest';

// BR-33 (revised 2026-08-13) — the tutor-facing payment boundary.
//
// The rule is NOT "no payment data"; it is "no payment FIGURE". A boolean
// settled/unsettled flag is allowed where it explains certificate eligibility,
// because on a paid Batch eligibility IS the payment gate and a verdict with no
// reason is unreadable. An amount is never allowed, anywhere.
//
// This file exists because that distinction is invisible to the type system: a
// service can return extra properties at runtime that its declared return type
// does not mention, and they are serialized to the tutor's browser regardless.
// The Certificate Eligibility panel shipped contradicting BR-33 for exactly
// that reason and it took an authorization review to notice.

const repositoryMock = {
  selectTutorSession: vi.fn(),
  selectBatchForTutorSystem: vi.fn(),
  selectRosterForBatchSystem: vi.fn(),
};
const certificatesServiceMock = { getBatchIssueContextSystem: vi.fn() };

vi.mock('@/modules/tutors/repository', () => repositoryMock);
vi.mock('@/modules/certificates/service', () => certificatesServiceMock);
vi.mock('@/modules/attendance/service', () => ({}));
vi.mock('@/modules/live-sessions/service', () => ({}));
vi.mock('@/modules/assignments/service', () => ({}));
vi.mock('@/modules/partners/service', () => ({}));
vi.mock('@/modules/payments/service', () => ({}));
vi.mock('@/modules/users/service', () => ({ requireRole: vi.fn() }));

const { getCertificateEligibilityForBatch, getRosterForBatch } = await import(
  '@/modules/tutors/service'
);

const SESSION_ID = 'tutor-session-1';
const TUTOR_ID = 'tutor-1';
const BATCH_ID = 'batch-1';

// Every field name that would be a payment FIGURE reaching a tutor.
const FORBIDDEN_FIELDS = [
  'amountPaid',
  'amount_paid',
  'courseFee',
  'course_fee',
  'balance',
  'outstanding',
  'discountAmount',
  'discount_amount',
  'originalFee',
  'original_fee',
  'paymentDate',
  'payment_date',
  'paymentMethod',
  'transactionId',
  'transaction_id',
];

function expectNoAmounts(payload: unknown) {
  const serialized = JSON.stringify(payload);
  for (const field of FORBIDDEN_FIELDS) {
    expect(serialized, `tutor payload must not carry "${field}"`).not.toContain(`"${field}"`);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  repositoryMock.selectTutorSession.mockResolvedValue({
    id: SESSION_ID,
    tutor_id: TUTOR_ID,
    revoked_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  });
  repositoryMock.selectBatchForTutorSystem.mockResolvedValue({ id: BATCH_ID });
});

describe('BR-33 — certificate eligibility', () => {
  beforeEach(() => {
    certificatesServiceMock.getBatchIssueContextSystem.mockResolvedValue({
      courseCode: 'ESG',
      courseTitle: 'Understanding ESG',
      defaultHours: 12,
      defaultDescription: '',
      defaultCpdCredit: '',
      batchIsFree: false,
      candidates: [
        {
          registrationId: 'reg-1',
          participantName: 'Ama Owusu',
          participantEmail: 'ama@example.com',
          paid: true,
          feedbackSubmitted: true,
          attendancePercent: 82,
          alreadyIssued: false,
          eligible: true,
        },
      ],
    });
  });

  it('DOES expose the settled/unsettled boolean — this is intended (BR-33)', async () => {
    const candidates = await getCertificateEligibilityForBatch(SESSION_ID, BATCH_ID);
    expect(candidates[0].paid).toBe(true);
  });

  it('exposes no payment FIGURE, even if the upstream context grows one', async () => {
    // Simulates modules/certificates later adding an amount to its candidate
    // shape — the tutor payload must not inherit it by simply passing through.
    certificatesServiceMock.getBatchIssueContextSystem.mockResolvedValue({
      courseCode: 'ESG',
      courseTitle: 'Understanding ESG',
      defaultHours: 12,
      defaultDescription: '',
      defaultCpdCredit: '',
      batchIsFree: false,
      candidates: [
        {
          registrationId: 'reg-1',
          participantName: 'Ama Owusu',
          participantEmail: 'ama@example.com',
          paid: false,
          amountPaid: 250,
          courseFee: 900,
          balance: 650,
          feedbackSubmitted: false,
          attendancePercent: 10,
          alreadyIssued: false,
          eligible: false,
        },
      ],
    });

    const candidates = await getCertificateEligibilityForBatch(SESSION_ID, BATCH_ID);
    expectNoAmounts(candidates);
  });
});

describe('BR-33 — roster', () => {
  it('carries no payment field at all, not even the boolean', async () => {
    repositoryMock.selectRosterForBatchSystem.mockResolvedValue([
      {
        registration: {
          id: 'reg-1',
          registration_status: 'Confirmed',
          registered_at: '2026-08-01T09:00:00Z',
        },
        participant: {
          full_name: 'Ama Owusu',
          email: 'ama@example.com',
          phone: '0245121941',
        },
      },
    ]);

    const roster = await getRosterForBatch(SESSION_ID, BATCH_ID);

    expectNoAmounts(roster);
    // The roster's guarantee is stronger than the eligibility panel's: no
    // payment concept reaches it at all, because the query has no payments
    // join. That property is what BR-33 calls architectural rather than a
    // field-strip, and it must not regress into "we filter it afterwards".
    expect(JSON.stringify(roster)).not.toContain('"paid"');
  });
});
