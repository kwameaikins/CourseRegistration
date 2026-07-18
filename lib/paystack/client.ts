import crypto from 'crypto';

// BR-13: HMAC-SHA512 of the RAW request body — parsing and re-stringifying
// the body before validation would produce a different hash and reject every
// legitimate webhook (Document 4, BR-13).
export function isValidPaystackSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    // Length mismatch throws in timingSafeEqual — treat as invalid signature.
    return false;
  }
}

// ⚠️ Paystack amounts are in pesewas/kobo — the smallest currency unit.
// GHS 1,200.00 arrives as 120000 (Document 5, Section 7).
export function pesewasToGhs(amountInPesewas: number): number {
  return Math.round(amountInPesewas) / 100;
}

export function ghsToPesewas(amountInGhs: number): number {
  return Math.round(amountInGhs * 100);
}
