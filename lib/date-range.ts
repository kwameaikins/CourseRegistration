import { AppError } from '@/lib/errors';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRangeFilterValues {
  dateFrom?: string;
  dateTo?: string;
}

// Parses ?dateFrom=&dateTo= for the staff list endpoints.
//
// Every screen's range ends up here so the parameter names and validation stay
// identical across them, and so a malformed date is a 400 rather than silently
// becoming an unfiltered "show me everything" — which on a capped list reads as
// a complete answer when it is not.
export function parseDateRange(searchParams: URLSearchParams): DateRangeFilterValues {
  const dateFrom = searchParams.get('dateFrom') ?? undefined;
  const dateTo = searchParams.get('dateTo') ?? undefined;

  if ((dateFrom && !ISO_DATE.test(dateFrom)) || (dateTo && !ISO_DATE.test(dateTo))) {
    throw new AppError('VALIDATION_ERROR', 'Dates must be formatted YYYY-MM-DD.', 400);
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AppError('VALIDATION_ERROR', '"dateFrom" must not be after "dateTo".', 400);
  }
  return { dateFrom, dateTo };
}

// Inclusive UTC bounds for a Postgres timestamptz column. dateTo names a
// calendar day, so it has to cover that whole day rather than stopping at its
// opening midnight — otherwise "1st to 5th" silently drops the 5th.
export function timestampBounds(range: DateRangeFilterValues): {
  gte?: string;
  lte?: string;
} {
  return {
    gte: range.dateFrom ? `${range.dateFrom}T00:00:00Z` : undefined,
    lte: range.dateTo ? `${range.dateTo}T23:59:59.999Z` : undefined,
  };
}
