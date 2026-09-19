import { Resend } from 'resend';

import { coreHandledIt, coreRefusedIt, sendViaCore } from '@/lib/knowsia-core/messages';

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

// RESEND_FROM_EMAIL is configured as a bare address; without a display name
// Gmail falls back to showing the local part ("reg") as the sender name
// instead of the brand, so it's added here rather than depending on every
// env value being pre-formatted as "Name <address>".
function formatFromAddress(rawFromEmail: string): string {
  return rawFromEmail.includes('<') ? rawFromEmail : `Knowsia <${rawFromEmail}>`;
}

export class MessageSuppressedError extends Error {
  constructor(public readonly skipReason: string) {
    super(`Recipient must not be contacted: ${skipReason}`);
    this.name = 'MessageSuppressedError';
  }
}

export async function sendTransactionalEmail(params: {
  to: string;
  from?: string;
  subject: string;
  html: string;
  // Additive (system review, 2026-07-24) - content is base64, matching what
  // Resend's API expects. Optional so every existing call site is unchanged.
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
  // Knowsia Core (Doc 23 §3, 2026-09-19): the log's key and category. A caller
  // that already deduplicates (email_log) may pass its own key so a retry
  // never sends twice; marketing must say so, because Core enforces the
  // person's choices and the unsubscribe list for that category only.
  idempotencyKey?: string;
  category?: 'transactional' | 'marketing' | 'security' | 'system';
  templateKey?: string;
  recipient?: { type: 'participant' | 'lead' | 'staff'; id: string; name?: string | null };
  // Returns Resend's message id (Revenue OS Phase 2, 2026-09-03) so the
  // engagement webhook can land opened/clicked events back on the email_log
  // row that recorded the send. Additive: every existing caller ignores the
  // return value and is unchanged.
}): Promise<{ providerMessageId: string | null }> {
  const from = params.from
    ? formatFromAddress(params.from)
    : formatFromAddress(process.env.RESEND_FROM_EMAIL!);

  // Through Core first: one log for both products. Core has the same Resend
  // key, so a message it sends arrives exactly as a direct one would.
  const record = await sendViaCore({
    channel: 'email',
    to: params.to,
    category: params.category ?? 'transactional',
    subject: params.subject,
    body: params.html,
    templateKey: params.templateKey,
    fromAddress: from,
    attachments: params.attachments?.map((a) => ({ filename: a.filename, content: a.content, content_type: a.contentType })),
    idempotencyKey: params.idempotencyKey,
    recipientType: params.recipient?.type,
    recipientId: params.recipient?.id,
    recipientName: params.recipient?.name ?? null,
  });
  if (coreHandledIt(record)) {
    return { providerMessageId: record.provider_message_id };
  }
  if (coreRefusedIt(record)) {
    throw new MessageSuppressedError(record!.skip_reason ?? 'suppressed');
  }

  const { data, error } = await getResendClient().emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      content_type: attachment.contentType,
    })),
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  return { providerMessageId: data?.id ?? null };
}
