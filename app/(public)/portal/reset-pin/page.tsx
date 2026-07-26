'use client';

// Forgot-PIN self-service, step 2 (2026-07-26) — reads the single-use token
// from the URL (mailed by /portal/forgot-pin), lets the participant set a
// new PIN. Also clears any account lockout (modules/portal/service.ts's
// resetPin), so this doubles as the locked-out-account recovery path.
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

function ResetPinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPin, setNewPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/portal/reset-pin', {
        method: 'POST',
        body: JSON.stringify({ token, newPin }),
      });
      router.push('/portal/login');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not reset your PIN.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <p className="mt-6 rounded-md bg-destructive/10 p-4 text-sm text-destructive">
        This reset link is missing its token. Please request a new one.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-4">
      {errorMessage && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="newPin">New PIN</Label>
        <Input
          id="newPin"
          required
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoComplete="new-password"
          placeholder="4 digits"
          className="h-11"
          value={newPin}
          onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
        />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={submitting || newPin.length !== 4}>
        {submitting ? 'Saving…' : 'Set new PIN'}
      </Button>
    </form>
  );
}

export default function ResetPinPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Set a new PIN</h1>
      <Suspense>
        <ResetPinForm />
      </Suspense>
      <p className="mt-6 text-center text-sm">
        <Link href="/portal/login" className="text-primary underline-offset-2 hover:underline">
          Back to login
        </Link>
      </p>
    </main>
  );
}
