'use client';

// Corporate portal login (2026-07-26) — billing email + 4-digit PIN. On
// success, forced to /company-portal/change-pin if this is a first-time
// (phone-derived) PIN, otherwise straight to the dashboard. Mirrors
// app/(public)/portal/login/page.tsx exactly, scoped to a company instead.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export default function CompanyPortalLoginPage() {
  const router = useRouter();
  const [billingEmail, setBillingEmail] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ mustChangePin: boolean }>('/api/company-portal/login', {
        method: 'POST',
        body: JSON.stringify({ billingEmail, pin }),
      });
      router.push(result.mustChangePin ? '/company-portal/change-pin' : '/company-portal');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Corporate Portal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Log in with your billing email and PIN to manage your company&rsquo;s seats,
        employees, and invoices.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {errorMessage && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="billingEmail">Billing Email</Label>
          <Input
            id="billingEmail"
            required
            type="email"
            autoComplete="username"
            className="h-11"
            value={billingEmail}
            onChange={(event) => setBillingEmail(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pin">PIN</Label>
          <Input
            id="pin"
            required
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="current-password"
            placeholder="4 digits"
            className="h-11"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <p className="text-xs text-muted-foreground">
            First time logging in? Your PIN is the last 4 digits of your billing phone number.
          </p>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={submitting || pin.length !== 4}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  );
}
