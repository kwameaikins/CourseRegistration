'use client';

// Forced-on-first-login PIN change (system review, 2026-07-22) — also
// reachable any time later to change PIN voluntarily.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KnowsiaHeader } from '@/components/KnowsiaHeader';

export default function PortalChangePinPage() {
  const router = useRouter();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrorMessage(null);
    if (newPin !== confirmPin) {
      setErrorMessage('The new PIN and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/portal/change-pin', {
        method: 'POST',
        body: JSON.stringify({ currentPin, newPin }),
      });
      router.push('/portal');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to change PIN.';
      setErrorMessage(message);
      if (message.includes('signed in') || message.includes('expired')) {
        router.push('/portal/login');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <KnowsiaHeader />
      <h1 className="mt-6 text-2xl font-semibold">Change Your PIN</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        For security, please set a new 4-digit PIN before continuing.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {errorMessage && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="currentPin">Current PIN</Label>
          <Input
            id="currentPin"
            required
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={currentPin}
            onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPin">New PIN (4 digits)</Label>
          <Input
            id="newPin"
            required
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={newPin}
            onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPin">Confirm New PIN</Label>
          <Input
            id="confirmPin"
            required
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={confirmPin}
            onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={submitting || currentPin.length !== 4 || newPin.length !== 4}
        >
          {submitting ? 'Saving…' : 'Save New PIN'}
        </Button>
      </form>
    </main>
  );
}
