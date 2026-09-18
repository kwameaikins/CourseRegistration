-- Invoice bill-to on a Registration (founder, 2026-09-18: a one-to-one tuition
-- student's employer "wants the invoice in the company name").
--
-- The invoice is a VIEW of the registration's live fee, payments and balance
-- (no stored invoice record), so the one thing that must persist is WHO it is
-- addressed to — otherwise preview, send and every re-send would disagree.
-- A bill-to is presentation, not a party to the registration: the participant
-- stays the registrant, pays through the same portal, MoMo or bank, and the
-- corporate module (companies, allocations, CORP- invoices) remains the route
-- for a company that buys seats and manages staff. This is for the boss who
-- wants a name on the paper.
--
-- Shape: { "name": "Company Ltd", "attention": "Kwame Mensah",
--          "address": "PMB 12, Accra", "email": "accounts@company.com" }
-- Only `name` is required. NULL = billed to the participant as before.
begin;

alter table public.registrations
    add column invoice_bill_to jsonb;

comment on column public.registrations.invoice_bill_to is
    'Optional bill-to for the registration invoice: {name, attention?, address?, email?}. NULL bills the participant. Presentation only — never changes who registered or who pays.';

commit;
