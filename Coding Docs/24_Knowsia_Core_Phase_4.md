# 24 — Knowsia Core, Phase 4: Structure for money

**Status:** in progress from 2026-09-19. Founder direction: "Plan the Phase 4 appropriately and
then build — Organisations, Catalogue & pricing, Analytics reading across products, Affiliates,
attribution half … applying and enforcing the Apple design principles." Four releases, one
migration each, each released and watched before the next: **R1 Catalogue (platform 008) →
R2 Organisations (009) → R3 Analytics (010) → R4 Affiliates, attribution half (011 + auth 019)**.
This is the record Doc 22 §7 asked for; Doc 22 §8 applies to every module here. Doc 23 §1 is the
shape every module takes and is not repeated.

**Founder decisions, 2026-09-19.** (1) Tax — Knowsia is *not VAT-registered yet*: every SKU carries
a tax treatment, Ghana's rates table exists with effective dates, and nothing charges tax until one
setting flips. (2) Referrals on Study — attribution only, no discount, no credits. (3) FX — a rates
table refreshed daily from a public feed, a manual override, charging stays GHS. (4) Organisations —
Core holds the record; this app forwards and keeps its screens (strangler); Study's `corp_` tables
retire into Core.

**Out of scope, on purpose.** Phase 5 (checkout on Core) and Phase 6 (commissions, payouts,
statements). `accrueCommissionOnPaymentSystem` keeps running from this app's own `code_redemptions`;
`course_fee` on the batch keeps deciding what a student pays. Core is *told* every price and asked
what it would charge — the disagreement count is what lets checkout move.

## 1. Release 1 — Catalogue & pricing (released 2026-09-19)

