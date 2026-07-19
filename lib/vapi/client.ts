// Vapi voice-agent client (founder-approved 2026-07-19).
//
// Design split: the assistant itself (voice, persona, model, first message,
// analysis schema) is configured once in the Vapi dashboard so the founder
// can tune it without deploys. The app supplies per-call context through
// assistantOverrides.variableValues ({{participant_name}} etc. in the
// dashboard prompt) and correlates results by the returned call id.
//
// Required env vars: VAPI_API_KEY, VAPI_PHONE_NUMBER_ID (the outbound caller
// ID), VAPI_OUTBOUND_ASSISTANT_ID (the dashboard assistant), and
// VAPI_WEBHOOK_SECRET (shared secret Vapi sends on webhooks/tool calls).
// When unset (pre-setup, local dev), isVoiceConfigured() gates all dialing.
import { normalizeWhatsappPhone } from '@/lib/whatsapp/client';

const VAPI_API_BASE = 'https://api.vapi.ai';

export function isVoiceConfigured(): boolean {
  return Boolean(
    process.env.VAPI_API_KEY &&
      process.env.VAPI_PHONE_NUMBER_ID &&
      process.env.VAPI_OUTBOUND_ASSISTANT_ID,
  );
}

// Vapi expects E.164 with the leading '+'.
export function normalizeCallPhone(rawPhone: string): string | null {
  const digits = normalizeWhatsappPhone(rawPhone);
  return digits ? `+${digits}` : null;
}

export async function startOutboundCall(params: {
  toPhone: string;
  // Injected into the dashboard assistant's prompt as {{variables}}.
  variableValues: Record<string, string>;
  // ISO timestamp — Vapi holds the call until this time (calling window).
  earliestAt?: string;
}): Promise<{ vapiCallId: string }> {
  const number = normalizeCallPhone(params.toPhone);
  if (!number) {
    throw new Error(`Unusable phone number for voice call: ${params.toPhone}`);
  }

  const response = await fetch(`${VAPI_API_BASE}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assistantId: process.env.VAPI_OUTBOUND_ASSISTANT_ID,
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: { number },
      assistantOverrides: { variableValues: params.variableValues },
      ...(params.earliestAt ? { schedulePlan: { earliestAt: params.earliestAt } } : {}),
    }),
  });

  const body = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Vapi call create failed ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = JSON.parse(body) as { id?: string };
  if (!data.id) {
    throw new Error(`Vapi call create returned no id: ${body.slice(0, 300)}`);
  }
  return { vapiCallId: data.id };
}

// Webhook/tool-call authentication: Vapi sends the server secret configured
// on the assistant in the x-vapi-secret header.
export function isValidVapiSecret(headerValue: string | null): boolean {
  return Boolean(
    process.env.VAPI_WEBHOOK_SECRET && headerValue === process.env.VAPI_WEBHOOK_SECRET,
  );
}
