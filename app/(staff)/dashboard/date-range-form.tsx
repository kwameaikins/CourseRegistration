'use client';

import { useRouter, useSearchParams } from 'next/navigation';

import { DateRangeFilter, type DateRange } from '@/components/ui/date-range-filter';

// The dashboard is a server component that computes everything per request, so
// its range lives in the URL rather than in React state: it survives a refresh,
// can be bookmarked, and can be pasted to a colleague who then sees the same
// numbers. Changing the range just re-navigates and the server recomputes.
export function DashboardDateRangeForm({ value }: { value: DateRange }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function apply(range: DateRange) {
    const params = new URLSearchParams(searchParams.toString());
    if (range.dateFrom) params.set('dateFrom', range.dateFrom);
    else params.delete('dateFrom');
    if (range.dateTo) params.set('dateTo', range.dateTo);
    else params.delete('dateTo');
    const query = params.toString();
    router.push(query ? `/dashboard?${query}` : '/dashboard');
  }

  return <DateRangeFilter value={value} onChange={apply} label="Registered" />;
}
