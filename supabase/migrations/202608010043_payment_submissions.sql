-- Self-service payment submission + staff approval for MoMo/Bank Transfer
-- (founder-requested 2026-08-01). Today, staff manually reconcile these off
-- an emailed transaction reference; this gives registrants a portal form
-- (with an optional slip/screenshot upload) that queues for finance/admin
-- review. Only the review's approval branch ever touches `payments` (via
-- the existing applyPaymentUpdate), so BR-04/05/06/12 all keep working
-- unchanged. Shape mirrors attendance_exceptions (202607290038) almost
-- directly: submitter-raised row, always starts 'pending', only a staff
-- review can change real state.
begin;

-- Slip files are stored in Cloudflare R2 (lib/r2/client.ts), not Supabase
-- Storage — this table only ever holds the R2 object key (slip_file_path),
-- never file bytes or a public URL.
create table public.payment_submissions (
    id                      uuid primary key default gen_random_uuid(),
    registration_id         uuid not null references public.registrations(id) on delete cascade,
    method                  text not null check (method in ('MTN MoMo', 'Bank Transfer')),
    amount                  numeric(10,2) not null check (amount > 0),
    transaction_reference   text,
    payment_date            date not null,
    slip_file_path          text,
    participant_notes       text,
    status                  text not null default 'pending'
                                check (status in ('pending', 'approved', 'rejected')),
    reviewed_by             uuid references public.staff_users(id) on delete set null,
    reviewed_at             timestamptz,
    review_note             text,
    created_at              timestamptz not null default now()
);

comment on table public.payment_submissions is
    'Registrant-submitted MoMo/bank-transfer payment claims. Always starts pending; only finance/admin review can apply it to payments (BR-12 verified_by still comes from the reviewing session).';

create index payment_submissions_status_created_at_idx
    on public.payment_submissions (status, created_at desc);
create index payment_submissions_registration_idx
    on public.payment_submissions (registration_id);

-- DB-level backstop for "block a second submission while one's pending" —
-- a partial unique index rather than a plain one, since approved/rejected
-- rows must be free to accumulate per registration over time.
create unique index payment_submissions_one_pending_per_registration
    on public.payment_submissions (registration_id) where status = 'pending';

alter table public.payment_submissions enable row level security;

create policy finance_admin_full_payment_submissions
on public.payment_submissions for all to authenticated
using (public.fn_current_role() in ('finance', 'admin'))
with check (public.fn_current_role() in ('finance', 'admin'));

grant select, insert, update, delete on table public.payment_submissions to authenticated;

-- No participant-facing RLS policy: the portal submit path runs through the
-- service-role client, gated by modules/portal's requirePortalSession plus
-- an ownership check (the registration must belong to the calling
-- participant's own session) before the insert ever happens.

commit;
