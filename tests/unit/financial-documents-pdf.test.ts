import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { generateCorporateInvoicePdf } from '@/lib/corporate/invoice-pdf';
import { ORGANISATION_LINE, ORGANISATION_NAME } from '@/lib/organisation';
import { generateReceiptPdf } from '@/lib/portal/receipt-pdf';
import { generateStatementPdf } from '@/lib/portal/statement-pdf';

// The invoice, receipt and statement name the issuing entity (founder
// request 2026-09-04). These tests prove each document still assembles with
// the issuer line and footer, and let a reviewer eyeball the layout:
// set PDF_DUMP=<dir> to write the three samples out.
function maybeDump(name: string, bytes: Uint8Array) {
  const dir = process.env.PDF_DUMP;
  if (dir) writeFileSync(`${dir}/${name}.pdf`, bytes);
}

function isPdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.slice(0, 5)).toString() === '%PDF-';
}

describe('organisation constants', () => {
  it('name the institute, not the wordmark alone', () => {
    expect(ORGANISATION_NAME).toBe('Knowsia Professional Institute');
    // Country, not city — Knowsia is online and has no office to name.
    expect(ORGANISATION_LINE).toContain('Ghana');
    expect(ORGANISATION_LINE).not.toContain('Accra');
  });
});

describe('financial documents', () => {
  it('renders a corporate invoice', async () => {
    const bytes = await generateCorporateInvoicePdf({
      companyName: 'Akwaaba Holdings Ltd',
      billingContactName: 'Efua Mensah',
      billingEmail: 'finance@akwaaba.example',
      billingAddress: 'PMB 12, Accra',
      courseName: 'Preparing For Tax Audit',
      cohortLabel: 'Cohort 3',
      batchStartDate: '2026-09-05',
      seatsPurchased: 4,
      pricePerSeat: 680,
      allocationId: 'a1b2c3d4-0000-0000-0000-000000000000',
      issuedDate: '2026-09-04',
    });
    maybeDump('invoice', bytes);
    expect(isPdf(bytes)).toBe(true);
  });

  it('renders a receipt', async () => {
    const bytes = await generateReceiptPdf({
      participantName: 'Kofi Boateng',
      participantEmail: 'kofi@example.com',
      courseName: 'IFRS 18 — Presentation and Disclosure',
      cohortLabel: 'Cohort 1',
      courseFee: 600,
      amountPaid: 420,
      balance: 180,
      paymentMethod: 'MTN MoMo',
      transactionId: 'PSK-7Y2K',
      paymentDate: '2026-09-03',
      registrationId: 'r9e8d7c6-0000-0000-0000-000000000000',
      issuedDate: '2026-09-04',
    });
    maybeDump('receipt', bytes);
    expect(isPdf(bytes)).toBe(true);
  });

  it('renders an account statement', async () => {
    const bytes = await generateStatementPdf({
      participantId: 'p1c2b3a4-0000-0000-0000-000000000000',
      participantName: 'Kofi Boateng',
      participantEmail: 'kofi@example.com',
      participantPhone: '+233 24 000 0000',
      issuedDate: '2026-09-04',
      rows: [
        {
          courseName: 'IFRS 18 — Presentation and Disclosure',
          cohortLabel: 'Cohort 1',
          registeredAt: '2026-08-20T09:00:00Z',
          courseFee: 600,
          discountAmount: 0,
          amountPaid: 420,
          balance: 180,
          paymentStatus: 'Part Payment',
          isFree: false,
          writtenOff: false,
        },
        {
          courseName: 'AI Security and Safe Use',
          cohortLabel: 'Cohort 2',
          registeredAt: '2026-07-01T09:00:00Z',
          courseFee: 455,
          discountAmount: 195,
          amountPaid: 455,
          balance: 0,
          paymentStatus: 'Paid',
          isFree: false,
          writtenOff: false,
        },
      ],
      totals: { fees: 1055, paid: 875, balanceDue: 180 },
    });
    maybeDump('statement', bytes);
    expect(isPdf(bytes)).toBe(true);
  });
});
