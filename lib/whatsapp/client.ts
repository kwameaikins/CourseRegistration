// Meta WhatsApp Business Cloud API client (founder-approved 2026-07-18).
//
// Message bodies are pre-approved templates living in Meta Business Manager —
// the API sends a template name plus positional text parameters. Required
// env vars: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID. When they are
// unset (local dev, pre-setup), isWhatsappConfigured() gates all sending.
//
// Since Doc 23 §3 (2026-09-19) a message goes THROUGH Knowsia Core first —
// the template name is the log's `template_key`, the parameters travel as
// `variables.params` — and direct to Meta only when Core cannot take it.
import { coreHandledIt, coreRefusedIt, sendViaCore } from '@/lib/knowsia-core/messages';
import { MessageSuppressedError } from '@/lib/resend/client';

const GRAPH_API_VERSION = 'v20.0';

export function isWhatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

// WhatsApp requires E.164 digits without the leading '+'. Participants type
// Ghanaian numbers in mixed formats ('+233 24 123 4567', '0241234567');
// Ghana's country code 233 is the default assumption for local formats.
export function normalizeWhatsappPhone(rawPhone: string): string | null {
  let digits = rawPhone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('233')) {
    return digits.length === 12 ? digits : null;
  }
  if (digits.startsWith('0') && digits.length === 10) {
    return `233${digits.slice(1)}`;
  }
  if (digits.length === 9) {
    return `233${digits}`;
  }
  // A non-Ghanaian international number entered without 00/+ prefix cannot be
  // disambiguated reliably — treat 10–15 digits as already-international.
  if (digits.length >= 10 && digits.length <= 15) {
    return digits;
  }
  return null;
}

export async function sendWhatsappTemplateMessage(params: {
  toPhone: string;
  templateName: string;
  bodyParameters: string[];
  idempotencyKey?: string;
  category?: 'transactional' | 'marketing' | 'system';
  recipient?: { type: 'participant' | 'lead' | 'staff'; id: string; name?: string | null };
}): Promise<void> {
  const to = normalizeWhatsappPhone(params.toPhone);
  if (!to) {
    throw new Error(`Unusable WhatsApp phone number: ${params.toPhone}`);
  }

  const record = await sendViaCore({
    channel: 'whatsapp',
    to,
    category: params.category ?? 'transactional',
    body: params.bodyParameters.join(' · '),
    templateKey: params.templateName,
    variables: { params: params.bodyParameters },
    idempotencyKey: params.idempotencyKey,
    recipientType: params.recipient?.type,
    recipientId: params.recipient?.id,
    recipientName: params.recipient?.name ?? null,
  });
  if (coreHandledIt(record)) return;
  if (coreRefusedIt(record)) throw new MessageSuppressedError(record!.skip_reason ?? 'suppressed');

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: params.templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? 'en' },
          components: [
            {
              type: 'body',
              parameters: params.bodyParameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `WhatsApp Cloud API error ${response.status}: ${errorBody.slice(0, 500)}`,
    );
  }
}
