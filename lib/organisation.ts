// The legal entity behind Knowsia (founder confirmation, 2026-09-04).
//
// Printed on certificates, invoices, receipts and statements, and named as the
// data controller in the privacy policy. Earlier documents carried only the
// "Knowsia" wordmark; an issuing body needs its full name on anything a third
// party might rely on. One constant so the four documents can never disagree.
export const ORGANISATION_NAME = 'Knowsia Professional Institute';
export const ORGANISATION_LOCATION = 'Accra, Ghana';
export const ORGANISATION_LINE = `${ORGANISATION_NAME} · ${ORGANISATION_LOCATION}`;
// The one public contact address (founder decision 2026-09-04): printed on
// receipts and statements, shown in every portal's help footer, and used in
// the message templates. The old info.knowsia@gmail.com is retired.
export const ORGANISATION_EMAIL = 'info@knowsia.com';

// Phone numbers as they are spoken and as they are dialled. Every page that
// prints a number (home, contact, footers, tutorial recorder) reads these, so
// a changed number can never leave a stale copy behind.
export const ORGANISATION_PHONES = [
  { display: '053 053 1328', tel: '+233530531328' },
  { display: '020 370 1923', tel: '+233203701923' },
] as const;

const DEFAULT_WHATSAPP_URL = 'https://wa.me/233530531328';

/** WhatsApp chat link; NEXT_PUBLIC_CONTACT_WHATSAPP_URL overrides the default. */
export function whatsappUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL ?? '').trim();
  return raw || DEFAULT_WHATSAPP_URL;
}
