// Knowsia Core Leads & CRM, from this app (Doc 23 §5, 2026-09-19).
//
// One lead per person across both products: every enquiry this app takes is
// forwarded to Core (which keeps the record, the timeline, the pipeline and
// today's work), and every paid transition tells Core the person became a
// customer so the lead converts and the opportunity is won. This app keeps
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

export async function reportConversionToCore(input: {
  email: string;
  kind?: 'cohort_seat' | 'subscription' | 'corporate' | 'tuition' | 'other';
  amount?: number;
  currency?: string;
  sourceRef: string;
  title?: string | null;
}): Promise<boolean> {
  if (!isCoreLeadsConfigured()) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/leads/converted`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        email: input.email,
        kind: input.kind ?? 'cohort_seat',
        amount: input.amount ?? 0,
        currency: input.currency ?? 'GHS',
        source_ref: input.sourceRef,
        title: input.title ?? null,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core leads converted answered ${response.status}`);
    const data = (await response.json()) as { converted: boolean };
    return data.converted;
  } catch (err) {
    captureToSentry(err, { job: 'core-leads:converted' });
    return false;
  }
}
