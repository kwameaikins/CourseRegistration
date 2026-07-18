begin;

-- BR-06: payment_status is derived by a BEFORE trigger when amount_paid or
-- course_fee changes. PostgreSQL's UPDATE OF list is based on the original
-- SET clause, so an AFTER UPDATE OF payment_status trigger does not observe
-- that derived change. Listen to the source columns and compare old/new
-- payment_status inside the trigger function instead.
drop trigger if exists trg_sync_registration_status on public.payments;
drop trigger if exists confirm_on_paid on public.payments;

create or replace function public.fn_sync_registration_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.payment_status = 'Paid'
       and old.payment_status is distinct from 'Paid' then
        update public.registrations
           set registration_status = 'Confirmed',
               updated_at = now()
         where id = new.registration_id
           and registration_status = 'Registered';
    end if;

    return new;
end;
$$;

create trigger trg_sync_registration_status
after update of amount_paid, course_fee on public.payments
for each row execute function public.fn_sync_registration_status();

-- Remove the one-off live-database repair after replacing it with the
-- canonical migration-managed trigger above.
drop function if exists public.fn_confirm_registration_on_paid();

commit;
