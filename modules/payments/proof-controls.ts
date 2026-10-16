// Payment-proof controls (founder-requested 2026-10-16). Pure rules, tested
// on their own; payments/service.ts applies them when a proof arrives and when
// finance reviews it.
//
// Why: in a deliberate test the founder paid GH₵ 2 by Paystack MoMo, then sent
// that same MoMo SMS as a "MoMo transfer" proof, and it was approved — the
// balance counted the money twice. Paystack does not pass the telco's own
// reference to us, so "is this reference known?" alone cannot catch that. The
// controls work together:
//
// 1. a reference is required, and can be claimed once, ever (any participant,
//    any proof or recorded payment) — the database enforces it for proofs;
// 2. the same slip file twice is refused (cheap; a re-scan defeats it);
// 3. a proof matching a Paystack payment on the same registration (same
//    amount, within 3 days) is FLAGGED — shown in the alert email and the
//    review queue, and approving it needs a written reason;
// 4. every approval needs "I found this on our MoMo / bank statement" — the
//    control no screenshot can forge, since a Paystack MoMo charge goes to
//    Paystack, never into Knowsia's own wallet.

export const PAYSTACK_MATCH_DAYS = 3;
export const MIN_REFERENCE_LENGTH = 4;

export type ProofFlag = {
  kind: 'paystack_match';
  /** The Paystack payment it may duplicate. */
  reference: string | null;
  amount: number;
  at: string;
};

/** Upper case, letters and digits only — "MP 2610.16-ABC" and "mp261016abc" are one reference. */
export function normalizeReference(raw: string | null | undefined): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The forms a reference may have been stored in elsewhere (as typed, and normalised). */
export function referenceCandidates(raw: string | null | undefined): string[] {
  const typed = (raw ?? '').trim();
  const norm = normalizeReference(raw);
  return [...new Set([typed, norm].filter((v) => v.length > 0))];
}

/** Paystack payments on this registration that a proof may simply repeat. */
export function paystackMatchFlags(
  proof: { amount: number; paymentDate: string },
  paystack: Array<{ amount: number | string; transaction_id: string | null; recorded_at: string }>,
): ProofFlag[] {
  // Calendar days (Ghana is UTC+0): the proof's date is a day, not a moment.
  const dayOf = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000;
  const proofDay = dayOf(proof.paymentDate);
  return paystack
    .filter((p) => Math.round(Number(p.amount) * 100) === Math.round(proof.amount * 100))
    .filter((p) => Math.abs(dayOf(p.recorded_at) - proofDay) <= PAYSTACK_MATCH_DAYS)
    .map((p) => ({ kind: 'paystack_match' as const, reference: p.transaction_id, amount: Number(p.amount), at: p.recorded_at }));
}

/** One sentence per flag, for the alert email and the review screen. */
export function flagWords(flags: ProofFlag[]): string[] {
  return flags.map((f) =>
    `Possible duplicate: a Paystack payment of GH₵ ${f.amount.toFixed(2)} on ${f.at.slice(0, 10)}` +
    `${f.reference ? ` (${f.reference})` : ''} already covers this registration.`,
  );
}

export function asFlags(value: unknown): ProofFlag[] {
  return Array.isArray(value) ? (value.filter((f) => f && typeof f === 'object' && (f as ProofFlag).kind === 'paystack_match') as ProofFlag[]) : [];
}
