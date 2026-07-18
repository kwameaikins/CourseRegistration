import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Class-name join helper used by the Shadcn UI components.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// All monetary values are GHS with two decimal places (Document 5, Section 1).
export function formatGhs(amount: number): string {
  return `GHS ${amount.toLocaleString('en-GH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Early-registration discount (Document 5 addendum, 2026-07-18): the
// discounted fee applies through and including the cutoff date, compared as
// ISO date strings so no timezone conversion is involved. Shared between the
// server (fee copied onto the Payment at registration) and the public form
// (fee preview) so both always agree on today's effective price.
export function effectiveCourseFee(
  batch: { courseFee: number; discountCutoffDate: string | null; discountedFee: number | null },
  todayIso: string = new Date().toISOString().slice(0, 10),
): number {
  if (
    batch.discountCutoffDate !== null &&
    batch.discountedFee !== null &&
    todayIso <= batch.discountCutoffDate
  ) {
    return batch.discountedFee;
  }
  return batch.courseFee;
}
