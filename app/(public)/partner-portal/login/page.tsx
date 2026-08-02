'use client';

// Partner portal login (Knowsia Growth Partner Programme, 2026-08-02) —
// phone + 4-digit PIN. Mirrors app/(public)/company-portal/login/page.tsx
// exactly, scoped to a partner instead. Not for tutor-category partners —
// they use their existing tutor-portal login (see modules/partners/service.ts's
// loginToPartnerPortal, which rejects category='tutor').
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export default function PartnerPortalLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ mustChangePin: boolean }>('/api/partner-portal/login', {
        method: 'POST',
        body: JSON.stringify({ phone, pin }),
      });
      router.push(result.mustChangePin ? '/partner-portal/change-pin' : '/partner-portal');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Partner Portal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Log in with your phone number and PIN to track your referrals, codes, and commissions.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {errorMessage && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            required
            type="tel"
            autoComplete="username"
            className="h-11"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
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
            First time logging in? Your PIN is the last 4 digits of your phone number.
          </p>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={submitting || pin.length !== 4}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  );
}
