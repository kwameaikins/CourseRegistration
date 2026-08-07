'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface DateRange {
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_DATE_RANGE: DateRange = { dateFrom: '', dateTo: '' };

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoMonthStart(): string {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

// Ghana runs on UTC, so a plain UTC date needs no timezone juggling here.
const PRESETS: Array<{ label: string; range: () => DateRange }> = [
  { label: 'Last 7 days', range: () => ({ dateFrom: isoDaysAgo(6), dateTo: isoToday() }) },
  { label: 'Last 30 days', range: () => ({ dateFrom: isoDaysAgo(29), dateTo: isoToday() }) },
  { label: 'This month', range: () => ({ dateFrom: isoMonthStart(), dateTo: isoToday() }) },
];

// Shared date-range control for every staff list and report.
//
// Deliberately a controlled component with no fetching of its own: every screen
// that uses it must pass the range to the SERVER, because these lists are all
// capped (registrations 200/page, leads 500, certificates N). Filtering a
// capped list in the browser only filters the rows that survived the cap —
// which is how the Payments screen came to show 8 of 35 outstanding balances
// on 2026-08-06.
export function DateRangeFilter({
  value,
  onChange,
  label = 'Date range',
  className = '',
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
  label?: string;
  className?: string;
}) {
  const hasRange = Boolean(value.dateFrom || value.dateTo);
  const invalid = Boolean(value.dateFrom && value.dateTo && value.dateFrom > value.dateTo);

  return (
    <div className={`flex flex-wrap items-end gap-2 ${className}`}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="date-range-from">
          {label} — from
        </label>
        <Input
          id="date-range-from"
          type="date"
          className="h-9 w-40"
          value={value.dateFrom}
          max={value.dateTo || undefined}
          onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground" htmlFor="date-range-to">
          to
        </label>
        <Input
          id="date-range-to"
          type="date"
          className="h-9 w-40"
          value={value.dateTo}
          min={value.dateFrom || undefined}
          onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
        />
      </div>

      {PRESETS.map((preset) => (
        <Button
          key={preset.label}
          type="button"
          variant="outline"
          className="h-9"
          onClick={() => onChange(preset.range())}
        >
          {preset.label}
        </Button>
      ))}

      {hasRange && (
        <Button
          type="button"
          variant="ghost"
          className="h-9"
          onClick={() => onChange(EMPTY_DATE_RANGE)}
        >
          Clear dates
        </Button>
      )}

      {invalid && (
        <p className="w-full text-sm text-red-600">
          &ldquo;From&rdquo; is after &ldquo;to&rdquo; — no rows can match this range.
        </p>
      )}
    </div>
  );
}

// Appends the range to a query string, omitting empty bounds. Every caller
// should build its request through this so the parameter names stay identical
// across screens (the API filter schemas all use dateFrom / dateTo).
export function appendDateRange(params: URLSearchParams, range: DateRange): URLSearchParams {
  if (range.dateFrom) params.set('dateFrom', range.dateFrom);
  if (range.dateTo) params.set('dateTo', range.dateTo);
  return params;
}
