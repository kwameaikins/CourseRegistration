// Arkesel SMS API client (founder-approved 2026-07-19).
//
// Message bodies are composed in application code (sms-engine.ts) — Arkesel
// has no server-side template approval step, unlike WhatsApp. Required env
// vars: ARKESEL_API_KEY, ARKESEL_SENDER_ID (the sender ID must be registered
// and approved in the Arkesel dashboard first). When they are unset (local
// dev, pre-setup), isSmsConfigured() gates all sending.
//
// Since Doc 23 §3 (2026-09-19) a message goes THROUGH Knowsia Core first —
// one log for both products, the person's channel choices honoured — and
// direct to Arkesel only when Core cannot take it.
import { coreHandledIt, coreRefusedIt, sendViaCore } from '@/lib/knowsia-core/messages';
import { MessageSuppressedError } from '@/lib/resend/client';
import { normalizeWhatsappPhone } from '@/lib/whatsapp/client';

const ARKESEL_SEND_URL = 'https://sms.arkesel.com/api/v2/sms/send';

export function isSmsConfigured(): boolean {
  return Boolean(process.env.ARKESEL_API_KEY && process.env.ARKESEL_SENDER_ID);
}

// Arkesel expects the same E.164-without-plus format as the WhatsApp Cloud
// API ('233241234567'), so the Ghana-aware normalizer is shared.
export function normalizeSmsPhone(rawPhone: string): string | null {
  return normalizeWhatsappPhone(rawPhone);
}

export async function sendSmsMessage(params: {
  toPhone: string;
  message: string;
  idempotencyKey?: string;
  category?: 'transactional' | 'marketing' | 'system';
  templateKey?: string;
  recipient?: { type: 'participant' | 'lead' | 'staff'; id: string; name?: string | null };
}): Promise<void> {
  const to = normalizeSmsPhone(params.toPhone);
  if (!to) {
    throw new Error(`Unusable SMS phone number: ${params.toPhone}`);
  }

  const record = await sendViaCore({
    channel: 'sms',
    to,
    category: params.category ?? 'transactional',
    body: params.message,
    templateKey: params.templateKey,
    idempotencyKey: params.idempotencyKey,
    recipientType: params.recipient?.type,
    recipientId: params.recipient?.id,
    recipientName: params.recipient?.name ?? null,
  });
  if (coreHandledIt(record)) return;
  if (coreRefusedIt(record)) throw new MessageSuppressedError(record!.skip_reason ?? 'suppressed');

  const response = await fetch(ARKESEL_SEND_URL, {
    method: 'POST',
    headers: {
      'api-key': process.env.ARKESEL_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: process.env.ARKESEL_SENDER_ID,
      message: params.message,
      recipients: [to],
    }),
  });

  const body = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Arkesel API error ${response.status}: ${body.slice(0, 500)}`);
  }

  // Arkesel returns 200 with {"status": "error", ...} for some failures
  // (invalid sender ID, insufficient balance) — treat those as send failures
  // so the sms_log records them instead of a false success.
  try {
    const parsed = JSON.parse(body) as { status?: string; message?: string };
    if (parsed.status && parsed.status !== 'success') {
      throw new Error(`Arkesel send rejected: ${body.slice(0, 500)}`);
    }
  } catch (err) {
    if (err instanceof SyntaxError) return; // non-JSON 200 body — accept
    throw err;
  }
}
