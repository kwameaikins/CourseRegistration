-- The Admin Assistant's write-confirm tools moved from a hardcoded 3-value
-- discriminated union (modules/staff-actions) onto a general tool registry
-- (modules/agent-tools) where a new write-confirm tool is just a registered
-- object, not a code change here. Drop the CHECK so new tool names can be
-- logged without a migration each time the registry grows.
begin;

alter table public.staff_action_audit_log
  drop constraint staff_action_audit_log_action_type_check;

commit;
