// A batch's registrants as the study app's admin reads them (slice A of "live training in the
// study app", 2026-11-07). Pure shaping only: the read itself is
// registrationsRepository.selectBatchRegistrantsSystem.

export type BatchRegistrantRow = {
  registration: {
    id: string;
    registration_status: string;
    registered_at: string;
    lapsed_at: string | null;
  };
  participant: { full_name: string; email: string; phone: string } | null;
  payment: {
    payment_status: string;
    course_fee: number | string | null;
    amount_paid: number | string | null;
    balance: number | string | null;
  } | null;
};

export type BatchRegistrant = {
  registrationId: string;
  fullName: string;
  email: string;
  phone: string;
  registrationStatus: string;
  paymentStatus: string;
  courseFee: number;
  amountPaid: number;
  balance: number;
  registeredAt: string;
  lapsed: boolean;
};

export function shapeBatchRegistrants(rows: BatchRegistrantRow[]): BatchRegistrant[] {
  return rows.map((row) => ({
    registrationId: row.registration.id,
    fullName: row.participant?.full_name ?? '',
    email: row.participant?.email ?? '',
    phone: row.participant?.phone ?? '',
    registrationStatus: row.registration.registration_status,
    // No payment row yet means nothing has been paid.
    paymentStatus: row.payment?.payment_status ?? 'Unpaid',
    courseFee: Number(row.payment?.course_fee ?? 0),
    amountPaid: Number(row.payment?.amount_paid ?? 0),
    balance: Number(row.payment?.balance ?? 0),
    registeredAt: row.registration.registered_at,
    lapsed: row.registration.lapsed_at !== null,
  }));
}
