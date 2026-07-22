// PIN hashing for the student portal (system review, 2026-07-22). Node's
// built-in scrypt rather than a new dependency — deliberately slow per-guess
// (memory-hard KDF), which matters more than usual given a PIN's tiny
// keyspace (paired with login lockout — see modules/portal/service.ts).
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const KEY_LENGTH = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(pin, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(':');
  if (!salt || !derivedHex) return false;
  const candidate = scryptSync(pin, salt, KEY_LENGTH);
  const expected = Buffer.from(derivedHex, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// Google Forms/CSV phone data commonly drops the leading 0 (same issue the
// bulk-import screen normalizes) — last 4 raw digits is still the initial
// PIN definition, taken from whatever phone digits exist.
export function lastFourDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}
