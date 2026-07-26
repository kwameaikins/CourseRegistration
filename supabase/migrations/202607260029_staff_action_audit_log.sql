-- Audit trail for write actions the Admin Assistant executes on a staff
-- member's behalf (propose-then-confirm architecture: the model can only
-- propose; a human confirm click executes via app/api/assistant/execute-action,
-- which writes here). Mirrors the live_session_audit_log precedent.
begin;

create table public.staff_action_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_staff_id uuid references public.staff_users(id) on delete set null,
  action_type text not null check (action_type in ('discount', 'installment_plan', 'transfer')),
  target_registration_id uuid references public.registrations(id) on delete set null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index staff_action_audit_log_registration_created_at_idx
  on public.staff_action_audit_log (target_registration_id, created_at desc);

alter table public.staff_action_audit_log enable row level security;

create policy admin_read_staff_action_audit_log
on public.staff_action_audit_log for select
to authenticated
using (public.fn_current_role() = 'admin');

create policy admin_insert_staff_action_audit_log
on public.staff_action_audit_log for insert
to authenticated
with check (public.fn_current_role() = 'admin');

create policy management_read_staff_action_audit_log
on public.staff_action_audit_log for select
to authenticated
using (public.fn_current_role() = 'management');

commit;
