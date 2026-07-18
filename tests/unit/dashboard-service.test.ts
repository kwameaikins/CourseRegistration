import { beforeEach, describe, expect, it, vi } from 'vitest';

const dashboardRepositoryMock = {
  selectDashboardData: vi.fn(),
};
const usersServiceMock = {
  requireRole: vi.fn(),
};

vi.mock('@/modules/dashboard/repository', () => dashboardRepositoryMock);
vi.mock('@/modules/users/service', () => usersServiceMock);

const { getDashboardSummary } = await import('@/modules/dashboard/service');

const THIS_MONTH = new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  usersServiceMock.requireRole.mockResolvedValue({ role: 'management' });
  dashboardRepositoryMock.selectDashboardData.mockResolvedValue([
    {
      batchId: 'batch-1',
      courseName: 'ICAG Level 1 Prep',
      cohortLabel: 'JUL-2026',
      startDate: '2026-07-14',
      courseFee: 1200,
      registrations: [
        {
          registrationId: 'r1',
          leadSource: 'WhatsApp',
          registeredAt: THIS_MONTH,
          paymentStatus: 'Paid',
          amountPaid: 1200,
          courseFee: 1200,
        },
        {
          registrationId: 'r2',
          leadSource: 'WhatsApp',
          registeredAt: THIS_MONTH,
          paymentStatus: 'Part Payment',
          amountPaid: 400,
          courseFee: 1200,
        },
        {
          registrationId: 'r3',
          leadSource: 'Facebook',
          registeredAt: THIS_MONTH,
          paymentStatus: 'Unpaid',
          amountPaid: 0,
          courseFee: 1200,
        },
      ],
    },
  ]);
});

describe('F1.08 — dashboard aggregation (computed live)', () => {
  it('restricts access to admin and management', async () => {
    await getDashboardSummary();
    expect(usersServiceMock.requireRole).toHaveBeenCalledWith(['admin', 'management']);
  });

  it('computes per-batch totals, revenue, and conversion rate', async () => {
    const summary = await getDashboardSummary();
    const batch = summary.courses[0];

    expect(batch.totalRegistered).toBe(3);
    expect(batch.totalPaid).toBe(1);
    expect(batch.totalPartPayment).toBe(1);
    expect(batch.totalUnpaid).toBe(1);
    expect(batch.expectedRevenue).toBe(3600);
    expect(batch.revenueReceived).toBe(1600);
    expect(batch.outstandingBalance).toBe(2000);
    expect(batch.paymentConversionRate).toBe(33.33);
  });

  it('computes lead source conversion rates sorted by count', async () => {
    const summary = await getDashboardSummary();

    expect(summary.leadSources[0]).toEqual({
      source: 'WhatsApp',
      count: 2,
      conversionRate: 50,
    });
    expect(summary.leadSources[1]).toEqual({
      source: 'Facebook',
      count: 1,
      conversionRate: 0,
    });
  });

  it('computes the aggregate outstanding balance', async () => {
    const summary = await getDashboardSummary();
    expect(summary.aggregate.totalOutstandingBalance).toBe(2000);
    expect(summary.aggregate.registrationsThisMonth).toBe(3);
  });
});
