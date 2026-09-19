// Knowsia Core Communications, from this app (Doc 23 §3, 2026-09-19).
//
// One log, every channel: a message this app sends goes THROUGH Core's
// service door so "what did we send this person" is one query across both
// products. This app keeps its own engines, templates and per-channel logs;
// Core holds the record, the person's channel choices, the unsubscribe list
// and the provider webhooks. When Core is not configured or unreachable, the
// provider clients fall back to sending direct and say so in Sentry — a
// receipt must go whether or not the log is reachable.
import { randomUUID } from 'node:crypto';

import { captureToSentry } from '@/lib/errors';

export type CoreChannel = 'email' | 'sms' | 'whatsapp' | 'voice';
export type CoreCategory = 'transactional' | 'marketing' | 'security' | 'system';

export interface CoreMessageRecord {
  id: string;
  channel: CoreChannel;
  category: CoreCategory;
  to_address: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed' | 'skipped' | 'cancelled';
  skip_reason: string | null;
  provider: string | null;
  provider_message_id: string | null;
  error: string | null;
  idempotency_key: string;
}

export function isCoreMessagesConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export interface CoreSendInput {
  channel: CoreChannel;
  to: string;
  category?: CoreCategory;
  subject?: string;
  body?: string;
  templateKey?: string;
  variables?: Record<string, unknown>;
  recipientType?: 'participant' | 'lead' | 'staff' | 'address';
  recipientId?: string | null;
  recipientName?: string | null;
  fromAddress?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
  scheduledAt?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

/** Send through Core, at once. Returns the record, or null when Core is not
 *  configured or did not answer — the caller then sends direct. A record whose
 *  status is `skipped` with `not_configured` means Core has no key for that
 *  channel yet; the caller sends direct in that case too. */
export async function sendViaCore(input: CoreSendInput): Promise<CoreMessageRecord | null> {
  if (!isCoreMessagesConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        channel: input.channel,
        category: input.category ?? 'transactional',
        to: input.to,
        idempotency_key: input.idempotencyKey ?? `registration:${input.channel}:${randomUUID()}`,
        subject: input.subject ?? null,
        body: input.body ?? null,
        template_key: input.templateKey ?? null,
        variables: input.variables ?? {},
        recipient_type: input.recipientType ?? 'address',
        recipient_id: input.recipientId ?? null,
        recipient_name: input.recipientName ?? null,
        from_address: input.fromAddress ?? null,
        reply_to: input.replyTo ?? null,
        attachments: input.attachments ?? null,
        scheduled_at: input.scheduledAt ?? null,
        correlation_id: input.correlationId ?? null,
        immediate: true,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { detail?: unknown };
      throw new Error(`core messages answered ${response.status}: ${JSON.stringify(detail.detail ?? '')}`.slice(0, 300));
    }
    return (await response.json()) as CoreMessageRecord;
  } catch (err) {
    captureToSentry(err, { job: `core-messages:${input.channel}` });
    return null;
  }
}

/** Did Core actually hand it to the provider? `queued` counts: the minute
 *  tick sends it (a call held to the calling window, a scheduled message). */
export function coreHandledIt(record: CoreMessageRecord | null): record is CoreMessageRecord {
  return record !== null && (record.status === 'sent' || record.status === 'delivered' || record.status === 'queued');
}

/** Core refused it on the person's behalf — unsubscribed, bounced, channel
 *  off. That is a decision, not an outage: the caller must NOT send direct. */
export function coreRefusedIt(record: CoreMessageRecord | null): boolean {
  return record !== null && record.status === 'skipped' && record.skip_reason !== 'not_configured';
}

/** Tell Core an address must not be contacted on a channel (this app's
 *  opt-out list, kept in step). Best effort; failure is reported, not thrown. */
export async function suppressInCore(input: {
  channel: CoreChannel;
  address: string;
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'staff' | 'invalid';
  source?: string;
  detail?: string | null;
}): Promise<boolean> {
  if (!isCoreMessagesConfigured()) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/messages/suppressions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        channel: input.channel,
        address: input.address,
        reason: input.reason,
        source: input.source ?? 'registration',
        detail: input.detail ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch (err) {
    captureToSentry(err, { job: 'core-messages:suppress' });
    return false;
  }
}