**What Core holds.** `core_skus` — one row per sellable thing across both products: Study plans
(`plan.<tier>.<cycle>`), corporate seats (`seat.<tier>.<cycle>`), `credits.unit`, `tuition.hour`,
priced self-paced courses (`course.<slug>`) and **this app's batches** (`cohort.<course code>.<cohort
label>`, kind `cohort_seat`, `external_ref` = the batch id). `core_price_rules` — early-bird (until a
date), volume (from a quantity), override. `core_coupons` — code UNIQUE, upper-cased, with a CHECK
that a percentage is ≤ 100 (this app's `codes` table has no such check; the gap is not inherited).
`core_coupon_redemptions` — UNIQUE (coupon, reference). `core_tax_rates` — NHIL 2.5%, GETFund 2.5%,
COVID 1% on the base and VAT 15% on base + levies, from 2026-01-01. `core_fx_rates` — 1 GHS = rate
quote, feed or manual, per day. `core_settings` — `tax.registered`.

**Rules, all in `app/platform/services/catalogue.py` over there.** Prices are minor units (pesewas);
GHS is charged. **Best price wins and never stacks** — early-bird, volume and a coupon compete for the
unit price, this app's own rule kept. A coupon is consumed only on redeem, idempotent on (coupon,
reference). Tax lines exist only when `tax.registered` is on. A display currency names the FX row it
used or the quote refuses. A course-scoped coupon applies to every cohort of the course through
`applies_to.code_prefixes = ["cohort.<course>."]`.

**This side (`lib/knowsia-core/catalogue.ts`), best effort in every direction.**

| From | To Core | Notes |
|---|---|---|
| `createBatch`, `updateBatch` | `PUT /api/v1/service/catalogue/skus` | `cohort_seat`; `is_free` → 0; the early-bird (`discounted_fee` until `discount_cutoff_date`) as a rule with `external_ref = <batch>:early_bird`, replaced not doubled; `valid_to` the end date |
| `createCoupon`, `updateCoupon` | `PUT …/catalogue/coupons` | `external_ref = coupon:<id>`; course-scoped through the code prefix |
| `createCode` (partner code with a discount) | `PUT …/catalogue/coupons` | `external_ref = code:<id>`; a code with no discount is attribution only — Release 4's |
| the registration path, after `redeemCodeSystem` / `recordCouponRedemptionSystem` | `POST …/catalogue/coupons/redemptions` | only when the code or coupon moved the price; reference = the registration id; 404 (Core has no such coupon yet) is silent |
| the registration path | `POST …/catalogue/quote` | **only with `CORE_QUOTE_SHADOW=1`**: what would Core have charged; a difference is a Sentry event `[core-quote-disagreement]` with both figures |

**A code string is ONE thing in Core.** This app keeps standalone coupons and partner codes in two
tables and they can carry the same string; Core cannot. The first sync found exactly three —
`ESGPART2`, `AI02PART`, `ERMPART`: deactivated partner codes carrying the same discount as the live
coupon that replaced them on 2026-08-07. The coupon is the record; the retired code is skipped and
the script says so. A live partner code created with a coupon's string will be refused by Core
(409) and reported to Sentry — that is a real conflict a person should see, not a bug.

**Backfill.** `node scripts/sync-catalogue-to-core.mjs --dry-run` then live: 11 batches, 6
coupons, 3 live partner codes, 14 redemptions (2026-09-19). Idempotent; re-run after any gap.

**Verification.** `tests/unit/knowsia-core-contract.test.ts` pins `PUT …/catalogue/skus`,
`PUT …/coupons`, `POST …/coupons/redemptions`, `POST …/quote` and `GET …/fx` against the regenerated
contract (`Coding Docs/contracts/service-api.v1.json`). Over there: `tests/platform/test_catalogue.py`
(21), the full suite 1449, migration 008 upgraded / downgraded / re-upgraded from scratch before
release; Railway `ca3ed809`, `core_alembic_version = 008_core_catalogue`; live `POST /api/v1/quote`
prices 25 credits at 7,000 pesewas and Standard — One Sitting at USD 38.87 naming the feed row.

**Watch before Release 2.** 24 h of the study app's `/admin/failed-events` and this app's Sentry
jobs `core-catalogue:*`; then turn `CORE_QUOTE_SHADOW=1` on for a week and read the disagreement
count — the expected sources of difference are rounding (`round2` here vs pesewa arithmetic there)
and a coupon consumed here that Core's `one_per_subject` would have refused.

## 2. Release 2 — Organisations (built 2026-09-19; released after Release 1's 24-hour watch)

**What Core holds.** `core_organisations` — one per (product, external_ref): this app's `companies`
row, and Study's retired `corp_groups` (copied in by platform 009 with `product = 'study'`, then
dropped). Contacts, a `billing_contact`, a TIN, a status with its reason. `core_organisation_members` —
email unique per organisation per product; a repeat updates and reinstates. `core_organisation_deals` —
seats × unit price, recomputed on write, naming a Release 1 SKU (a deal with no SKU is refused, 422).
**Core records what was sold to whom at what price; who sits in which seat stays this app's product
object** (`registrations.company_allocation_id`). A name or TIN match between two organisations is shown
to a person on `/admin/organisations` over there as a suggestion and never merged — the identity rule.

**This side (`lib/knowsia-core/organisations.ts`), best effort in every direction.**

| From | To Core | Notes |
|---|---|---|
| `createCompany` | `PUT /api/v1/service/organisations` | one organisation per `companies.id`; the Core id written back to `companies.core_organisation_id` |
| `createSeatAllocation` | `PUT …/organisations/{org_id}/deals` | one deal per allocation id; the batch's `cohort.<course>.<cohort>` SKU at the allocation's own `price_per_seat`; forwards the company first when Core has not seen it; 422 (the batch has no SKU yet) is silent — the sync backfills; the Core id written back to `company_batch_allocations.core_deal_id` |
| `updateSeatAllocationStatus` | `POST …/organisations/deals/{allocation id}/status` | completed / cancelled with the reason; 404 (Core never saw it) is silent |

Migration `202609190071_core_organisation_refs.sql` adds the two nullable key columns (`npx supabase db
push`). `scripts/sync-companies-to-core.mjs --dry-run` backfills companies then allocations — run
`sync-catalogue-to-core.mjs` first, since a deal names the batch's SKU.

**The bug fixed with it.** `addEmployeesToAllocation` registered every corporate employee at the batch's
PUBLIC fee (`courseFee: batch.courseFee`), not the allocation's `price_per_seat` — the price the company
actually agreed and is invoiced at (BR-27's "the seat is the sale"). It now passes the allocation's
price (0 for a free batch), and `tests/unit/corporate-service.test.ts` pins it. Registrations created
before 2026-09-19 from an allocation carry the batch fee on their payment row; the invoice totals on
the allocation detail read from those rows, so a person should compare `amountInvoiced` with
`seats_used × price_per_seat` on the live allocations before relying on either figure.

**Verification.** Over there `tests/platform/test_organisations.py` (9); the full suite 1454; migration 009
proved on a throwaway database with a seeded `corp_groups` stub (the row became an organisation with its
admin and member; the tables were gone; downgrade / upgrade round-trips). Here `corporate-service.test.ts`
(+1) and the contract test pin the four routes; the full suite 1133.

## 3. Release 3 — Analytics across products (planned)

No new table. `POST /api/v1/service/events` — this app raises `PAYMENT_SETTLED` from
`runPaidTransitionSideEffects` (paid path only), key `registration:<registration id>:<transaction id>`,
payload `amount_minor, currency, reference, email, participant_id, registration_id, sku_code,
organisation_ref, source`. The idempotency key is the door's key. Core's KPI page gains "By product";
a non-GHS payment without an FX row is listed as unconverted, never invented.
`scripts/backfill-payments-to-core.mjs` for paid `payment_events` since 2026-01-01.

## 4. Release 4 — Affiliates, attribution half (planned)

`core_partners`, `core_referral_codes`, `core_referral_clicks`, `core_referral_attributions` (one per
person per product; method code | link | qr | manual; flags self_referral / existing_lead / repeat /
late). This side forwards partners (create, approve, suspend), codes, clicks (`/r/<code>`) and
attributions (from `redeemCodeSystem`, with the flags it already computes). Commission accrual is
untouched. `POST …/leads/converted` and `reportPaidSeatToCoreSystem` are deleted then — Release 3's
payment event converts the lead. The exit criterion is one test over there: a referral survives a
cross-product sign-up.
