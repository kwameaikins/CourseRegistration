'use client';

// Admin AI assistant (founder-approved 2026-07-19): a chat interface over the
// same service functions the admin screens use — create courses and batches,
// manage staff accounts, edit templates, read the dashboard.
import { useRef, useState } from 'react';

import { apiFetch } from '@/components/api-client';
import { Button } from '@/components/ui/button';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: string[];
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
      const data = await apiFetch<{ reply: string; actions: string[] }>('/api/assistant', {
        method: 'POST',
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      setMessages([
        ...nextMessages,
        { role: 'assistant', content: data.reply, actions: data.actions },
      ]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'The assistant request failed.');
      setMessages(nextMessages);
    } finally {
      setBusy(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] max-w-3xl flex-col">
      <div>
        <h1 className="text-2xl font-bold">Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Ask in plain language — the assistant can create courses and batches, manage staff
          accounts, edit email templates, and read the dashboard.
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
