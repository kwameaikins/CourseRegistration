-- Tutor Portal Phase 4 (founder-approved 2026-07-31) — a lightweight audit trail for
-- tutor-initiated self-service actions (PIN changes, contact edits, and every new
-- tutor-portal write added from this migration forward). None of this was logged before.

begin;

create table public.tutor_action_audit_log (
    id                uuid primary key default gen_random_uuid(),
    tutor_id          uuid not null references public.tutors(id) on delete cascade,
    action_type       text not null,
    target_batch_id   uuid references public.batches(id) on delete set null,
    details           jsonb not null default '{}'::jsonb,
    created_at        timestamptz not null default now()
);

comment on table public.tutor_action_audit_log is
    'Append-only log of tutor-portal self-service actions. Written only via the service-role client, same RLS-as-defense-in-depth posture as tutor_auth/tutor_sessions.';

create index tutor_action_audit_log_tutor_created_at_idx
    on public.tutor_action_audit_log (tutor_id, created_at desc);

alter table public.tutor_action_audit_log enable row level security;
-- No policies: tutors have no Supabase Auth session for RLS to key off (BR-31), and
-- staff reads go through a service-role read gated by usersService.requireRole in the
-- application layer, matching the rest of the tutor portal's non-staff tables.

commit;
