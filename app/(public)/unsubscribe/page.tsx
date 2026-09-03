'use client';

// Public unsubscribe page (Revenue OS Phase 2, 2026-09-03). Linked from the
// footer of every marketing email. A confirm button rather than unsubscribing
// on page load: mail scanners prefetch links, and a prefetch must not
// unsubscribe anyone.
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function UnsubscribeInner() {
  const params = useSearchParams();
  const email = params.get('e') ?? '';
  const token = params.get('t') ?? '';
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function confirm() {
    setState('working');
    try {
      const response = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'This link is not valid.');
      }
      setState('done');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  const box: React.CSSProperties = {
    maxWidth: 460, margin: '80px auto', padding: 28,
    border: '1px solid #e5e0d8', borderRadius: 14,
    fontFamily: 'system-ui, sans-serif', textAlign: 'center',
  };

  if (!email || !token) {
    return <div style={box}><p>This unsubscribe link is incomplete. Please use the link from your email.</p></div>;
  }
  if (state === 'done') {
    return (
      <div style={box}>
        <h1 style={{ fontSize: 20 }}>You are unsubscribed</h1>
        <p style={{ color: '#666', fontSize: 14 }}>
          {email} will receive no more marketing emails from Knowsia. Service emails about
          courses you are registered on (payment receipts, class reminders) continue.
        </p>
      </div>
    );
  }
  return (
    <div style={box}>
      <h1 style={{ fontSize: 20 }}>Unsubscribe from marketing emails?</h1>
      <p style={{ color: '#666', fontSize: 14 }}>
        Stop all Knowsia marketing emails to <strong>{email}</strong>. Service emails about
        courses you are registered on are unaffected.
      </p>
      <button
        onClick={() => void confirm()}
        disabled={state === 'working'}
        style={{
          marginTop: 12, padding: '10px 24px', border: 0, borderRadius: 999,
          background: '#c2410c', color: '#fff', fontWeight: 700, cursor: 'pointer',
        }}
      >
        {state === 'working' ? 'Working…' : 'Yes, unsubscribe me'}
      </button>
      {state === 'error' && <p style={{ color: '#b91c1c', fontSize: 14 }}>{message}</p>}
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribeInner />
    </Suspense>
  );
}
