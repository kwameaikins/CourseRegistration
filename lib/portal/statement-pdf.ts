// Participant account statement (student portal + staff, 2026-09-03).
// Account-wide companion to lib/portal/receipt-pdf.ts: one row per course
// registration instead of one registration per document. Same
// generated-on-demand posture — rendered from live payment data, never a
// stored record.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { KNOWSIA_LOGO_PNG_BASE64 } from '@/lib/certificates/logo';
import { wrapText } from '@/lib/pdf-text';

const ORANGE = rgb(244 / 255, 158 / 255, 32 / 255);
const INK = rgb(26 / 255, 26 / 255, 46 / 255);
const GREY = rgb(90 / 255, 90 / 255, 100 / 255);

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842; // Portrait A4
// Rows drawn past this from-top depth would collide with the footer — start
// a fresh page instead.
const ROW_OVERFLOW_TOP = 750;

export interface StatementRow {
  courseName: string;
  cohortLabel: string;
  registeredAt: string; // ISO timestamp
  courseFee: number; // net fee, after any discounts
  discountAmount: number; // 0 when none
  amountPaid: number;
  balance: number;
  paymentStatus: string;
  isFree: boolean;
  writtenOff: boolean;
}

export interface StatementPdfData {
  participantId: string;
  participantName: string;
  participantEmail: string;
  participantPhone: string;
  issuedDate: string; // YYYY-MM-DD
  rows: StatementRow[];
  totals: { fees: number; paid: number; balanceDue: number };
}

