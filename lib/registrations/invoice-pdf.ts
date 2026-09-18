// Invoice for one Registration (founder request 2026-09-18: a student asked
// for private one-to-one tuition — Excel Data Analytics, hybrid — and needs
// an invoice). Rendered on demand from the Registration's live data, never
// stored — the same posture as lib/corporate/invoice-pdf.ts and
// lib/portal/receipt-pdf.ts, and the reference is derived from the
// registration id so a re-download is the same invoice.
//
// Set the way the founder asked the admin surfaces to be set ("remember the
// Apple design principles"): ONE number at size — what is due and by when —
// and everything else quiet beneath it; the founder's words, not the
// system's; whitespace where a rule would do; a "PAID" state that reads as
// a receipt rather than a demand. The corporate invoice's table is for many
// seats; a person buying one place needs a sentence, not a grid.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { appHost, appUrl } from '@/lib/app-url';
import { KNOWSIA_LOGO_PNG_BASE64 } from '@/lib/certificates/logo';
import { ORGANISATION_EMAIL, ORGANISATION_LINE, ORGANISATION_NAME, PAYMENT_DETAILS } from '@/lib/organisation';
import { wrapText } from '@/lib/pdf-text';

const ORANGE = rgb(244 / 255, 158 / 255, 32 / 255);
const INK = rgb(26 / 255, 26 / 255, 46 / 255);
const GREY = rgb(90 / 255, 90 / 255, 100 / 255);
const FAINT = rgb(150 / 255, 150 / 255, 158 / 255);
const GREEN = rgb(4 / 255, 120 / 255, 87 / 255);

export interface RegistrationInvoicePdfData {
  registrationId: string;
  participantName: string;
  participantEmail: string;
  participantPhone: string | null;
  // Who the invoice is addressed to when not the participant (2026-09-18:
  // "my boss wants the invoice in the company name"). The participant is
  // then the "Attention" line under the company.
  billTo?: { name: string; attention?: string; address?: string; email?: string } | null;
  courseName: string;
  courseCode: string;
  cohortLabel: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  facilitatorName: string | null;
  courseFee: number;
  amountPaid: number;
  balance: number;
  issuedDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
}

