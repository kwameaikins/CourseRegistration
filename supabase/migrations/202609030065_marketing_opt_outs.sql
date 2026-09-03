-- Marketing opt-outs (Revenue OS Phase 2, 2026-09-03).
--
-- Until now there was NO unsubscribe mechanism on marketing sends — a
-- deliverability risk and a Ghana DPA exposure. One row per email address,
-- keyed lowercase; checked by campaigns, nurture sequences and upsell
-- marketing sends. TRANSACTIONAL lifecycle messages (payment instructions,
-- receipts, class reminders) are deliberately exempt: they are part of the
-- service someone registered for, not marketing.
begin;

create table public.marketing_opt_outs (
    id          uuid primary key default gen_random_uuid(),
    email       text not null unique,
    source      text not null default 'link' check (source in ('link','staff','bounce')),
    reason      text,
    created_at  timestamptz not null default now()
);

alter table public.marketing_opt_outs enable row level security;

create policy staff_read_marketing_opt_outs on public.marketing_opt_outs
for select to authenticated using (public.fn_current_role() in ('admin','marketing','management'));
-- Inserts come from the public unsubscribe endpoint via the service-role
-- client (HMAC-verified link) and from staff tools.

commit;
