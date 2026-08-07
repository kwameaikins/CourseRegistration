'use client';

// Standalone coupon codes (2026-08-07) — marketing discounts with no partner
// attribution and no commission. The affiliate programme's codes live on
// /partners; these are deliberately a separate catalogue.
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate, formatGhs } from '@/lib/utils';
import { COUPON_DISCOUNT_TYPES } from '@/modules/coupons/types';

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discountType: 'percentage' | 'fixed_amount';
  discountValue: number;
  appliesToCourseId: string | null;
  maxUses: number | null;
  usesCount: number;
  onePerParticipant: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  redemptionCount: number;
}

interface CourseOption {
  id: string;
  courseName: string;
}

const EMPTY_FORM = {
  code: '',
  description: '',
  discountType: 'percentage' as (typeof COUPON_DISCOUNT_TYPES)[number],
  discountValue: '',
  appliesToCourseId: '',
  maxUses: '',
  expiresAt: '',
};

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await apiFetch<{ coupons: CouponRow[] }>('/api/coupons');
      setCoupons(result.coupons);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load coupons.');
    }
  }, []);

  useEffect(() => {
    void reload();
    void apiFetch<{ courses: CourseOption[] }>('/api/courses')
      .then((result) => setCourses(result.courses))
      .catch(() => {
        // Course scoping is optional — the form still works without the list.
      });
  }, [reload]);

  function flashStatus(message: string) {
    setStatusMessage(message);
    setErrorMessage(null);
    setTimeout(() => setStatusMessage(null), 4000);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code,
          description: form.description || null,
          discountType: form.discountType,
          discountValue: form.discountValue,
          appliesToCourseId: form.appliesToCourseId || null,
          maxUses: form.maxUses || null,
          expiresAt: form.expiresAt || null,
          onePerParticipant: true,
        }),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      flashStatus('Coupon created.');
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create coupon.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(coupon: CouponRow) {
    try {
      await apiFetch(`/api/coupons/${coupon.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      flashStatus(coupon.isActive ? `${coupon.code} deactivated.` : `${coupon.code} reactivated.`);
      await reload();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update coupon.');
    }
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Marketing discount codes. These carry no partner attribution and never pay commission —
            for referral codes, use Partners &amp; Coupons.
          </p>
        </div>
        <Button onClick={() => setShowForm((visible) => !visible)}>+ New Coupon</Button>
      </div>

      {statusMessage && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{statusMessage}</p>
      )}
      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Coupon</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  required
                  placeholder="NEWYEAR25"
                  value={form.code}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountType">Type</Label>
                <select
                  id="discountType"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.discountType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      discountType: event.target.value as typeof form.discountType,
                    })
                  }
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed amount</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discountValue">
                  {form.discountType === 'percentage' ? 'Percent off' : 'Amount off (GHS)'}
                </Label>
                <Input
                  id="discountValue"
                  required
                  type="number"
                  min="1"
                  max={form.discountType === 'percentage' ? '100' : undefined}
                  step="0.01"
                  value={form.discountValue}
                  onChange={(event) => setForm({ ...form, discountValue: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appliesToCourseId">Course</Label>
                <select
                  id="appliesToCourseId"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.appliesToCourseId}
                  onChange={(event) =>
                    setForm({ ...form, appliesToCourseId: event.target.value })
                  }
                >
                  <option value="">All courses</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.courseName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUses">Max uses</Label>
                <Input
                  id="maxUses"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={form.maxUses}
                  onChange={(event) => setForm({ ...form, maxUses: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expires</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={form.expiresAt}
                  onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create coupon'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Discount</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {coupons.map((coupon) => (
            <TableRow key={coupon.id}>
              <TableCell className="font-medium">{coupon.code}</TableCell>
              <TableCell>
                {coupon.discountType === 'percentage'
                  ? `${coupon.discountValue}% off`
                  : `${formatGhs(coupon.discountValue)} off`}
              </TableCell>
              <TableCell>
                {coupon.appliesToCourseId
                  ? (courses.find((course) => course.id === coupon.appliesToCourseId)?.courseName ??
                    'One course')
                  : 'All courses'}
              </TableCell>
              <TableCell>
                {coupon.redemptionCount}
                {coupon.maxUses !== null ? ` / ${coupon.maxUses}` : ''}
              </TableCell>
              <TableCell>{coupon.expiresAt ? formatDate(coupon.expiresAt) : '—'}</TableCell>
              <TableCell>
                {coupon.isActive ? (
                  <Badge variant="secondary">Active</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => toggleActive(coupon)}>
                  {coupon.isActive ? 'Deactivate' : 'Reactivate'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {coupons.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-sm text-muted-foreground">
                No coupons yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
