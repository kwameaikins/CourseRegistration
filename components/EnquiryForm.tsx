'use client';

// Public enquiry form (Revenue OS Phase 2, 2026-09-03) — the top-funnel
// capture. A client island dropped into the (server-rendered) marketing
// pages; carries its own small stylesheet in the same CSS-in-string manner
// as the marketing design system, scoped under .enq.
import { useState } from 'react';

const STYLES = `
.enq { border: 1px solid var(--line, #e7e0d8); border-radius: 14px; padding: 22px; background: #fff; }
.enq h3 { margin: 0 0 4px; font-size: 18px; }
.enq p.sub { margin: 0 0 14px; font-size: 13.5px; color: var(--ink-faint, #6b625a); }
.enq .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.enq label { display: block; font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-faint, #6b625a); margin: 10px 0 4px; }
.enq input, .enq textarea { width: 100%; border: 1px solid var(--line, #e7e0d8); border-radius: 8px; padding: 9px 11px; font-size: 14px; font-family: inherit; background: #fff; }
.enq input:focus, .enq textarea:focus { outline: 2px solid var(--accent, #c2410c); outline-offset: 1px; }
.enq textarea { min-height: 88px; resize: vertical; }
.enq .actions { margin-top: 14px; display: flex; align-items: center; gap: 12px; }
.enq button { border: 0; border-radius: 999px; padding: 10px 22px; font-size: 14px; font-weight: 700; color: #fff; background: var(--accent, #c2410c); cursor: pointer; }
.enq button:disabled { opacity: .6; cursor: default; }
.enq .msg-ok { font-size: 13.5px; color: #166534; }
.enq .msg-err { font-size: 13.5px; color: #b91c1c; }
.enq .hp { position: absolute; left: -9999px; height: 0; overflow: hidden; }
@media (max-width: 560px) { .enq .row { grid-template-columns: 1fr; } }
`;

export function EnquiryForm({ courseName }: { courseName?: string }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState('sending');
    setError('');
    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, phone, message, courseName, website }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Something went wrong. Please try again.');
      }
      setState('sent');
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  if (state === 'sent') {
    return (
      <div className="enq">
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
        <h3>Thanks — we got your question.</h3>
        <p className="sub">Our team will call or email you within one working day.</p>
      </div>
    );
  }

  return (
    <div className="enq">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <h3>{courseName ? `Ask about ${courseName}` : 'Ask us anything'}</h3>
      <p className="sub">
        Not ready to register? Leave your question and a real person will get back to you.
      </p>
      <form onSubmit={submit}>
        <div className="row">
          <div>
            <label htmlFor="enq-name">Full name</label>
            <input
              id="enq-name" required minLength={2} maxLength={150}
              value={fullName} onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="enq-phone">Phone (WhatsApp preferred)</label>
            <input
              id="enq-phone" type="tel" required minLength={10} maxLength={20}
              value={phone} onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>
        <label htmlFor="enq-email">Email</label>
        <input
          id="enq-email" type="email" required maxLength={200}
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="enq-message">Your question</label>
        <textarea
          id="enq-message" required minLength={5} maxLength={800}
          value={message} onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. Do sessions run on weekends? Is there a payment plan?"
        />
        <div className="hp" aria-hidden="true">
          <label htmlFor="enq-website">Website</label>
          <input
            id="enq-website" tabIndex={-1} autoComplete="off"
            value={website} onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send question'}
          </button>
          {state === 'error' && <span className="msg-err">{error}</span>}
        </div>
      </form>
    </div>
  );
}
