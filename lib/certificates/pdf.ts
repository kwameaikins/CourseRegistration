// Certificate PDF generator (founder-approved 2026-07-19). Replicates the
// Knowsia "Certificate of Competence" design (purple border, orange name,
// purple course title, QR-coded verification) in code with pdf-lib —
// generated on demand from the registry row, no file storage.
//
// The real brand lockup and both handwritten signatures are inlined as
// base64 (logo.ts, signatures.ts) so the serverless PDF generator has no
// filesystem asset dependency at runtime — full visual parity with the
// legacy Canva design.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

import { KNOWSIA_LOGO_PNG_BASE64 } from '@/lib/certificates/logo';
import {
  SIGNATURE_AIKINS_PNG_BASE64,
  SIGNATURE_BONNEY_PNG_BASE64,
} from '@/lib/certificates/signatures';

const PURPLE = rgb(75 / 255, 33 / 255, 168 / 255);
const ORANGE = rgb(244 / 255, 158 / 255, 32 / 255);
const INK = rgb(26 / 255, 26 / 255, 46 / 255);
const GREY = rgb(90 / 255, 90 / 255, 100 / 255);

export interface CertificatePdfData {
  certificateNumber: string;
  recipientName: string;
  courseTitle: string;
  description: string;
  hours: number;
  cpdCredit: string;
  issuedDate: string; // YYYY-MM-DD
  verifyUrl: string;
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Splits text into centered lines that fit maxWidth at the given size.
function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  widthOf: (t: string, s: number) => number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (widthOf(attempt, size) <= maxWidth || !current) {
      current = attempt;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateCertificatePdf(
  data: CertificatePdfData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Landscape A4.
  const page = doc.addPage([842, 595]);
  const { width, height } = page.getSize();

  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const centerX = width / 2;
  const y = (fromTop: number) => height - fromTop;
  const drawCentered = (
    text: string,
    fromTop: number,
    size: number,
    font = helvetica,
    color = INK,
  ) => {
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: centerX - textWidth / 2, y: y(fromTop), size, font, color });
  };

  // Outer purple border.
  page.drawRectangle({
    x: 28,
    y: 28,
    width: width - 56,
    height: height - 56,
    borderColor: PURPLE,
    borderWidth: 5,
  });

  // Brand logo top-left (real lockup, 740x270 source).
  const logoImage = await doc.embedPng(Buffer.from(KNOWSIA_LOGO_PNG_BASE64, 'base64'));
  const logoHeight = 44;
  const logoWidth = (740 / 270) * logoHeight;
  page.drawImage(logoImage, { x: 66, y: y(110), width: logoWidth, height: logoHeight });

  // Certificate number + QR code, top-right.
  const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, {
    margin: 0,
    width: 220,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  });
  const qrImage = await doc.embedPng(qrDataUrl);
  const numberWidth = helvetica.widthOfTextAtSize(data.certificateNumber, 10);
  page.drawText(data.certificateNumber, {
    x: width - 76 - numberWidth / 2 - 34,
    y: y(72),
    size: 10,
    font: helvetica,
    color: INK,
  });
  page.drawImage(qrImage, { x: width - 144, y: y(166), width: 78, height: 78 });

  // Headline.
  drawCentered('CERTIFICATE OF', 118, 30, bold);
  drawCentered('COMPETENCE', 152, 30, bold);

  drawCentered('This is to certify that', 218, 16, bold);

  // Recipient name — orange, uppercase-styled as provided.
  drawCentered(data.recipientName, 272, 30, bold, ORANGE);

  // Completion line with italic segment, centered as one unit.
  const preText = `has successfully completed ${data.hours} `;
  const italicText = 'hours of structured learning';
  const postText = ' and practical application on';
  const lineSize = 12;
  const totalWidth =
    helvetica.widthOfTextAtSize(preText, lineSize) +
    italic.widthOfTextAtSize(italicText, lineSize) +
    helvetica.widthOfTextAtSize(postText, lineSize);
  let cursorX = centerX - totalWidth / 2;
  page.drawText(preText, { x: cursorX, y: y(318), size: lineSize, font: helvetica, color: INK });
  cursorX += helvetica.widthOfTextAtSize(preText, lineSize);
  page.drawText(italicText, { x: cursorX, y: y(318), size: lineSize, font: italic, color: INK });
  cursorX += italic.widthOfTextAtSize(italicText, lineSize);
  page.drawText(postText, { x: cursorX, y: y(318), size: lineSize, font: helvetica, color: INK });

  // Course title — purple.
  drawCentered(data.courseTitle, 372, 20, bold, PURPLE);

  // Description, wrapped and centered (up to 3 lines).
  const descriptionLines = wrapText(
    data.description,
    width - 240,
    10.5,
    (t, s) => helvetica.widthOfTextAtSize(t, s),
  ).slice(0, 3);
  descriptionLines.forEach((line, index) => {
    drawCentered(line, 400 + index * 15, 10.5, helvetica, GREY);
  });

  // Issued date + CPD credit row.
  page.drawText(`Issued:  ${formatDate(data.issuedDate)}`, {
    x: 110,
    y: y(452),
    size: 12,
    font: helvetica,
    color: INK,
  });
  page.drawText(`CPD Credit:  ${data.cpdCredit}`, {
    x: 372,
    y: y(452),
    size: 12,
    font: helvetica,
    color: INK,
  });

  // Signatories with the supplied handwritten signatures directly above the
  // typeset names, as in the legacy design (no rule line).
  const isaacSignature = await doc.embedPng(
    Buffer.from(SIGNATURE_BONNEY_PNG_BASE64, 'base64'),
  );
  const stephenSignature = await doc.embedPng(
    Buffer.from(SIGNATURE_AIKINS_PNG_BASE64, 'base64'),
  );
  const signatory = (
    name: string,
    title: string,
    centerAt: number,
    signature: typeof isaacSignature,
  ) => {
    // pdf-lib's y is the image BOTTOM edge: the signature sits fully above
    // the name (baseline y(522)), flourishes reaching toward the Issued row.
    const signatureHeight = 52;
    const signatureWidth = signatureHeight * (signature.width / signature.height);
    page.drawImage(signature, {
      x: centerAt - signatureWidth / 2,
      y: y(509),
      width: signatureWidth,
      height: signatureHeight,
    });
    const nameWidth = bold.widthOfTextAtSize(name, 12);
    page.drawText(name, { x: centerAt - nameWidth / 2, y: y(522), size: 12, font: bold, color: INK });
    const titleWidth = helvetica.widthOfTextAtSize(title, 10);
    page.drawText(title, { x: centerAt - titleWidth / 2, y: y(537), size: 10, font: helvetica, color: GREY });
  };
  signatory('Isaac Adjin Bonney (CA,CPFA,CFIP)', 'Board Chair', 235, isaacSignature);
  signatory('Stephen Kwame Aikins, CA', 'Programme Director', 607, stephenSignature);

  // Verification footer.
  const verifyLine = `Verify: ${data.verifyUrl}`;
  const verifyWidth = helvetica.widthOfTextAtSize(verifyLine, 8);
  page.drawText(verifyLine, {
    x: centerX - verifyWidth / 2,
    y: 36,
    size: 8,
    font: helvetica,
    color: GREY,
  });

  return doc.save();
}
