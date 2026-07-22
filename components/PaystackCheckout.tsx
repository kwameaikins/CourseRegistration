'use client';

// Paystack checkout initialisation (Document 7, Section 1.1).
//
// ⚠️ metadata.registration_id is NOT optional — it is the webhook's only
// reliable key for matching a payment to a Registration (EC-02). Removing it
// breaks payment confirmation end-to-end.
import { useState } from 'react';

import { Button } from '@/components/ui/button';

interface PaystackPopInterface {
  setup(config: Record<string, unknown>): { openIframe(): void };
}

declare global {
  interface Window {
    PaystackPop?: PaystackPopInterface;
  }
}

const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v1/inline.js';

function loadPaystackScript(): Promise<PaystackPopInterface> {
  return new Promise((resolve, reject) => {
    if (window.PaystackPop) {
      resolve(window.PaystackPop);
      return;
    }
    const script = document.createElement('script');
    script.src = PAYSTACK_INLINE_SRC;
    script.async = true;
    script.onload = () => {
      if (window.PaystackPop) resolve(window.PaystackPop);
      else reject(new Error('Paystack failed to initialise.'));
    };
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

  async function handlePay() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const paystack = await loadPaystackScript();
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
      <Button onClick={handlePay} disabled={loading} className="w-full">
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
