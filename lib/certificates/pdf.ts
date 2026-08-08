// Certificate PDF generator (founder-approved 2026-07-19, recolored
// 2026-07-26 to the real Knowsia brand palette). Replicates the Knowsia
// "Certificate of Competence" design (navy border, orange name, navy course
// title, QR-coded verification) in code with pdf-lib — generated on demand
// from the registry row, no file storage.
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
import { wrapText } from '@/lib/pdf-text';

const NAVY = rgb(30 / 255, 58 / 255, 138 / 255);
const ORANGE = rgb(244 / 255, 158 / 255, 32 / 255);
const INK = rgb(26 / 255, 26 / 255, 46 / 255);
const GREY = rgb(90 / 255, 90 / 255, 100 / 255);

export interface CertificatePdfData {
  certificateNumber: string;
  recipientName: string;
  courseTitle: string;
  description: string;
  hours: number;
  // No cpdCredit: the certificate stopped printing courses.cpd_credit on
  // 2026-08-08 and states CPD hours from `hours` instead. The column is
  // still written on the certificates row and still served by the public
  // catalog API — it is just not on the printed certificate any more.
  issuedDate: string; // YYYY-MM-DD
  verifyUrl: string;
  // Who facilitated the cohort (2026-08-08). Optional: certificates issued
  // before this existed have none recorded, and the batch's CURRENT
  // facilitator is not evidence of who taught that cohort — so they render
  // without the attribution line rather than asserting something unverified.
  facilitatorName?: string | null;
}

// Where the course title sits, which depends on whether an attribution line
// follows it. The 16pt shift is taken from the gap ABOVE the title, never
// from below — see the drawing code for why the description must not move.
export const COURSE_TITLE_TOP = 372;
export const COURSE_TITLE_TOP_WITH_FACILITATOR = 356;
export const FACILITATOR_LINE_TOP = 380;
export const DESCRIPTION_TOP = 400;

// The attribution line, or null when there is nothing worth printing.
//
// Pure and exported so the "no facilitator recorded" cases can be asserted
// directly. They were originally tested by comparing rendered PDF byte
// lengths, which turned out to vary by a byte between otherwise identical
// renders and produced an intermittent failure roughly one run in four.
//
// A blank or whitespace-only facilitator_name must yield null, not an empty
// attribution: batches.facilitator_name is free text, and a dangling
// "Facilitated by" with nothing after it would be worse than omitting it.
export function facilitatorAttribution(
  facilitatorName: string | null | undefined,
): string | null {
  const trimmed = facilitatorName?.trim();
  return trimmed ? `Facilitated by ${trimmed}` : null;
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
    borderColor: NAVY,
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

  // Course title — navy.
  //
  // Sits 16pt higher than it did before 2026-08-08 to open room for the
  // facilitator attribution below it. The space is taken from the generous
  // gap above the title (the completion line at 318 still clears it by
  // ~24pt), deliberately NOT from below: pushing the description down would
  // erode its clearance to the Issued/CPD row at 452, and that row cannot
  // move because the signature images begin at 457. This way a full 3-line
  // description keeps exactly the ~9pt clearance it had before.
  const attribution = facilitatorAttribution(data.facilitatorName);
  drawCentered(
    data.courseTitle,
    attribution ? COURSE_TITLE_TOP_WITH_FACILITATOR : COURSE_TITLE_TOP,
    20,
    bold,
    NAVY,
  );

  // Facilitator attribution — italic navy, directly under the course title so
  // it reads as part of the certification statement rather than as filing
  // metadata down in the Issued/CPD row.
  if (attribution) {
    drawCentered(attribution, FACILITATOR_LINE_TOP, 11, italic, NAVY);
  }

  // Description, wrapped and centered (up to 3 lines). Position unchanged by
  // the attribution above — see the course title comment.
  const descriptionLines = wrapText(
    data.description,
    width - 240,
    10.5,
    (t, s) => helvetica.widthOfTextAtSize(t, s),
  ).slice(0, 3);
  descriptionLines.forEach((line, index) => {
    drawCentered(line, DESCRIPTION_TOP + index * 15, 10.5, helvetica, GREY);
  });

  // Issued date + CPD credit row.
  page.drawText(`Issued:  ${formatDate(data.issuedDate)}`, {
    x: 110,
    y: y(452),
    size: 12,
    font: helvetica,
    color: INK,
  });
  // CPD hours, taken from the same `hours` the completion line above states
  // (founder request 2026-08-08). This replaced a free-text "CPD Credit"
  // line fed by courses.cpd_credit, which defaulted to the literal string
  // 'TBD' and so printed "CPD Credit: TBD" on any course where nobody had
  // filled it in. The hours are always present and always correct.
  //
  // courses.cpd_credit itself is untouched — the public course catalog API
  // still publishes it to the marketing site.
  page.drawText(`CPD Hours:  ${data.hours}`, {
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
