import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  COURSE_TITLE_TOP,
  COURSE_TITLE_TOP_WITH_FACILITATOR,
  DESCRIPTION_TOP,
  FACILITATOR_LINE_TOP,
  facilitatorAttribution,
  generateCertificatePdf,
} from '@/lib/certificates/pdf';

// Facilitator attribution (founder request 2026-08-08). The certificate is a
// fixed landscape A4 with no reflow, so the risk is purely geometric: the new
// line has to fit between the course title and the description without
// pushing the description into the Issued/CPD row, which cannot move because
// the signature images begin 5pt below it.
const BASE = {
  certificateNumber: 'KN-ICAG-2026-00147',
  recipientName: 'AMA SERWAA OWUSU',
  courseTitle: 'ICAG Level 1 Preparatory Programme',
  // Deliberately long enough to wrap to the full three lines the layout
  // allows — the worst case for collision with the Issued row below.
  description:
    'A structured preparatory programme covering financial accounting, business management and information systems, with practical application exercises and examination technique workshops delivered across the cohort.',
  hours: 20,
  issuedDate: '2026-08-08',
  verifyUrl: 'https://reg.knowsia.com/verify/KN-ICAG-2026-00147',
};

// Set CERT_PDF_DUMP=<dir> to write the rendered samples out for eyeballing.
// Geometry this fiddly is worth looking at, not just asserting on.
function maybeDump(name: string, bytes: Uint8Array) {
  const dir = process.env.CERT_PDF_DUMP;
  if (dir) writeFileSync(`${dir}/${name}.pdf`, bytes);
}

describe('facilitatorAttribution', () => {
  it('builds the line from a real name', () => {
    expect(facilitatorAttribution('Mr. Kwabena Asante, CA')).toBe(
      'Facilitated by Mr. Kwabena Asante, CA',
    );
  });

  it('trims incidental whitespace rather than printing it', () => {
    expect(facilitatorAttribution('  Mr. Asante  ')).toBe('Facilitated by Mr. Asante');
  });

  // batches.facilitator_name is free text, and certificates issued before
  // 2026-08-08 have none recorded at all. Neither may produce a dangling
  // "Facilitated by" with nothing after it.
  it.each([undefined, null, '', '   ', '\t\n'])(
    'yields null for %p rather than a dangling label',
    (value) => {
      expect(facilitatorAttribution(value as string | null | undefined)).toBeNull();
    },
  );
});

describe('certificate layout constants', () => {
  // The invariant that matters: the attribution buys its room from the gap
  // ABOVE the course title, so the description keeps the clearance to the
  // Issued/CPD row that it had before the line existed.
  it('takes the space from above the title, never from the description', () => {
    expect(COURSE_TITLE_TOP - COURSE_TITLE_TOP_WITH_FACILITATOR).toBe(16);
    expect(DESCRIPTION_TOP).toBe(400);
  });

  it('places the attribution between the raised title and the description', () => {
    expect(FACILITATOR_LINE_TOP).toBeGreaterThan(COURSE_TITLE_TOP_WITH_FACILITATOR);
    expect(FACILITATOR_LINE_TOP).toBeLessThan(DESCRIPTION_TOP);
  });

  // Three description lines at 15pt spacing must still clear the Issued row
  // at 452 — the row the signature images sit immediately below.
  it('leaves a full three-line description clear of the Issued row', () => {
    const lastDescriptionLine = DESCRIPTION_TOP + 2 * 15;
    expect(452 - lastDescriptionLine).toBeGreaterThanOrEqual(20);
  });
});

describe('generateCertificatePdf', () => {
  it('renders a valid PDF with the facilitator line', async () => {
    const bytes = await generateCertificatePdf({
      ...BASE,
      facilitatorName: 'Mr. Kwabena Asante, CA',
    });
    maybeDump('certificate-with-facilitator', bytes);
    // %PDF- magic proves the document assembled — fonts and all three
    // embedded PNGs included.
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('renders without the line when no facilitator was recorded', async () => {
    const bytes = await generateCertificatePdf({ ...BASE, facilitatorName: null });
    maybeDump('certificate-without-facilitator', bytes);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });

  it('survives a facilitator name long enough to challenge the centring', async () => {
    const bytes = await generateCertificatePdf({
      ...BASE,
      facilitatorName: 'Professor Emmanuel Kwabena Osei-Bonsu, PhD, FCCA, CA(Gh)',
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
  });
});
