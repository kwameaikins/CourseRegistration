import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { generateStatementPdf, type StatementRow } from '@/lib/portal/statement-pdf';

const BASE = {
  participantId: '0b7e6f2a-1111-2222-3333-444455556666',
  participantName: 'Ama Serwaa Owusu',
  participantEmail: 'ama@example.com',
  participantPhone: '0245121941',
  issuedDate: '2026-09-03',
};

function row(overrides: Partial<StatementRow> = {}): StatementRow {
  return {
    courseName: 'ICAG Level 1 Preparatory Programme',
    cohortLabel: 'JUL-2026',
    registeredAt: '2026-07-01T09:00:00Z',
    courseFee: 1200,
    discountAmount: 0,
    amountPaid: 1200,
    balance: 0,
    paymentStatus: 'Paid',
    isFree: false,
    writtenOff: false,
    ...overrides,
  };
}

// Set STMT_PDF_DUMP=<dir> to write the rendered samples out for eyeballing —
// same posture as certificate-pdf.test.ts.
function maybeDump(name: string, bytes: Uint8Array) {
  const dir = process.env.STMT_PDF_DUMP;
  if (dir) writeFileSync(`${dir}/${name}.pdf`, bytes);
}

describe('generateStatementPdf', () => {
  it('renders a valid PDF for a typical account', async () => {
    const bytes = await generateStatementPdf({
      ...BASE,
      rows: [
        row(),
        row({
          courseName: 'ICAG Level 2 Preparatory Programme',
          cohortLabel: 'AUG-2026',
          courseFee: 1900,
          discountAmount: 100,
          amountPaid: 500,
          balance: 1400,
          paymentStatus: 'Part Payment',
        }),
        row({
          courseName: 'Financial Modelling Masterclass',
          courseFee: 800,
          amountPaid: 200,
          balance: 600,
          paymentStatus: 'Part Payment',
          writtenOff: true,
        }),
        row({ courseName: 'Free Career Webinar', courseFee: 0, amountPaid: 0, isFree: true }),
      ],
      totals: { fees: 3900, paid: 1900, balanceDue: 1400 },
    });
    maybeDump('statement-typical', bytes);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('renders an account with no registrations', async () => {
    const bytes = await generateStatementPdf({
      ...BASE,
      rows: [],
      totals: { fees: 0, paid: 0, balanceDue: 0 },
    });
    maybeDump('statement-empty', bytes);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('overflows onto additional pages when the account has many registrations', async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      row({
        courseName: `Course ${index + 1} — a deliberately long course name that wraps to more than one line in the course column`,
        cohortLabel: `COHORT-${index + 1}`,
      }),
    );
    const bytes = await generateStatementPdf({
      ...BASE,
      rows,
      totals: { fees: 48000, paid: 48000, balanceDue: 0 },
    });
    maybeDump('statement-multipage', bytes);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    // 40 wrapped rows cannot fit one A4 page — the row loop must have paged.
    const { PDFDocument } = await import('pdf-lib');
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});
