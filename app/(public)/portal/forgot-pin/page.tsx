'use client';

// Forgot-PIN self-service (2026-07-26) — always shows the same success
// message regardless of whether the identifier matched an account (see
// modules/portal/service.ts's requestPinReset), so this screen never reveals
// whether an email/phone number has a portal account.
import { useState } from 'react';
import Link from 'next/link';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export default function ForgotPinPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);
    try {
      await apiFetch('/api/portal/forgot-pin', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setSent(true);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Reset your PIN</h1>

      {sent ? (
        <p className="mt-6 rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">
          If an account exists for that email or mobile number, we&apos;ve sent a link to reset
          your PIN. Check your email — the link works once and expires in 15 minutes.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the email or mobile number you registered with, and we&apos;ll email you a
            link to set a new PIN.
          </p>
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {errorMessage && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="identifier">Email or Mobile Number</Label>
              <Input
                id="identifier"
                required
                autoComplete="username"
                className="h-11"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm">
        <Link href="/portal/login" className="text-primary underline-offset-2 hover:underline">
          Back to login
        </Link>
      </p>
    </main>
  );
}