export function invoiceReference(registrationId: string): string {
  return `INV-${registrationId.slice(0, 8).toUpperCase()}`;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatGhs(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateRegistrationInvoicePdf(data: RegistrationInvoicePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const { width } = page.getSize();
  const y = (fromTop: number) => 842 - fromTop;
  const left = 56;
  const right = width - 56;

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const paid = data.balance <= 0;

  // Wordmark, issuer, and the reference — quiet, top corners.
  const logo = await doc.embedPng(Buffer.from(KNOWSIA_LOGO_PNG_BASE64, 'base64'));
  const logoHeight = 36;
  page.drawImage(logo, { x: left, y: y(84), width: (740 / 270) * logoHeight, height: logoHeight });
  page.drawText(ORGANISATION_LINE, { x: left, y: y(100), size: 9, font: helvetica, color: GREY });

  const title = paid ? 'RECEIPTED INVOICE' : 'INVOICE';
  page.drawText(title, { x: right - bold.widthOfTextAtSize(title, 11), y: y(66), size: 11, font: bold, color: ORANGE });
  const ref = invoiceReference(data.registrationId);
  page.drawText(ref, { x: right - helvetica.widthOfTextAtSize(ref, 10), y: y(82), size: 10, font: helvetica, color: GREY });
  const issued = `Issued ${formatDate(data.issuedDate)}`;
  page.drawText(issued, { x: right - helvetica.widthOfTextAtSize(issued, 9), y: y(96), size: 9, font: helvetica, color: FAINT });

  // The one number that matters, at size, with its date in the same breath.
  let top = 170;
  const headline = paid ? formatGhs(data.amountPaid) : formatGhs(data.balance);
  page.drawText(headline, { x: left, y: y(top), size: 34, font: bold, color: paid ? GREEN : INK });
  top += 22;
  const sub = paid
    ? (data.billTo ? 'Received in full. Thank you.' : `Received in full. Thank you, ${data.participantName.split(' ')[0]}.`)
    : `due by ${formatDate(data.dueDate)}`;
  page.drawText(sub, { x: left, y: y(top), size: 13, font: helvetica, color: GREY });
  if (!paid && data.amountPaid > 0) {
    top += 18;
    page.drawText(
      `${formatGhs(data.amountPaid)} already received; ${formatGhs(data.courseFee)} in total.`,
      { x: left, y: y(top), size: 10, font: helvetica, color: FAINT },
    );
  }

  // What it is for — one sentence, wrapped, then the facts under it.
  top += 48;
  const what = `${data.courseName} — ${data.cohortLabel}`;
  const whatLines = wrapText(what, right - left, 14, (t, s) => bold.widthOfTextAtSize(t, s));
  for (const line of whatLines) {
    page.drawText(line, { x: left, y: y(top), size: 14, font: bold, color: INK });
    top += 19;
  }
  const facts: string[] = [
    `${formatDate(data.startDate)}${data.endDate !== data.startDate ? ` to ${formatDate(data.endDate)}` : ''}`,
    ...(data.facilitatorName ? [`with ${data.facilitatorName}`] : []),
    `Programme ${data.courseCode}`,
  ];
  page.drawText(facts.join('  ·  '), { x: left, y: y(top), size: 10.5, font: helvetica, color: GREY });

  // Bill to.
  top += 40;
  page.drawText('BILLED TO', { x: left, y: y(top), size: 8.5, font: bold, color: FAINT });
  top += 16;
  const quiet = (text: string) => {
    for (const line of wrapText(text, right - left, 10.5, (t, s) => helvetica.widthOfTextAtSize(t, s))) {
      page.drawText(line, { x: left, y: y(top), size: 10.5, font: helvetica, color: GREY });
      top += 14;
    }
  };
  if (data.billTo) {
    // The company at size; the participant as the attention line under it,
    // so the finance office knows whose seat this is.
    page.drawText(data.billTo.name, { x: left, y: y(top), size: 12, font: bold, color: INK });
    top += 15;
    quiet(`Attention: ${data.billTo.attention || data.participantName}`);
    if (data.billTo.address) quiet(data.billTo.address);
    if (data.billTo.email) quiet(data.billTo.email);
    quiet(`Participant: ${data.participantName} · ${data.participantEmail}`);
  } else {
    page.drawText(data.participantName, { x: left, y: y(top), size: 12, font: bold, color: INK });
    top += 15;
    quiet(data.participantEmail);
    if (data.participantPhone) quiet(data.participantPhone);
  }
  top -= 14;

  // The line — fee, received, due — as three quiet rows with a hairline.
  top += 34;
  page.drawLine({ start: { x: left, y: y(top) }, end: { x: right, y: y(top) }, thickness: 0.6, color: rgb(0.85, 0.85, 0.87) });
  top += 22;
  const row = (label: string, value: string, strong = false) => {
    const font = strong ? bold : helvetica;
    page.drawText(label, { x: left, y: y(top), size: 11, font, color: strong ? INK : GREY });
    page.drawText(value, { x: right - font.widthOfTextAtSize(value, 11), y: y(top), size: 11, font, color: INK });
    top += 20;
  };
  row('Course fee', formatGhs(data.courseFee));
  if (data.amountPaid > 0) row('Received', `– ${formatGhs(data.amountPaid)}`);
  row(paid ? 'Balance' : 'Amount due', formatGhs(Math.max(data.balance, 0)), true);

  // How to pay — or, when paid, nothing more to do.
  top += 26;
  if (paid) {
    page.drawText('No further payment is due. This document serves as your receipt.', {
      x: left, y: y(top), size: 10.5, font: helvetica, color: GREY,
    });
  } else {
    page.drawText('HOW TO PAY', { x: left, y: y(top), size: 8.5, font: bold, color: FAINT });
    top += 18;
    const ways: Array<[string, string]> = [
      [
        'Online',
        data.billTo
          ? `The participant can sign in at ${appUrl()}/portal/login and pay by card or MoMo — matched at once.`
          : `Sign in at ${appUrl()}/portal/login and pay by card or MoMo — it is matched to you at once.`,
      ],
      ['MoMo', `${PAYMENT_DETAILS.momoNumber}, or MoMo Pay code ${PAYMENT_DETAILS.momoMerchantCode} (${PAYMENT_DETAILS.momoAccountName}).`],
      ['Bank', `${PAYMENT_DETAILS.bankName}, ${PAYMENT_DETAILS.bankAccountName}, account ${PAYMENT_DETAILS.bankAccountNumber}, ${PAYMENT_DETAILS.bankBranch}.`],
    ];
    const labelWidth = 52;
    for (const [label, text] of ways) {
      page.drawText(label, { x: left, y: y(top), size: 10.5, font: bold, color: INK });
      const lines = wrapText(text, right - left - labelWidth, 10.5, (t, s) => helvetica.widthOfTextAtSize(t, s));
      for (const line of lines) {
        page.drawText(line, { x: left + labelWidth, y: y(top), size: 10.5, font: helvetica, color: GREY });
        top += 15;
      }
      top += 6;
    }
    page.drawText(`Please quote ${ref} on a MoMo or bank payment so it can be matched to you.`, {
      x: left, y: y(top + 4), size: 9.5, font: helvetica, color: FAINT,
    });
  }

  const footer = `${ORGANISATION_NAME} · ${ORGANISATION_EMAIL} · ${appHost()}`;
  page.drawText(footer, {
    x: width / 2 - helvetica.widthOfTextAtSize(footer, 8) / 2,
    y: 40,
    size: 8,
    font: helvetica,
    color: FAINT,
  });

  return doc.save();
}
