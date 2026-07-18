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
