# 25 — Knowsia Core, Phases 5 and 6: Payments, and the money half of Affiliates

**Status:** planned and built from 2026-09-20. Founder direction: "Plan the phase 5 phase 6 now and
implement them." Two releases, one platform migration each, each released and read back before the
next: **R5 Payments (platform 012) → R6 Affiliates, money half (platform 013)**. Doc 22 §7 rows 5
and 6 are the scope and the exit criteria; Doc 22 §8 applies to every module here; Doc 23 §1 is the
shape every module takes and is not repeated. Doc 24 is Phase 4 and stays the record for the doors
this builds on (the catalogue's quote, the events door, the affiliates doors).

**Decisions taken in the planning, 2026-09-20** (the founder asked for the plan and the build in one
breath, so these are stated here to be corrected rather than asked):

1. **One Paystack account, one webhook URL, and Core is the receiver.** Both apps already share one
   `PAYSTACK_SECRET_KEY`. Core's `POST /api/v1/core/webhooks/paystack` verifies the HMAC, records
   every event once (`core_payment_events`, keyed by event + reference), writes the money ledger
   (`core_payments`) and ROUTES: a Study charge is applied in-process; a Registration charge (one
   carrying `metadata.registration_id`, or a Core checkout of product `registration`) is FORWARDED
   to this app's existing `POST /api/webhooks/paystack` with the raw body and Paystack's own
   signature, so this app's handler and its `unique(transaction_id)` idempotency stay exactly as
   they are; a transfer or refund event updates Core's own rows; anything else is dead-lettered for
   a person. **The flip is one change in the Paystack dashboard** (the webhook URL) and the founder
   makes it; until then every old route still works — Study's old `/api/v1/webhooks/paystack` now
   runs the same Core handler, and this app's route is untouched — so nothing depends on the day the
   URL moves, and both old handlers are the 30-day dead-letter Doc 22 §10 asks for.
2. **The money ledger is Core's; the credit BALANCE stays Study's.** `core_payments` is one row per
   settled charge on any product (Study's plans and packs through `apply_payment`, this app's seats
   through the events door or the webhook), and it is what reconciliation, refunds and commissions
   read. `m1_credit_ledger` stays in M1: a credit is an entitlement (Doc 22 §3 — entitlements live
   with the product that sells them), and M3/M6 spend through `auth/index.py` today. Moving the
   balance would change every spend gate for no gain in truth; moving the MONEY is what Phase 5 is
   for.
3. **Checkout on Core, behind a flag on this side.** `create_checkout_internal` is the one place a
   Paystack transaction is initialised — it quotes through Release 1, initialises with Paystack,
   records `core_checkouts` (the reference, the expected amount, the evidence) and returns the
   `access_code`. Study's plan and credit checkouts call it from release day. This app's
   `PaystackCheckout` (client-side `PaystackPop.setup` with a client-computed amount) is replaced by
   a server-minted access code (`POST /api/checkout` → Core) resumed in Paystack's inline v2 —
   **only when `CORE_CHECKOUT=1`**; off, the old inline flow runs unchanged. A balance on a part-paid
   registration is this app's product fact, so the door takes `amount_minor` for that one case and
   records why.
4. **Transfers are Core's rails, switched off until the founder turns them on.** `core_transfer_
   recipients` / `core_transfers` and `initiate_transfer_internal` wrap Paystack's transfer API
   (mobile money and bank). With `PAYSTACK_TRANSFERS_ENABLED` unset a payout is recorded as
   `manual` — finance pays by hand and types the reference — so the ledger is right on day one and
   the rail is a switch, not a rewrite.
5. **Reconciliation is a read, run by a person.** `scripts/reconcile_paystack.py --days 30` (and
   `GET /api/v1/admin/payments/reconciliation`) lists Paystack's own transactions for the window and
   compares them to `core_payments` to the pesewa: matched, missing in Core, missing at Paystack,
   amount differs. Nothing is written by the comparison.
6. **A commission is derived from the ledger, never ahead of it.** `core_commissions` rows are
   written by the same outbox consumer that converts an attribution (`affiliate_conversion`,
   Release 4): a settled payment matched to a referred person → the commission, in the same
   delivery. The rates are the programme's (`knowsia_growth_partner_programme.md`): ambassadors
   12 / 15 / 18 % by paid enrolments in the last 30 days (10 and 30 the steps), tutors 10 %,
   institutions a flat GHS 30 / 40 / 50 by paid enrolments in the last 365 days (50 and 200 the
   steps), strategic partners only the rate typed on their record. Seeded into `core_commission_
   rules` so the founder changes a number, not code. A flagged referral (`existing_lead`,
   `self_referral`) is a VOID commission with the reason on it; a `late` one is HELD for a person.
   A refund reverses through the same ledger: `PAYMENT_REFUNDED` → a pending / approved / payable
   commission is `reversed`; a paid one gets a negative clawback row that nets on the next statement.
7. **Manual approve for the first month.** The 14-day hold flips pending → approved on the daily
   tick ONLY when `core_settings commissions.auto_approve` is on; it starts off, a person approves
   on `/admin/affiliates` → Commissions, and the founder flips it with an audit row once the first
   statements have been read. Payable is always a person (finance review), and a payout needs GHS 100.
8. **Statements through Communications.** On the 1st the monthly close writes one
   `core_commission_statements` row per partner with activity (opening, earned, reversed, paid,
   closing, the lines), emails it through `send_message_internal` with the CSV attached and a
   signed download link that needs no login (the files' HMAC-token pattern), and the exit
   criterion — the first statement matches a hand calculation — is a test that computes one by
   hand and asserts the statement's figures.
9. **This app stops computing commissions.** `accrueCommissionOnPaymentSystem` and
   `runCommissionQualificationDispatch` are deleted (the writers); the partner portal, the tutor and
   student referral panels and the staff commissions screen READ Core (`GET …/affiliates/partners/
   {ref}/ledger`); marking payable, recording a payout and redeeming a commission as course credit
   go through Core's doors. `scripts/sync-commissions-to-core.mjs` carries the existing
   `partner_commissions` / `partner_payouts` rows over with their statuses so no partner's history
   moves; the local tables stay readable for 30 days and are dropped in Phase 7.

## 1. Release 5 — Payments (platform 012 `012_core_payments`)

**Tables** (`app/platform/models/payments.py`): `core_checkouts` (product, reference UNIQUE,
provider, sku_code / sku_id / qty, `quote` — the evidence, amount_minor, currency, payer_email,
payer_ref, coupon_code, external_ref, metadata, callback_url, authorization_url, access_code,
status pending | paid | abandoned | failed, paid_at); `core_payments` (provider + reference UNIQUE,
product, kind subscription | credits | cohort_seat | corporate | tuition | other, checkout_id,
amount_minor, fee_minor, currency, channel, payer_email, payer_ref, sku_code, organisation_ref,
status settled | partially_refunded | refunded | reversed, refunded_minor, settled_at, `raw` —
Paystack's data, bounded, external_ref, reconciled_at, provider_transaction_id); `core_payment_
events` (provider, event_type, event_key UNIQUE, reference, payload, signature_ok, routed_to
study | registration | core | none, outcome applied | forwarded | duplicate | unmatched | failed,
error, dead_lettered_at, received_at); `core_transfer_recipients` (owner_type partner | tutor |
organisation, owner_id, name, method mobile_money | bank, bank_code, account_last4,
provider_recipient_code, active); `core_transfers` (reference UNIQUE, recipient_id, purpose
commission_payout | tutor_payout | refund | other, owner_type / owner_id, amount_minor, currency,
reason, status pending | success | failed | reversed | manual, provider_transfer_code,
failure_reason, initiated_by, settled_at, raw).

**Rules** (`services/payments.py`, `services/paystack_gateway.py`, `services/transfers.py`;
`PaymentError`): every Paystack call is in the gateway and nowhere else (Study's
`auth/services/payments.py` provider stays as the adapter it was, called by the gateway; no third
copy); the webhook is verified over the RAW body with `PAYSTACK_WEBHOOK_SECRET`, falling back to
`PAYSTACK_SECRET_KEY` (Paystack signs with the secret key); an event is recorded before it is acted
on, and acted on once (`event_key` = `<event>:<reference>` — Paystack retries the same event);
`record_payment` is idempotent on (provider, reference) and is the ONE place `PAYMENT_SETTLED` is
raised for a Core-recorded payment (the events door's `PAYMENT_SETTLED` and Study's `apply_payment`
both go through it, so a payment is one ledger row and one event whichever door it came through);
a refund is `refund_payment` — amount ≤ what is left, a reason, an audit row, `PAYMENT_REFUNDED`
raised; a transfer is `initiate_transfer` — a recipient must exist, the amount is minor units,
the reference is Core's, and with transfers disabled the row is `manual`. Routing: `metadata.
product` or a `core_checkouts` row names the product; a `kn-` / `kc-` reference is Study's; a
`metadata.registration_id` or a `REG-` reference is this app's and is forwarded to
`COURSE_REG_PAYSTACK_WEBHOOK_URL` (default `https://reg.knowsia.com/api/webhooks/paystack`) with
the same body and signature; a forward that fails is retried by the outbox pattern (the event row
keeps `outcome=failed` and the tick retries three times) and dead-lettered after that.

**Index**: `create_checkout_internal(db, *, product, sku_code | sku_id, qty, payer_email,
payer_ref, callback_url, coupon_code, external_ref, metadata, amount_minor (balance only),
created_by)`, `checkout_by_reference_internal`, `record_payment_internal(db, *, product, reference,
amount_minor, kind, payer_email, payer_ref, currency, channel, sku_code, organisation_ref, raw,
settled_at, provider, external_ref, attribution)`, `payment_by_reference_internal`,
`refund_payment_internal`, `handle_paystack_webhook_internal(db, raw_body, signature) -> {event_key,
routed_to, outcome}`, `retry_payment_events_internal`, `payments_summary_internal`,
`list_payments_internal`, `list_payment_events_internal`, `reconcile_paystack_internal(db, since,
until)`, `ensure_transfer_recipient_internal`, `initiate_transfer_internal`, `mark_transfer_
internal` (manual paid), `list_transfers_internal`.

**Doors**: webhook `POST /api/v1/core/webhooks/paystack` (Core's; Study's old route runs the same
handler); admin `/api/v1/admin/payments` (`GET /summary`, `GET ""`, `GET /{id}`, `POST /{id}/refund`,
`GET /events`, `POST /events/{id}/retry`, `GET /transfers`, `POST /transfers/{id}/paid`,
`GET /reconciliation?days=`); service `/api/v1/service/payments` (`POST /checkout` → the access
code and authorization URL, `GET /by-reference`, `POST /refunds`). The events door's
`PAYMENT_SETTLED` now also writes `core_payments`.

**Study code**: `paystack.create_checkout` and `credits.create_checkout` call `create_checkout_
internal`; `apply_payment` and `apply_credit_purchase` call `record_payment_internal` (which raises
`PAYMENT_SETTLED`) instead of enqueueing it themselves; `verify_reference` marks the checkout paid.
`/admin/payments` "Money": strip (settled this month by product, refunded, transfers waiting,
webhooks to look at), tabs Payments (a refund confirmed as a sentence with the amount and the
reason), Webhooks (what came in, what was forwarded, what nobody matched — "send it again"),
Transfers, Reconciliation (run, read, nothing written). The KPI report gains `payments` (settled /
refunded / net in the window, by product) read from the ledger.

**This app**: `lib/knowsia-core/payments.ts` (`createCheckoutOnCore`, `refundOnCore`);
`POST /api/checkout` (portal session or the public register flow's registration id) mints a Core
checkout for the registration's balance; `components/PaystackCheckout.tsx` resumes the access code
in inline v2 when `CORE_CHECKOUT=1`, else runs the old flow; the webhook route is unchanged.
`scripts/backfill-payments-to-core.mjs` (R3) already carries the history; the ledger row is now
written by the door.

**Exit** (Doc 22 §7 row 5): the webhook flipped — Core's URL receives and routes, both old
handlers alive for 30 days; `m1_payments` reconciled to Paystack's export to the pesewa
(`reconcile_paystack.py`, and a test that reconciles Study's ledger with `core_payments`).

**Released 2026-09-20** — Railway `3858bdff`; `core_alembic_version = 012_core_payments`; contract §29. Open for the
founder: the Paystack dashboard's webhook URL → Core's; `CORE_CHECKOUT=1` on Vercel when ready;
`PAYSTACK_TRANSFERS_ENABLED` on Railway when transfers are approved.

## 2. Release 6 — Affiliates, the money half (platform 013 `013_core_commissions`)

**Tables** (`models/commissions.py`): `core_commission_rules` (category, kind percent | flat,
tiers `[{min_count, value}]` — bps for percent, minor units for flat, window_days, effective_from,
active); `core_commissions` (partner_id, attribution_id UNIQUE, product, payment_reference,
base_minor, rate_bps, flat_minor, amount_minor, currency, status pending | approved | payable |
paid | redeemed | reversed | void, qualifies_at, hold_reason, void_reason, approved_at / by,
payable_at / by, paid_at, payout_id, statement_id, reversal_of, redeemed_ref, external_ref —
this app's `partner_commissions.id` for the carried-over rows); `core_commission_statements`
(partner_id, period_start, period_end UNIQUE with partner, opening / earned / reversed / paid /
closing minor, lines, message_id, sent_at); `core_payouts` (partner_id, total_minor, currency,
method transfer | manual | redeemed, transfer_id, reference, commission_ids, status pending | paid |
failed, created_by, paid_at). `core_partners` gains `commission_rate_bps` (strategic, negotiated),
`payout_method`, `payout_account_last4`, `recipient_id`.

**Rules** (`services/commissions.py`, pure first): `rate_for(rules, category, paid_count, at)`;
`compute(base_minor, rule) -> amount_minor` (percent: base × bps ÷ 10 000, rounded half up to the
pesewa; flat: the tier's minor units; zero base → zero); `qualifies_at = settled_at + 14 days`;
`accrue(attribution, payment)` — void with the reason when the attribution carries `existing_lead`
or `self_referral`, held (`hold_reason=late`) when it converted after the window, otherwise
pending; a partner not active → void; `reverse(payment_reference, amount_refunded)` — pending /
approved / payable → reversed, paid → a negative row with `reversal_of`; `close_period(partner,
month)` → the statement's figures from the rows (opening = last statement's closing; earned =
commissions that became approved or payable in the period; reversed; paid = payouts in the period;
closing = opening + earned − reversed − paid), and a statement is never recomputed once sent.
**Nothing here is money moving**: a payout is a `core_payouts` row plus a transfer through Release
5's rail (or `manual` with the reference typed), and a commission is `paid` only when the transfer
succeeds or the person records it.

**Index**: `commission_rules_internal`, `set_commission_rule_internal`, `accrue_commission_internal`
(called by the affiliate consumer), `reverse_commissions_internal` (called by the refund consumer),
`list_commissions_internal`, `approve_commission_internal`, `hold_commission_internal`,
`void_commission_internal`, `mark_payable_internal`, `partner_ledger_internal(db, partner_id) ->
{totals by status, payable_ids, recent payouts, statements}`, `create_payout_internal(db, partner_id,
*, commission_ids, method, reference, actor_id)`, `mark_payout_paid_internal`, `redeem_commissions_
internal(db, partner_id, commission_ids, *, reference)`, `close_statements_internal(db, period)`,
`statement_csv_internal`, `statement_token_internal / verify`, `commissions_summary_internal`.
Consumers: `affiliate_events.on_payment_settled` calls `accrue` after `convert`; a new
`PAYMENT_REFUNDED` consumer `affiliate_reversal`. Scheduler: `run_commission_qualify_once` daily
(pending → approved when `auto_approve` is on), `run_commission_close_once` on the 1st.

**Doors**: admin `/api/v1/admin/affiliates/commissions` (`GET`, `POST /{id}/approve`, `/hold`,
`/void`, `/payable`), `/payouts` (`GET`, `POST` — "Pay GHS X to Ama by MTN MoMo" as a sentence,
`POST /{id}/paid`), `/statements` (`GET`, `POST /close` — run the close now, `GET /{id}.csv`),
`/rules` (`GET`, `PUT`), `/settings` (`auto_approve` with an audit row); public
`GET /api/v1/affiliates/statements/{id}.csv?t=` (signed, no login); service
`/api/v1/service/affiliates/partners/{ref}/ledger`, `POST …/{ref}/redeem`, `PUT …/{ref}/payout-details`.

**This app**: `lib/knowsia-core/commissions.ts`; the partners service's `summarizeCommissions`,
`listCommissions`, `markCommissionsPayable`, `recordPayout`, `validateAndTotalRedeemableCommissions
System` and `markCommissionsRedeemedSystem` become callers of Core; the accrual and the
qualification dispatch are deleted (and the cron line with them); `updatePartner` forwards payout
details; `scripts/sync-commissions-to-core.mjs` carries the history.

**Exit** (Doc 22 §7 row 6): `test_first_commission_statement_matches_a_hand_calculation` — a
partner, a referred payment of GHS 1,200, 12 % → GHS 144.00 pending → approved → the statement's
earned and closing read 144.00; a GHS 300 refund reverses 36.00 through the same ledger; the tiers
step at 10 and 30.

**Released 2026-09-20** — Railway `054dbbb8`; `core_alembic_version = 013_core_commissions`; contract §30;
KnowsiaApp PLAN.md §3.24. Built as specified, with three additions found in the port: the staff console's
doors (`GET …/affiliates/commissions`, `POST …/commissions/payable`, `POST …/partners/{ref}/payouts`) so this
app's `/partners` Commissions & Payouts view reads and acts on Core's rows; the history doors
(`POST …/commissions/import`, `POST …/payouts/import`, idempotent on this app's row ids — the live row
outranks history); and `ensure_default_rules`, so a database built without the migration's seed earns by
the programme's rules and never silently by none. **Phase 6 closes the Core plan (Doc 22 §7 rows 1–6).**
Open for the founder: run `scripts/sync-partners-to-core.mjs` then `scripts/sync-commissions-to-core.mjs
--dry-run` / live; switch auto-approve on after a month of reading the queue; `PAYSTACK_TRANSFERS_ENABLED`
when transfers are approved.

## 3. What is deliberately NOT here

Flutterwave (Phase 4 of the product plan, Nigeria); Paystack subscriptions for this app (a cohort is
one charge); moving `m1_credit_ledger`; a partner login on Study (the partner portal stays here
until Phase 7); performance bonuses (§9 of the programme — a rule row when the founder sets one).
