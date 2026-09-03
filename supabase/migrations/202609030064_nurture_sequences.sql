-- Nurture sequence engine (Revenue OS Phase 2, 2026-09-03).
--
-- Until now every marketing touch was either a hardcoded lifecycle email or a
-- one-shot manual campaign. This adds multi-step sequences: a trigger enrolls
-- a lead or registration, and the daily cron sends each step when its offset
-- comes due. Sequences ship seeded but INACTIVE — nothing sends until an
-- admin reviews the copy and flips a sequence on (same posture as campaign
-- live-send toggles).
begin;

create table public.nurture_sequences (
    id          uuid primary key default gen_random_uuid(),
    -- Stable machine key ('lead-nurture') so code can reference a seeded
    -- sequence without hardcoding a uuid.
    key         text not null unique,
    name        text not null,
    trigger     text not null check (trigger in
                  ('lead_new','lead_lost','registration_lapsed','post_course')),
    channel     text not null default 'email' check (channel in ('email')),
    is_active   boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table public.nurture_steps (
    id            uuid primary key default gen_random_uuid(),
    sequence_id   uuid not null references public.nurture_sequences(id) on delete cascade,
    step_number   integer not null check (step_number > 0),
    -- Days after ENROLLMENT (not after the previous step): offsets stay
    -- meaningful when a middle step is deleted.
    offset_days   integer not null check (offset_days >= 0),
    subject       text not null,
    body          text not null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (sequence_id, step_number)
);

create table public.nurture_enrollments (
    id              uuid primary key default gen_random_uuid(),
    sequence_id     uuid not null references public.nurture_sequences(id) on delete cascade,
    lead_id         uuid references public.leads(id) on delete cascade,
    registration_id uuid references public.registrations(id) on delete cascade,
    email           text not null,
    full_name       text not null,
    -- Context tokens frozen at enrollment ({{course_name}} etc.) — the thing
    -- being referenced (a lapsed cohort) may not be resolvable later.
    context         jsonb,
    next_step       integer not null default 1,
    enrolled_at     timestamptz not null default now(),
    -- Precomputed send time for the CURRENT next_step, so the dispatcher is
    -- one indexed query, not a per-row offset calculation.
    next_send_at    timestamptz,
    status          text not null default 'active'
                      check (status in ('active','completed','stopped')),
    stopped_reason  text,
    updated_at      timestamptz not null default now(),
    check (lead_id is not null or registration_id is not null)
);

-- One enrollment per target per sequence, ever — re-triggering must not
-- restart a sequence someone already received.
create unique index uq_nurture_enrollment_lead
    on public.nurture_enrollments (sequence_id, lead_id) where lead_id is not null;
create unique index uq_nurture_enrollment_registration
    on public.nurture_enrollments (sequence_id, registration_id) where registration_id is not null;
create index idx_nurture_enrollments_due
    on public.nurture_enrollments (next_send_at) where status = 'active';

alter table public.nurture_sequences enable row level security;
alter table public.nurture_steps enable row level security;
alter table public.nurture_enrollments enable row level security;

create policy staff_read_nurture_sequences on public.nurture_sequences
for select to authenticated using (public.fn_current_role() in ('admin','marketing','management'));
create policy staff_read_nurture_steps on public.nurture_steps
for select to authenticated using (public.fn_current_role() in ('admin','marketing','management'));
create policy staff_read_nurture_enrollments on public.nurture_enrollments
for select to authenticated using (public.fn_current_role() in ('admin','marketing','management'));
-- Writes go through the service-role client only (service layer enforces
-- admin/marketing), same posture as campaigns.

commit;
