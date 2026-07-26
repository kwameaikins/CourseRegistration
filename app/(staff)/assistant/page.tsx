'use client';

// Admin AI assistant (founder-approved 2026-07-19): a chat interface over
// modules/agent-tools, the shared tool registry every AI surface in this app
// draws from. High-impact actions (discount, payment plan, transfer, live
// session cancel/reschedule, certificate revoke, campaign send, lead/
// opportunity updates) are propose-then-confirm: the model can only prepare
// a confirmation card below; nothing executes until the admin clicks
// Confirm & Execute themselves.
import { useRef, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';
import type { PendingToolAction } from '@/modules/agent-tools/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: string[];
}

const TOOL_LABELS: Record<string, string> = {
  discount: 'Apply a discount',
  installment_plan: 'Set up a payment plan',
  transfer: 'Transfer to another batch',
  propose_cancel_or_reschedule_live_session: 'Cancel or reschedule a live session',
  propose_revoke_certificate: 'Revoke a certificate',
  propose_queue_and_send_campaign: 'Queue and send a campaign',
  propose_update_lead: 'Update a lead',
  propose_create_opportunity: 'Create a sales opportunity',
};

function labelForTool(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName.replace(/^propose_/, '').replaceAll('_', ' ');
}

const SUGGESTIONS = [
  'Create a new batch of AI-Powered Financial Reporting starting first Monday of next month, fee GHS 800',
  'Show me the dashboard summary',
  'Add a tutor account for a new facilitator',
  'List all courses and their upcoming batches',
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingToolAction | null>(null);
  const [confirming, setConfirming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setErrorMessage(null);
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setBusy(true);
    try {
      const data = await apiFetch<{
        reply: string;
        actions: string[];
        pendingAction: PendingToolAction | null;
      }>('/api/assistant', {
        method: 'POST',
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: data.reply, actions: data.actions },
      ]);
      setPendingAction(data.pendingAction);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'The assistant request failed.');
      setMessages(nextMessages);
    } finally {
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // The ONLY call in this file that can trigger a real write — everything
  // above just talks to the model, which can propose but never execute.
  async function confirmPendingAction() {
    if (!pendingAction) return;
    setConfirming(true);
    setErrorMessage(null);
    try {
      await apiFetch('/api/assistant/execute-action', {
        method: 'POST',
        body: JSON.stringify({
          toolName: pendingAction.toolName,
          input: pendingAction.input,
        }),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ Confirmed: ${labelForTool(pendingAction.toolName)}.`,
        },
      ]);
      setPendingAction(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not execute this action.');
    } finally {
      setConfirming(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] max-w-3xl flex-col">
      <div>
        <h1 className="text-2xl font-bold">Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask in plain language — the assistant can create courses and batches, manage staff
          accounts, edit email templates, read the dashboard, and look up leads, campaigns, live
          sessions, the waitlist, attendance, certificates, and feedback. It can also prepare
          higher-impact actions (discounts, payment plans, transfers, campaign sends, live
          session changes, certificate revokes, lead/opportunity updates) — you always confirm
          those yourself before anything changes.
        </p>
      </div>

      <div className="mt-4 flex-1 space-y-4 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Try one of these:</p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="block w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => send(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-[85%] rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground'
                : 'max-w-[85%] rounded-lg bg-muted px-4 py-2 text-sm'
            }
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.actions && message.actions.length > 0 && (
              <p className="mt-2 text-xs opacity-70">
                Actions: {message.actions.join(', ')}
              </p>
            )}
          </div>
        ))}
        {busy && <p className="text-sm text-muted-foreground">Working…</p>}
        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingAction && (
        <div className="mt-4 rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm dark:bg-amber-950">
          <p className="font-semibold">
            Confirm: {labelForTool(pendingAction.toolName)}
          </p>
          <dl className="mt-2 space-y-1">
            {Object.entries(pendingAction.preview).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="text-right font-medium">{String(value ?? '—')}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">
            This has NOT happened yet. Nothing changes until you confirm.
          </p>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={confirmPendingAction} disabled={confirming}>
              {confirming ? 'Applying…' : 'Confirm & Execute'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingAction(null)}
              disabled={confirming}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        <input
          className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          placeholder="e.g. Create a September batch for ESG at GHS 680…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
