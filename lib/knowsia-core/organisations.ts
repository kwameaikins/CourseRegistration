// Knowsia Core Organisations, from this app (Doc 22 §7 Phase 4, Release 2,
// 2026-09-19; Doc 24 §2; founder: "Core holds the record; Registration
// forwards").
//
// A company here is an organisation in Core (one per `companies.id`); a
// seat allocation is a DEAL there (one per allocation id, naming the
// batch's Release 1 SKU at the allocation's own price per seat); a status
// change follows. Core records what was sold to whom at what price; who
// sits in which seat (`registrations.company_allocation_id`) stays this
// app's. This app keeps its company screens until Phase 7. Best effort in
// every direction — Core being down never costs a company, a sale or an
// employee's registration.
import { captureToSentry } from '@/lib/errors';
import { batchSkuCode } from '@/lib/knowsia-core/catalogue';

export function isCoreOrganisationsConfigured(): boolean {
  return Boolean(process.env.KNOWSIA_APP_API_URL && process.env.KNOWSIA_APP_SERVICE_KEY);
}

function base(): string {
  return process.env.KNOWSIA_APP_API_URL!.replace(/\/+$/, '');
}

function headers(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Service-Key': process.env.KNOWSIA_APP_SERVICE_KEY! };
}

const toMinor = (ghs: number): number => Math.round(ghs * 100);

export interface CoreOrganisationRecord {
  id: string;
  product: string;
  name: string;
  external_ref: string | null;
  status: string;
  created: boolean;
}

export interface CoreDealRecord {
  id: string;
  organisation_id: string;
  sku_code: string;
  seats: number;
  unit_price_minor: number;
  total_minor: number;
  status: string;
  created: boolean;
}

export async function forwardCompanyToCore(company: {
  id: string;
  name: string;
  tin: string | null;
  billingContactName: string;
  billingEmail: string;
  billingPhone: string;
  billingAddress: string | null;
  notes: string | null;
}): Promise<CoreOrganisationRecord | null> {
  if (!isCoreOrganisationsConfigured()) return null;
  try {
    const response = await fetch(`${base()}/api/v1/service/organisations`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        external_ref: company.id,
        name: company.name,
        kind: 'company',
        tin: company.tin,
        email: company.billingEmail,
        phone: company.billingPhone,
        billing_contact: { name: company.billingContactName, email: company.billingEmail, phone: company.billingPhone, address: company.billingAddress ?? '' },
        address: company.billingAddress,
        notes: company.notes,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`core organisations answered ${response.status}`);
    return (await response.json()) as CoreOrganisationRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-organisations:company', companyId: company.id });
    return null;
  }
}

async function coreOrganisationIdFor(companyId: string): Promise<string | null> {
  const response = await fetch(
    `${base()}/api/v1/service/organisations/by-ref?product=registration&external_ref=${encodeURIComponent(companyId)}`,
    { headers: headers(), signal: AbortSignal.timeout(10_000) },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`core organisations by-ref answered ${response.status}`);
  return ((await response.json()) as { id: string }).id;
}

/**
 * A seat allocation is a deal in Core. The organisation is the company's
 * (forwarded on create; looked up by ref here, and forwarded first when
 * Core has not seen the company yet — a company created before this
 * release). The SKU is the batch's Release 1 SKU; the unit price is the
 * allocation's own `price_per_seat`, never the batch fee.
 */
export async function forwardSeatAllocationToCore(
  allocation: { id: string; seatsPurchased: number; pricePerSeat: number; status: string; statusReason: string | null; notes: string | null },
  company: Parameters<typeof forwardCompanyToCore>[0],
  batch: { cohortLabel: string },
  course: { courseCode: string },
): Promise<CoreDealRecord | null> {
  if (!isCoreOrganisationsConfigured()) return null;
  try {
    let orgId = await coreOrganisationIdFor(company.id);
    if (!orgId) {
      const forwarded = await forwardCompanyToCore(company);
      orgId = forwarded?.id ?? null;
    }
    if (!orgId) throw new Error('core has no organisation for this company');
    const response = await fetch(`${base()}/api/v1/service/organisations/${orgId}/deals`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        product: 'registration',
        external_ref: allocation.id,
        sku_code: batchSkuCode(course.courseCode, batch.cohortLabel),
        seats: allocation.seatsPurchased,
        unit_price_minor: toMinor(allocation.pricePerSeat),
        currency: 'GHS',
        status: allocation.status,
        status_reason: allocation.statusReason,
        notes: allocation.notes,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 422: the batch has no SKU in Core yet (created before Release 1's
    // sync) — the sync script backfills both; nothing to do here.
    if (response.status === 422) return null;
    if (!response.ok) throw new Error(`core organisations deals answered ${response.status}`);
    return (await response.json()) as CoreDealRecord;
  } catch (err) {
    captureToSentry(err, { job: 'core-organisations:allocation', allocationId: allocation.id });
    return null;
  }
}

export async function forwardAllocationStatusToCore(
  allocationId: string,
  status: 'active' | 'completed' | 'cancelled',
  reason: string | null,
): Promise<boolean> {
  if (!isCoreOrganisationsConfigured()) return false;
  try {
    const response = await fetch(`${base()}/api/v1/service/organisations/deals/${encodeURIComponent(allocationId)}/status`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ product: 'registration', status, reason }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404) return false; // Core never saw the allocation; the sync script will
    if (!response.ok) throw new Error(`core organisations deal status answered ${response.status}`);
    return true;
  } catch (err) {
    captureToSentry(err, { job: 'core-organisations:allocation-status', allocationId });
    return false;
  }
}