function formatDate(iso: string): string {
  const date = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatGhs(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rowStatusLabel(row: StatementRow): string {
  if (row.writtenOff) return 'Written off';
  if (row.isFree) return 'Free';
  // 'Part Payment' is too wide for the status column — same meaning, shorter.
  return row.paymentStatus === 'Part Payment' ? 'Part paid' : row.paymentStatus;
}

// Course | Registered | Fee | Paid | Balance | Status. The money columns are
// right-aligned (the *Right values are right edges), so wide and narrow
// amounts line up on the decimal side and never run into the next column.
const COLUMNS = { course: 48, registered: 224, feeRight: 350, paidRight: 418, balanceRight: 490, status: 498 };

export async function generateStatementPdf(data: StatementPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logoImage = await doc.embedPng(Buffer.from(KNOWSIA_LOGO_PNG_BASE64, 'base64'));

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const y = (fromTop: number) => PAGE_HEIGHT - fromTop;

  const drawTableHeader = (target: PDFPage, headerTop: number): number => {
    // The bar spans headerTop..headerTop+22 from the top of the page; the
    // labels' baseline sits at headerTop+15, safely inside it. (Anchoring
    // the baseline below the bar leaves white-on-white, invisible labels.)
    target.drawRectangle({ x: 48, y: y(headerTop + 22), width: PAGE_WIDTH - 96, height: 22, color: INK });
    const heading = (text: string, x: number, alignRight = false) =>
      target.drawText(text, {
        x: alignRight ? x - bold.widthOfTextAtSize(text, 10) : x,
        y: y(headerTop + 15),
        size: 10,
        font: bold,
        color: rgb(1, 1, 1),
      });
    heading('Course', COLUMNS.course + 6);
    heading('Registered', COLUMNS.registered);
    heading('Fee', COLUMNS.feeRight, true);
    heading('Paid', COLUMNS.paidRight, true);
    heading('Balance', COLUMNS.balanceRight, true);
    heading('Status', COLUMNS.status);
    return headerTop + 44;
  };

  const logoHeight = 40;
  const logoWidth = (740 / 270) * logoHeight;
  page.drawImage(logoImage, { x: 48, y: y(88), width: logoWidth, height: logoHeight });

  const title = 'ACCOUNT STATEMENT';
  page.drawText(title, {
    x: PAGE_WIDTH - 48 - bold.widthOfTextAtSize(title, 18),
    y: y(78),
    size: 18,
    font: bold,
    color: ORANGE,
  });
  const refText = `Ref: STMT-${data.participantId.slice(0, 8).toUpperCase()}`;
  page.drawText(refText, {
    x: PAGE_WIDTH - 48 - helvetica.widthOfTextAtSize(refText, 10),
    y: y(100),
    size: 10,
    font: helvetica,
    color: GREY,
  });
  page.drawLine({ start: { x: 48, y: y(118) }, end: { x: PAGE_WIDTH - 48, y: y(118) }, thickness: 2, color: ORANGE });

  let cursorTop = 150;
  const line = (text: string, size = 11, font: PDFFont = helvetica, color = INK, gap = 16) => {
    page.drawText(text, { x: 48, y: y(cursorTop), size, font, color });
    cursorTop += gap;
  };

  line('Statement For', 10, bold, GREY, 14);
  line(data.participantName, 13, bold, INK, 16);
  line(data.participantEmail, 11);
  if (data.participantPhone) line(data.participantPhone, 11);

  cursorTop += 14;
  line(`Issued: ${formatDate(data.issuedDate)}`, 10, helvetica, GREY, 14);

  cursorTop += 20;

  if (data.rows.length === 0) {
    line('No course registrations on this account.', 11, helvetica, GREY, 16);
  } else {
    cursorTop = drawTableHeader(page, cursorTop);

    const ROW_LINE_HEIGHT = 13;
    for (const row of data.rows) {
      // Long course names would otherwise run into the Registered column —
      // wrap them to the course column's width (receipt-pdf posture).
      const description = `${row.courseName} — ${row.cohortLabel}`;
      const descriptionLines = wrapText(
        description,
        COLUMNS.registered - (COLUMNS.course + 6) - 10,
        10,
        (t, s) => helvetica.widthOfTextAtSize(t, s),
      );
      const discountLine = row.discountAmount > 0 ? `incl. ${formatGhs(row.discountAmount)} discount` : null;
      const rowHeight = (descriptionLines.length + (discountLine ? 1 : 0)) * ROW_LINE_HEIGHT + 9;

      if (cursorTop + rowHeight > ROW_OVERFLOW_TOP) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        cursorTop = drawTableHeader(page, 60);
      }

      descriptionLines.forEach((descLine, index) => {
        page.drawText(descLine, {
          x: COLUMNS.course + 6,
          y: y(cursorTop + index * ROW_LINE_HEIGHT),
          size: 10,
          font: helvetica,
          color: INK,
        });
      });
      if (discountLine) {
        page.drawText(discountLine, {
          x: COLUMNS.course + 6,
          y: y(cursorTop + descriptionLines.length * ROW_LINE_HEIGHT),
          size: 8.5,
          font: helvetica,
          color: GREY,
        });
      }

      const cell = (text: string, x: number, options: { color?: typeof INK; alignRight?: boolean } = {}) =>
        page.drawText(text, {
          x: options.alignRight ? x - helvetica.widthOfTextAtSize(text, 9.5) : x,
          y: y(cursorTop),
          size: 9.5,
          font: helvetica,
          color: options.color ?? INK,
        });
      cell(formatDate(row.registeredAt), COLUMNS.registered, { color: GREY });
      cell(row.isFree ? 'Free' : formatGhs(row.courseFee), COLUMNS.feeRight, { alignRight: true });
      cell(formatGhs(row.amountPaid), COLUMNS.paidRight, { alignRight: true });
      cell(formatGhs(row.balance), COLUMNS.balanceRight, { alignRight: true });
      cell(rowStatusLabel(row), COLUMNS.status, { color: row.writtenOff ? GREY : INK });

      cursorTop += rowHeight;
    }

    // Totals block never splits across a page boundary.
    if (cursorTop + 80 > ROW_OVERFLOW_TOP) {
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorTop = 60;
    }
    cursorTop += 8;
    page.drawLine({ start: { x: 48, y: y(cursorTop) }, end: { x: PAGE_WIDTH - 48, y: y(cursorTop) }, thickness: 1, color: GREY });
    cursorTop += 22;

    const totalRow = (label: string, amount: number, emphasize = false) => {
      const font = emphasize ? bold : helvetica;
      const size = emphasize ? 12 : 10.5;
      page.drawText(label, { x: 330, y: y(cursorTop), size, font, color: INK });
      const value = formatGhs(amount);
      page.drawText(value, {
        x: PAGE_WIDTH - 48 - font.widthOfTextAtSize(value, size),
        y: y(cursorTop),
        size,
        font,
        color: INK,
      });
      cursorTop += emphasize ? 20 : 17;
    };
    totalRow('Total fees', data.totals.fees);
    totalRow('Total paid', data.totals.paid);
    totalRow('Balance due', data.totals.balanceDue, true);
  }

  // Footer on every page.
  const footer = 'Knowsia — reg.knowsia.com — Questions? info.knowsia@gmail.com';
  for (const p of doc.getPages()) {
    p.drawText(footer, {
      x: PAGE_WIDTH / 2 - helvetica.widthOfTextAtSize(footer, 8) / 2,
      y: 36,
      size: 8,
      font: helvetica,
      color: GREY,
    });
  }

  return doc.save();
}
