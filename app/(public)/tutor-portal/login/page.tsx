'use client';

// Tutor portal login (2026-07-27) — email + 4-digit PIN. On success, forced
// to /tutor-portal/change-pin if this is a first-time (phone-derived) PIN,
// otherwise straight to the dashboard. Mirrors
// app/(public)/company-portal/login/page.tsx exactly, scoped to a tutor
// instead.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export default function TutorPortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<{ mustChangePin: boolean }>('/api/tutor-portal/login', {
        method: 'POST',
        body: JSON.stringify({ email, pin }),
      });
      router.push(result.mustChangePin ? '/tutor-portal/change-pin' : '/tutor-portal');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Tutor Portal</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Log in with your email and PIN to view your teaching schedule, class rosters,
        attendance, and certificate-eligible students.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {errorMessage && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            required
            type="email"
            autoComplete="username"
            className="h-11"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            First time logging in? Your PIN is the last 4 digits of your mobile number.
          </p>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={submitting || pin.length !== 4}>
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </main>
  );
}
