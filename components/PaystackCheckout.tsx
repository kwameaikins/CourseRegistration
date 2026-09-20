'use client';

// Paystack checkout initialisation (Document 7, Section 1.1).
//
// Two doors, one button (Doc 25 §1, decision 3). With CORE_CHECKOUT=1 the
// server asks Knowsia Core for an access code — Core quotes the batch's SKU
// through the catalogue, initialises with Paystack and records the reference
// and the amount — and the browser RESUMES that transaction in Paystack's
// inline v2, so the amount never comes from the client. Off, or when Core
// cannot answer, the old inline v1 flow runs exactly as before.
//
// ⚠️ metadata.registration_id is NOT optional on either door — it is the
// webhook's only reliable key for matching a payment to a Registration
// (EC-02). Core's checkout carries it in the metadata it sends to Paystack.
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface PaystackPopV1 {
  setup(config: Record<string, unknown>): { openIframe(): void };
}

interface PaystackPopV2 {
  resumeTransaction(accessCode: string, callbacks?: { onSuccess?: (t: { reference: string }) => void; onCancel?: () => void }): void;
}

declare global {
  interface Window {
    PaystackPop?: PaystackPopV1 & (new () => PaystackPopV2);
  }
}

const PAYSTACK_INLINE_V1 = 'https://js.paystack.co/v1/inline.js';
const PAYSTACK_INLINE_V2 = 'https://js.paystack.co/v2/inline.js';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`) && window.PaystackPop) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => (window.PaystackPop ? resolve() : reject(new Error('Paystack failed to initialise.')));
    script.onerror = () => reject(new Error('Could not load the Paystack checkout.'));
    document.body.appendChild(script);
  });
}

export function PaystackCheckout(props: {
  registrationId: string;
  participantEmail: string;
  amountGhs: number;
  // Reference is the same value sent to Paystack as `ref` — the caller can
  // use it to exchange for a portal login token once the webhook confirms
  // payment (founder-approved 2026-07-22 auto-login).
  onCompleted: (reference: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function coreAccessCode(): Promise<{ accessCode: string; reference: string } | null> {
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationId: props.registrationId }),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { data?: { enabled?: boolean; accessCode?: string; reference?: string } };
      const data = body.data ?? (body as { enabled?: boolean; accessCode?: string; reference?: string });
      if (data?.enabled && data.accessCode && data.reference) return { accessCode: data.accessCode, reference: data.reference };
      return null;
    } catch {
      return null;
    }
  }

  async function handlePay() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const core = await coreAccessCode();
      if (core) {
        await loadScript(PAYSTACK_INLINE_V2);
        const Pop = window.PaystackPop as unknown as new () => PaystackPopV2;
        new Pop().resumeTransaction(core.accessCode, {
          onSuccess: (t) => props.onCompleted(t?.reference ?? core.reference),
          onCancel: () => setLoading(false),
        });
        return;
      }
      await loadScript(PAYSTACK_INLINE_V1);
      const paystack = window.PaystackPop as unknown as PaystackPopV1;
      const reference = `REG-${props.registrationId}-${Date.now()}`; // unique per attempt
      const handler = paystack.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email: props.participantEmail,
        // GHS to pesewas conversion (Document 7, Section 1.1).
        amount: Math.round(props.amountGhs * 100),
        currency: 'GHS',
        ref: reference,
        metadata: {
          registration_id: props.registrationId, // REQUIRED — webhook match key
        },
        channels: ['card', 'mobile_money'], // Paystack Card + MTN MoMo
        callback: () => {
          props.onCompleted(reference);
        },
        onClose: () => {
          setLoading(false);
        },
      });
      handler.openIframe();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Checkout failed to open.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handlePay} disabled={loading} className="h-11 w-full">
        {loading ? 'Opening secure checkout…' : 'Pay now — Card or Mobile Money'}
      </Button>
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
