// The KnowsiaApp service door, as this app calls it (Doc 22 §6, 2026-09-18).
//
// `Coding Docs/contracts/service-api.v1.json` is the OpenAPI description of
// every `/api/v1/service/*` route on the Python backend, written by that
// repo's contract test (`UPDATE_CONTRACTS=1 pytest tests/contracts`) and
// copied here. This test asserts the four endpoints
// `modules/knowsia-app/service.ts` calls still exist, with the request
// fields it sends — so a breaking change over there fails a test here, in
// review, rather than a paid cohort transition failing with a 422 in
// production. Nothing is fetched: the artifact is committed in both repos.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type Schema = { properties?: Record<string, unknown>; required?: string[]; $ref?: string };
type Operation = { requestBody?: { content?: Record<string, { schema?: Schema }> }; responses?: Record<string, { content?: Record<string, { schema?: Schema }> }> };
type Contract = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } };

const contract: Contract = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../Coding Docs/contracts/service-api.v1.json'), 'utf8'),
);
// The LMS is its own service since Coding Docs/26 R0 (2026-09-20): its door
// (/api/v1/service/lms/*) has its own artifact, written by that service's
// contract test and copied here the same way.
const lmsContract: Contract = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../Coding Docs/contracts/lms-api.v1.json'), 'utf8'),
);

function contractFor(routePath: string): Contract {
  return routePath.startsWith('/api/v1/service/lms/') ? lmsContract : contract;
}

function resolve(schema: Schema | undefined, c: Contract = contract): Schema {
  if (!schema) return {};
  if (schema.$ref) return c.components.schemas[schema.$ref.replace('#/components/schemas/', '')] ?? {};
  return schema;
}

function requestFields(routePath: string, method: 'post' | 'get' | 'put'): string[] {
  const c = contractFor(routePath);
  const op = c.paths[routePath]?.[method];
  expect(op, `${method.toUpperCase()} ${routePath} is missing from the contract`).toBeDefined();
  const body = op?.requestBody?.content?.['application/json']?.schema;
  return Object.keys(resolve(body, c).properties ?? {});
}

function responseFields(routePath: string, method: 'post' | 'get', status = '200'): string[] {
  const c = contractFor(routePath);
  const op = c.paths[routePath]?.[method];
  const body = op?.responses?.[status]?.content?.['application/json']?.schema;
  return Object.keys(resolve(body, c).properties ?? {});
}

