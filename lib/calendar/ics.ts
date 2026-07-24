// Minimal iCalendar (.ics) generator (system review, 2026-07-24) — a single
// VEVENT for a course's start, attached to the welcome email. Hand-rolled
// (same self-contained spirit as lib/certificates/pdf.ts) rather than
// pulling in a dependency for a format this small.
//
// Batches have no end_time or timezone column (see modules/courses — only
// start_date/start_time/end_date, all naive local values). Ghana/Africa-Accra
// is UTC+0 with no DST, so those naive values are treated directly as UTC
// wall-clock time — no conversion needed, and no invented schema either.
const DEFAULT_EVENT_DURATION_HOURS = 3;
const FOLD_LIMIT = 73; // characters per line before folding (RFC5545 §3.1, 75-octet limit with headroom)

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';

function pad2(value: string | undefined): string {
  return (value ?? '00').padStart(2, '0');
}

function combineDateTimeUtc(dateIso: string, timeIso: string): Date {
  const [hh, mm, ss] = timeIso.split(':');
  return new Date(`${dateIso}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}Z`);
}

function toIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

// Escapes text per RFC5545 §3.3.11 — backslash first, so the escapes added
// below aren't themselves re-escaped.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// RFC5545 §3.1 line folding: continuation lines are CRLF + a single leading
// space. Folds by character count rather than exact UTF-8 octets — an
// approximation, fine for the short ASCII-heavy text this generates.
function foldIcsLine(line: string): string {
  if (line.length <= FOLD_LIMIT) return line;
  const parts: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const chunkSize = first ? FOLD_LIMIT : FOLD_LIMIT - 1;
    parts.push((first ? '' : ' ') + rest.slice(0, chunkSize));
    rest = rest.slice(chunkSize);
    first = false;
  }
  return parts.join('\r\n');
}

export interface CourseIcsParams {
  registrationId: string;
  courseName: string;
  cohortLabel: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM or HH:MM:SS
  endDate: string; // YYYY-MM-DD
  facilitatorName: string;
  zoomLink: string | null;
}

export interface IcsEmailAttachment {
  filename: string;
  content: string; // base64
  contentType: string;
}

export function buildCourseIcsAttachment(params: CourseIcsParams): IcsEmailAttachment {
  const start = combineDateTimeUtc(params.startDate, params.startTime);
  const end = new Date(start.getTime() + DEFAULT_EVENT_DURATION_HOURS * 60 * 60 * 1000);

  const summary = `${params.courseName} — ${params.cohortLabel}`;
  const description = [
    `Facilitator: ${params.facilitatorName}`,
    `This course runs through ${params.endDate}.`,
    `Check your student portal for the full schedule and Zoom link: ${APP_URL()}/portal/login`,
  ].join('\n');
  const location = params.zoomLink ?? 'Online — Zoom link to follow';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Knowsia//Course Registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.registrationId}@reg.knowsia.com`,
    `DTSTAMP:${toIcsUtcStamp(new Date())}`,
    `DTSTART:${toIcsUtcStamp(start)}`,
    `DTEND:${toIcsUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  const icsText = `${lines.map(foldIcsLine).join('\r\n')}\r\n`;

  return {
    filename: 'course-invite.ics',
    content: Buffer.from(icsText, 'utf-8').toString('base64'),
    contentType: 'text/calendar; charset=utf-8; method=REQUEST',
  };
}
