-- Ad-hoc outbound calls (Admin Assistant tools, 2026-08-01): lets staff
-- trigger a one-off Vapi call to a registrant carrying a custom message,
-- alongside the 6 existing automated call types. call_log's call_type CHECK
-- constraint and its unique(registration_id, call_type) both need widening:
-- the plain unique pair would otherwise let a registrant receive at most one
-- ad-hoc call ever (it's meant to dedupe concurrent automated dispatch, not
-- cap staff-initiated one-offs), so 'ad_hoc' is carved out of the uniqueness
-- via a partial index while the other 6 types keep their existing dedup.
begin;

alter table public.call_log drop constraint call_log_call_type_check;
alter table public.call_log
  add constraint call_log_call_type_check check (
    call_type in (
      'payment_followup', 'bank_transfer_chase', 'no_show_recovery',
      'feedback_voice', 'upsell', 'inbound', 'ad_hoc'
    )
  );

alter table public.call_log drop constraint call_log_registration_id_call_type_key;
create unique index call_log_unique_non_adhoc
  on public.call_log(registration_id, call_type)
  where call_type <> 'ad_hoc';

commit;
