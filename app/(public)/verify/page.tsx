'use client';

// Verification landing page: employers who type reg.knowsia.com/verify
// (without a certificate number) get a lookup box instead of a 404. The QR
// code and printed links go straight to /verify/<number>.
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function VerifyLandingPage() {
  const router = useRouter();
  const [certificateNumber, setCertificateNumber] = useState('');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = certificateNumber.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) return;
    router.push(`/verify/${encodeURIComponent(normalized)}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <div className="rounded-xl border-4 border-[#4B21A8] p-8 text-center">
        <p className="text-2xl font-bold">
          knowsia<span className="text-[#F49E20]">.</span>
        </p>
        <h1 className="mt-2 text-lg font-semibold uppercase tracking-wide">
          Certificate Verification
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Enter the certificate number printed on the certificate (for example{' '}
          <span className="font-mono">KNS-AI01-2026-0067</span>), or scan the QR code on the
          certificate itself.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-left">
          <div className="space-y-2">
            <Label htmlFor="certificateNumber">Certificate number</Label>
            <Input
              id="certificateNumber"
              required
              autoFocus
              placeholder="KNS-AI01-2026-0067"
              className="font-mono uppercase"
              value={certificateNumber}
              onChange={(event) => setCertificateNumber(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Verify certificate
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Knowsia — practical professional training ·{' '}
        <a href="/register" className="font-medium text-[#4B21A8] underline">
          View our courses → reg.knowsia.com/register
        </a>
      </p>
    </main>
  );
}
