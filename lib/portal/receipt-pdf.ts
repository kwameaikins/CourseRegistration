// Participant payment receipt (student portal, 2026-07-26). Deliberately not
// a mutable "receipt" record — rendered on demand from the registration's
// live payment data, same generated-on-demand posture as
// lib/certificates/pdf.ts and lib/corporate/invoice-pdf.ts.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import { KNOWSIA_LOGO_PNG_BASE64 } from '@/lib/certificates/logo';

const PURPLE = rgb(75 / 255, 33 / 255, 168 / 255);
const INK = rgb(26 / 255, 26 / 255, 46 / 255);
const GREY = rgb(90 / 255, 90 / 255, 100 / 255);

export interface ReceiptPdfData {
  participantName: string;
  participantEmail: string;
  courseName: string;
  cohortLabel: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  paymentMethod: string | null;
  transactionId: string | null;
  paymentDate: string | null; // YYYY-MM-DD
  registrationId: string;
  issuedDate: string; // YYYY-MM-DD
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatGhs(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateReceiptPdf(data: ReceiptPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // Portrait A4
  const { width } = page.getSize();
  const y = (fromTop: number) => 842 - fromTop;

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoImage = await doc.embedPng(Buffer.from(KNOWSIA_LOGO_PNG_BASE64, 'base64'));
  const logoHeight = 40;
  const logoWidth = (740 / 270) * logoHeight;
  page.drawImage(logoImage, { x: 48, y: y(88), width: logoWidth, height: logoHeight });

  page.drawText('RECEIPT', { x: width - 48 - bold.widthOfTextAtSize('RECEIPT', 22), y: y(78), size: 22, font: bold, color: PURPLE });
  const receiptNumber = `Ref: RCPT-${data.registrationId.slice(0, 8).toUpperCase()}`;
  page.drawText(receiptNumber, {
    x: width - 48 - helvetica.widthOfTextAtSize(receiptNumber, 10),
    y: y(100),
    size: 10,
    font: helvetica,
    color: GREY,
  });

  let cursorTop = 150;
  const line = (text: string, size = 11, font = helvetica, color = INK, gap = 16) => {
    page.drawText(text, { x: 48, y: y(cursorTop), size, font, color });
    cursorTop += gap;
  };

  line('Received From', 10, bold, GREY, 14);
  line(data.participantName, 13, bold, INK, 16);
  line(data.participantEmail, 11);

  cursorTop += 14;
  line(`Issued: ${formatDate(data.issuedDate)}`, 10, helvetica, GREY, 14);
  if (data.paymentDate) line(`Payment Date: ${formatDate(data.paymentDate)}`, 10, helvetica, GREY, 14);
  if (data.paymentMethod) line(`Payment Method: ${data.paymentMethod}`, 10, helvetica, GREY, 14);
  if (data.transactionId) line(`Transaction Ref: ${data.transactionId}`, 10, helvetica, GREY, 14);

  cursorTop += 20;
  const columns = { desc: 48, fee: 420, paid: 500 };
  page.drawRectangle({ x: 48, y: y(cursorTop) - 4, width: width - 96, height: 22, color: PURPLE });
  page.drawText('Description', { x: columns.desc + 6, y: y(cursorTop + 12), size: 10, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Fee', { x: columns.fee, y: y(cursorTop + 12), size: 10, font: bold, color: rgb(1, 1, 1) });
  page.drawText('Paid', { x: columns.paid, y: y(cursorTop + 12), size: 10, font: bold, color: rgb(1, 1, 1) });
  cursorTop += 40;

  const description = `${data.courseName} — ${data.cohortLabel}`;
  page.drawText(description, { x: columns.desc + 6, y: y(cursorTop), size: 10.5, font: helvetica, color: INK });
  page.drawText(formatGhs(data.courseFee), { x: columns.fee, y: y(cursorTop), size: 10.5, font: helvetica, color: INK });
  page.drawText(formatGhs(data.amountPaid), { x: columns.paid, y: y(cursorTop), size: 10.5, font: helvetica, color: INK });

  cursorTop += 30;
  page.drawLine({ start: { x: 48, y: y(cursorTop) }, end: { x: width - 48, y: y(cursorTop) }, thickness: 1, color: GREY });
  cursorTop += 24;
  page.drawText('Balance Remaining', { x: columns.fee, y: y(cursorTop), size: 12, font: bold, color: INK });
  page.drawText(formatGhs(data.balance), { x: columns.paid, y: y(cursorTop), size: 12, font: bold, color: data.balance > 0 ? PURPLE : INK });

  cursorTop += 50;
  const footer = 'Knowsia — reg.knowsia.com — Questions? info.knowsia@gmail.com';
  page.drawText(footer, {
    x: width / 2 - helvetica.widthOfTextAtSize(footer, 8) / 2,
    y: 36,
    size: 8,
    font: helvetica,
    color: GREY,
  });

  return doc.save();
}
