'use client';

// Voice call review (founder-approved 2026-07-19): every agentic call with
// its outcome, transcript, and human-followup flags. Admin, Finance,
// Management.
import { useEffect, useState } from 'react';

import { apiFetch } from '@/components/api-client';

interface CallRow {
  id: string;
  participantName: string | null;
  callType: string;
  phone: string;
  status: string;
  summary: string | null;
  transcript: string | null;
  needsHumanFollowup: boolean;
  promisedPaymentDate: string | null;
  bankReference: string | null;
  createdAt: string;
}

const CALL_TYPE_LABELS: Record<string, string> = {
  payment_followup: 'Payment follow-up',
  bank_transfer_chase: 'Bank transfer chase',
  no_show_recovery: 'No-show recovery',
  feedback_voice: 'Voice feedback',
  upsell: 'Upsell',
  inbound: 'Inbound',
};

export default function CallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch<{ calls: CallRow[] }>('/api/calls');
        setCalls(data.calls);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load calls.');
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const followups = calls.filter((call) => call.needsHumanFollowup);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Calls</h1>
        <p className="text-sm text-muted-foreground">
          Agentic voice calls: payment follow-ups, no-show recovery, voice feedback, upsell,
          and the inbound line. Calls are dialed between 10:00 and 17:00.
        </p>
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {followups.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">
            {followups.length} call{followups.length === 1 ? '' : 's'} need a human follow-up
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {followups.map((call) => (
              <li key={call.id}>
                {call.participantName ?? call.phone} — {call.summary ?? 'no summary'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loaded && calls.length === 0 && !errorMessage && (
        <p className="text-sm text-muted-foreground">
          No calls yet. Calls start once the Vapi environment variables are configured and a
          trigger condition occurs.
        </p>
      )}

      <div className="space-y-3">
        {calls.map((call) => (
          <div key={call.id} className="rounded-lg border">
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
              onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
            >
              <span className="text-sm font-medium">
                {CALL_TYPE_LABELS[call.callType] ?? call.callType} —{' '}
                {call.participantName ?? call.phone}
                {call.needsHumanFollowup && (
                  <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    Needs follow-up
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(call.createdAt).toLocaleString()} · {call.status}
              </span>
            </button>
            {expandedId === call.id && (
              <div className="space-y-2 border-t px-4 py-3 text-sm">
                {call.summary && <p>{call.summary}</p>}
                {call.promisedPaymentDate && (
                  <p className="text-emerald-700">
                    Promised payment date: {call.promisedPaymentDate}
                  </p>
                )}
                {call.bankReference && (
                  <p className="text-emerald-700">Bank reference: {call.bankReference}</p>
                )}
                {call.transcript ? (
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                    {call.transcript}
                  </pre>
                ) : (
                  <p className="text-muted-foreground">No transcript available.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
