-- Knowsia Core Organisations (Coding Docs/24 §2, Phase 4 Release 2, 2026-09-19).
--
-- Core holds the organisation record (Doc 22 §7; founder decision). This app
-- keeps every company and seat allocation exactly where it is and writes
-- back the Core id as a shared KEY — nothing moves, nothing merges, and no
-- screen reads these columns yet. Who sits in which seat
-- (registrations.company_allocation_id) stays this app's.
begin;

alter table public.companies
    add column core_organisation_id uuid;
alter table public.company_batch_allocations
    add column core_deal_id uuid;

create index companies_core_organisation_idx on public.companies (core_organisation_id)
    where core_organisation_id is not null;
create index company_batch_allocations_core_deal_idx on public.company_batch_allocations (core_deal_id)
    where core_deal_id is not null;

comment on column public.companies.core_organisation_id is
    'Knowsia Core organisation this company is (Doc 22 §7 Phase 4). A shared key written by the forwarder; never a merge.';
comment on column public.company_batch_allocations.core_deal_id is
    'Knowsia Core deal this allocation is recorded as (Doc 22 §7 Phase 4). A shared key; the roster stays here.';

commit;
