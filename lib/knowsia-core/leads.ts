// Knowsia Core Leads & CRM, from this app (Doc 23 §5, 2026-09-19).
//
// One lead per person across both products: every enquiry this app takes is
// forwarded to Core (which keeps the record, the timeline, the pipeline and
// today's work). The lead CONVERTS by event: the settled payment this app
// raises on Core's ledger (lib/knowsia-core/events.ts, Phase 4 R3) is what
// Core's CRM consumer matches to the lead — the old `…/leads/converted` door
// was retired in Phase 4 R4. This app keeps
// its own `leads` row for its own screens; `external_ref` on Core's side is
// that row's id. Best effort in both directions — Core being down must never
// cost an enquiry or a payment.
import { captureToSentry } from '@/lib/errors';

export function isCoreLeadsConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

export interface CoreLeadRecord {
  id: string;
  product: string;
  full_name: string;
  email: string;
  phone: string | null;
  source: string;
  status: string;
  score: number;
  owner_id: string | null;
  external_ref: string | null;
  created: boolean;
}

export async function forwardEnquiryToCore(input: {
  fullName: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  source?: string;
  interest?: string | null;
  message?: string | null;
  attribution?: Record<string, unknown> | null;
  externalRef?: string | null;
  tags?: string[];
}): Promise<CoreLeadRecord | null> {
  if (!isCoreLeadsConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/leads`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        full_name: input.fullName,
        email: input.email,
        phone: input.phone ?? null,
        company: input.company ?? null,
        job_title: input.jobTitle ?? null,
        source: input.source ?? 'website',
        interest: input.interest ?? null,
        message: input.message ?? null,
        attribution: input.attribution ?? {},
        external_ref: input.externalRef ?? null,
        tags: input.tags ?? [],
        acknowledge: false,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core leads answered ${response.status}`);
    return (await response.json()) as CoreLeadRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-leads:enquiry' });
    return null;
  }
}
