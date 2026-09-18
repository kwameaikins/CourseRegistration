// The legal entity behind Knowsia (founder confirmation, 2026-09-04).
//
// Printed on certificates, invoices, receipts and statements, and named as the
// data controller in the privacy policy. Earlier documents carried only the
// "Knowsia" wordmark; an issuing body needs its full name on anything a third
// party might rely on. One constant so the four documents can never disagree.
export const ORGANISATION_NAME = 'Knowsia Professional Institute';
// Country, not city (founder correction, 2026-09-07). Knowsia is an online
// institution and has no Accra office; "Accra, Ghana" was printed on every
// certificate, invoice, receipt and statement, and asserted as a postal
// locality in the homepage's schema.org markup. Ghana is true and keeps the
// issuing body identifiable on documents a third party relies on. Anything
// that needs a city needs a registered address first.
export const ORGANISATION_LOCATION = 'Ghana';
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

// How to pay us (2026-09-18). Until now these lived as private constants in
// modules/communications/default-templates.ts and nowhere else; the
// registration invoice (lib/registrations/invoice-pdf.ts) prints the same
// details, and two copies of a bank account number is how one of them goes
// stale. The templates now read from here too.
//
// Business MoMo account registered as "Knowsia Professional Institute"
// (founder-provided 2026-09-03). Bank details are the interim ones the
// founder gave on 2026-08-01, "for now" — confirm before treating as
// permanent.
export const PAYMENT_DETAILS = {
  momoNumber: '0559136464',
  momoMerchantCode: '354542',
  momoAccountName: ORGANISATION_NAME,
  bankName: 'Zenith Bank',
  bankAccountName: 'Noohra Business Consult',
  bankAccountNumber: '0006012704149',
  bankBranch: 'Koforidua, Ghana',
} as const;