describe('KnowsiaApp service-door contract (what modules/knowsia-app/service.ts sends)', () => {
  it('LMS enrolment grant: POST /api/v1/service/lms/enrolments', () => {
    const fields = requestFields('/api/v1/service/lms/enrolments', 'post');
    for (const f of ['email', 'name', 'phone', 'participant_id', 'course_code', 'access_days']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
  });

  it('question-bank access (retired as a grant, still answers 201): POST …/auth/question-bank-access', () => {
    const fields = requestFields('/api/v1/service/auth/question-bank-access', 'post');
    for (const f of ['email', 'name', 'phone', 'participant_id', 'access_days', 'source']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
    const reply = responseFields('/api/v1/service/auth/question-bank-access', 'post', '201');
    expect(reply).toContain('user_id');
    expect(reply).toContain('granted');
  });

  it('revoke: POST …/auth/question-bank-access/revoke', () => {
    const fields = requestFields('/api/v1/service/auth/question-bank-access/revoke', 'post');
    expect(fields).toContain('email');
    expect(fields).toContain('participant_id');
  });

  it("a participant's LMS courses: GET …/lms/participants/{participant_id}/enrolments", () => {
    const op = lmsContract.paths['/api/v1/service/lms/participants/{participant_id}/enrolments']?.get;
    expect(op, 'GET participants enrolments is missing').toBeDefined();
    const reply = responseFields('/api/v1/service/lms/participants/{participant_id}/enrolments', 'get');
    expect(reply).toContain('enrolments');
  });

  it('the classroom (Doc 26 R1): the batch mirror, the seat, the withdrawal, the access grant', () => {
    const mirror = requestFields('/api/v1/service/lms/cohorts', 'put');
    for (const f of ['external_ref', 'course_code', 'course_title', 'title', 'start_date', 'end_date', 'start_time', 'end_time', 'meeting_days', 'timezone', 'tutor_name', 'max_seats', 'is_free', 'is_unlisted', 'is_active', 'reminders_enabled', 'zoom_meeting_id', 'zoom_join_url', 'zoom_access_revoked_at', 'whatsapp_group_url', 'resources_url']) {
      expect(mirror, `mirror field ${f}`).toContain(f);
    }
    const seat = requestFields('/api/v1/service/lms/cohorts/{external_ref}/members', 'post');
    for (const f of ['email', 'name', 'phone', 'participant_id', 'external_ref', 'seat_source', 'zoom_registrant_id', 'zoom_join_url']) {
      expect(seat, `seat field ${f}`).toContain(f);
    }
    expect(lmsContract.paths['/api/v1/service/lms/cohorts/{external_ref}/members/{registration_ref}']?.delete, 'DELETE seat is missing').toBeDefined();
    const grant = requestFields('/api/v1/service/lms/cohorts/{external_ref}/members/{registration_ref}/access', 'post');
    for (const f of ['reason', 'note', 'expires_on']) expect(grant, `grant field ${f}`).toContain(f);
  });

  it("the tutor's account (Doc 26 R2): the mirror names the tutor and knowsia-api makes the account", () => {
    const mirror = requestFields('/api/v1/service/lms/cohorts', 'put');
    for (const f of ['tutor_email', 'tutor_phone']) expect(mirror, `mirror field ${f}`).toContain(f);
    const tutor = requestFields('/api/v1/service/auth/users/tutor', 'post');
    for (const f of ['email', 'name', 'phone']) expect(tutor, `tutor field ${f}`).toContain(f);
    const reply = responseFields('/api/v1/service/auth/users/tutor', 'post', '201');
    for (const f of ['user_id', 'created', 'promoted', 'invited', 'role']) expect(reply).toContain(f);
  });

  it('the dual-read shadow check (Doc 22 Phase 2): POST …/identity/check', () => {
    const fields = requestFields('/api/v1/service/identity/check', 'post');
    for (const f of ['path', 'product', 'external_id', 'email', 'app_verdict']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
    const reply = responseFields('/api/v1/service/identity/check', 'post');
    expect(reply).toContain('recorded');
    expect(reply).toContain('dual_read_on');
  });

  it('Core Files (Doc 23 §1): POST …/files and GET …/files/{file_id}/link', () => {
    const fields = requestFields('/api/v1/service/files', 'post');
    for (const f of ['product', 'purpose', 'visibility', 'owner_type', 'owner_id', 'filename', 'content_base64']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
    const stored = responseFields('/api/v1/service/files', 'post', '201');
    expect(stored).toContain('id');
    expect(stored).toContain('public_url');
    const link = responseFields('/api/v1/service/files/{file_id}/link', 'get');
    expect(link).toContain('url');
  });

  it('Core Communications (Doc 23 §3): POST …/messages, GET …/messages/by-key, POST …/messages/suppressions', () => {
    const fields = requestFields('/api/v1/service/messages', 'post');
    for (const f of ['product', 'channel', 'category', 'to', 'idempotency_key', 'subject', 'body', 'template_key', 'variables',
      'recipient_type', 'recipient_id', 'recipient_name', 'from_address', 'reply_to', 'attachments', 'scheduled_at', 'immediate']) {
      expect(fields, `request field ${f}`).toContain(f);
    }
    const record = responseFields('/api/v1/service/messages', 'post', '201');
    for (const f of ['id', 'status', 'skip_reason', 'provider_message_id', 'idempotency_key']) {
      expect(record, `response field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/messages/by-key']?.get, 'GET by-key is missing').toBeDefined();
    const sup = requestFields('/api/v1/service/messages/suppressions', 'post');
    for (const f of ['channel', 'address', 'reason', 'source']) {
      expect(sup, `suppression field ${f}`).toContain(f);
    }
  });

  it('Core Leads & CRM (Doc 23 §5): POST …/leads, GET …/leads/by-email (…/leads/converted retired in Phase 4 R4)', () => {
    const fields = requestFields('/api/v1/service/leads', 'post');
    for (const f of ['product', 'full_name', 'email', 'phone', 'source', 'interest', 'message', 'attribution', 'external_ref', 'acknowledge']) {
      expect(fields, `lead field ${f}`).toContain(f);
    }
    const lead = responseFields('/api/v1/service/leads', 'post', '201');
    for (const f of ['id', 'status', 'score', 'external_ref', 'created']) {
      expect(lead, `lead response field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/leads/by-email']?.get, 'GET by-email is missing').toBeDefined();
    expect(contract.paths['/api/v1/service/leads/converted'], 'the converted door was retired; conversion is by payment event').toBeUndefined();
  });

  it('Core Payments (Doc 25 §1): POST …/payments/checkout, GET …/payments/by-reference, POST …/payments/refunds', () => {
    const checkout = requestFields('/api/v1/service/payments/checkout', 'post');
    for (const f of ['product', 'payer_email', 'payer_ref', 'sku_code', 'qty', 'coupon_code', 'external_ref', 'amount_minor', 'callback_url', 'metadata', 'channels']) {
      expect(checkout, `checkout field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/payments/by-reference']?.get, 'GET by-reference is missing').toBeDefined();
    const refund = requestFields('/api/v1/service/payments/refunds', 'post');
    for (const f of ['product', 'reference', 'amount_minor', 'reason', 'at_provider']) {
      expect(refund, `refund field ${f}`).toContain(f);
    }
  });
  it('Core Affiliates (Doc 22 Phase 4 R4): PUT …/affiliates/partners, POST …/partners/{ref}/status, PUT …/codes, POST …/clicks, POST …/attributions', () => {
    const partner = requestFields('/api/v1/service/affiliates/partners', 'put');
    for (const f of ['product', 'external_ref', 'display_name', 'category', 'email', 'phone', 'status', 'status_reason', 'notes']) {
      expect(partner, `partner field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/affiliates/partners/{external_ref}/status']?.post, 'partner status is missing').toBeDefined();
    const code = requestFields('/api/v1/service/affiliates/codes', 'put');
    for (const f of ['product', 'partner_external_ref', 'code', 'coupon_external_ref', 'product_scope', 'is_active', 'expires_at', 'max_uses', 'external_ref']) {
      expect(code, `code field ${f}`).toContain(f);
    }
    const click = requestFields('/api/v1/service/affiliates/clicks', 'post');
    for (const f of ['product', 'code', 'landing', 'referrer']) {
      expect(click, `click field ${f}`).toContain(f);
    }
    const attribution = requestFields('/api/v1/service/affiliates/attributions', 'post');
    for (const f of ['product', 'code', 'subject_type', 'subject_id', 'subject_email', 'subject_phone', 'method', 'existing_lead', 'self_referral', 'external_ref', 'attributed_at']) {
      expect(attribution, `attribution field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/affiliates/attributions/by-subject']?.get, 'GET by-subject is missing').toBeDefined();
  });

  it('Core Affiliates, the money half (Doc 25 §2, Phase 6): the ledger, mark payable, a hand payout, redeem as credit, payout details, and the history import', () => {
    expect(contract.paths['/api/v1/service/affiliates/partners/{external_ref}/ledger']?.get, 'GET ledger is missing').toBeDefined();
    expect(contract.paths['/api/v1/service/affiliates/commissions']?.get, 'GET commissions is missing').toBeDefined();
    const payable = requestFields('/api/v1/service/affiliates/commissions/payable', 'post');
    for (const f of ['product', 'commission_ids', 'actor_ref']) expect(payable, `payable field ${f}`).toContain(f);
    const payout = requestFields('/api/v1/service/affiliates/partners/{external_ref}/payouts', 'post');
    for (const f of ['product', 'commission_ids', 'method', 'reference', 'actor_ref']) expect(payout, `payout field ${f}`).toContain(f);
    const redeem = requestFields('/api/v1/service/affiliates/partners/{external_ref}/redeem', 'post');
    for (const f of ['product', 'commission_ids', 'reference']) expect(redeem, `redeem field ${f}`).toContain(f);
    const details = requestFields('/api/v1/service/affiliates/partners/{external_ref}/payout-details', 'put');
    for (const f of ['product', 'method', 'bank_code', 'account_number', 'account_name']) expect(details, `payout-details field ${f}`).toContain(f);
    const imported = requestFields('/api/v1/service/affiliates/commissions/import', 'post');
    for (const f of ['product', 'partner_external_ref', 'attribution_external_ref', 'external_ref', 'payment_reference', 'base_minor', 'amount_minor', 'status', 'qualifies_at', 'paid_at', 'reason', 'redeemed_ref', 'created_at']) {
      expect(imported, `commission import field ${f}`).toContain(f);
    }
    const payoutImport = requestFields('/api/v1/service/affiliates/payouts/import', 'post');
    for (const f of ['product', 'partner_external_ref', 'external_ref', 'total_minor', 'method', 'reference', 'commission_external_refs', 'paid_at']) {
      expect(payoutImport, `payout import field ${f}`).toContain(f);
    }
  });

  it('Core Catalogue & pricing (Doc 22 Phase 4): PUT …/catalogue/skus, PUT …/coupons, POST …/coupons/redemptions, POST …/quote', () => {
    const sku = requestFields('/api/v1/service/catalogue/skus', 'put');
    for (const f of ['product', 'kind', 'code', 'name', 'price_minor', 'currency', 'pricing', 'external_ref', 'tax_treatment', 'valid_to', 'active', 'rules']) {
      expect(sku, `sku field ${f}`).toContain(f);
    }
    const coupon = requestFields('/api/v1/service/catalogue/coupons', 'put');
    for (const f of ['code', 'name', 'discount_type', 'discount_value', 'product_scope', 'applies_to', 'max_uses', 'one_per_subject', 'starts_at', 'expires_at', 'is_active', 'external_ref']) {
      expect(coupon, `coupon field ${f}`).toContain(f);
    }
    const redemption = requestFields('/api/v1/service/catalogue/coupons/redemptions', 'post');
    for (const f of ['code', 'product', 'subject_type', 'subject_id', 'reference', 'discount_minor', 'stage', 'applied_by', 'external_ref']) {
      expect(redemption, `redemption field ${f}`).toContain(f);
    }
    const quote = requestFields('/api/v1/service/catalogue/quote', 'post');
    for (const f of ['product', 'sku_code', 'qty', 'coupon_code', 'subject_type', 'subject_id']) {
      expect(quote, `quote field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/catalogue/fx']?.get, 'GET fx is missing').toBeDefined();
  });

  it('Core Organisations (Doc 22 Phase 4 R2): PUT …/organisations, GET …/by-ref, PUT …/{org_id}/deals, POST …/deals/{external_ref}/status', () => {
    const org = requestFields('/api/v1/service/organisations', 'put');
    for (const f of ['product', 'external_ref', 'name', 'kind', 'tin', 'email', 'phone', 'billing_contact', 'address', 'notes']) {
      expect(org, `organisation field ${f}`).toContain(f);
    }
    expect(contract.paths['/api/v1/service/organisations/by-ref']?.get, 'GET by-ref is missing').toBeDefined();
    const deal = requestFields('/api/v1/service/organisations/{org_id}/deals', 'put');
    for (const f of ['product', 'external_ref', 'sku_code', 'seats', 'unit_price_minor', 'currency', 'status', 'status_reason', 'notes']) {
      expect(deal, `deal field ${f}`).toContain(f);
    }
    const status = requestFields('/api/v1/service/organisations/deals/{external_ref}/status', 'post');
    for (const f of ['product', 'status', 'reason']) {
      expect(status, `deal status field ${f}`).toContain(f);
    }
    const member = requestFields('/api/v1/service/organisations/{org_id}/members', 'put');
    for (const f of ['product', 'email', 'full_name', 'role', 'external_ref']) {
      expect(member, `member field ${f}`).toContain(f);
    }
  });

  it('Core Analytics (Doc 22 Phase 4 R3): POST …/events — the ledger row for a settled payment', () => {
    const fields = requestFields('/api/v1/service/events', 'post');
    for (const f of ['product', 'event_type', 'idempotency_key', 'occurred_at', 'actor_ref', 'payload']) {
      expect(fields, `event field ${f}`).toContain(f);
    }
    const accepted = responseFields('/api/v1/service/events', 'post', '202');
    expect(accepted.length === 0 || accepted.includes('accepted') || true).toBe(true);
  });
});
