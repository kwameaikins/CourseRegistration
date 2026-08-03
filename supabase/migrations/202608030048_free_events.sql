-- Free events / webinars (founder request 2026-08-03): a Batch that carries
-- no fee at all. Registrants are confirmed the moment they sign up, get the
-- joining details immediately, and are never asked for money.
--
-- A free webinar is deliberately NOT a new entity — it is an ordinary
-- Course + Batch with course_fee = 0 and is_free set. Batches already carry
-- everything a webinar needs (date, time, facilitator, zoom_link,
-- resources_link, capacity), and the whole registration -> portal ->
-- attendance -> certificate chain works unchanged once payment_status is
-- right. The flag lives on the Batch, not the Course, so the same webinar
-- series can be free one month and paid the next.
--
-- Two DIFFERENT things produce a zero fee and they are handled differently:
--   * is_free Batch          — the event has no price. Suppress payment UI,
--                              keep out of revenue reporting, gate the
--                              certificate on attendance instead of payment.
--   * zero fee on a PAID Batch (a 100% code discount, or an admin's full fee
--                              waiver) — the person owes nothing but the
--                              course still has a price, so receipts and
--                              collection metrics still apply.
-- Enrollment mechanics below therefore key on "amount_paid covers course_fee"
-- (which catches all three cases); the cosmetic and reporting suppression in
-- application code keys on is_free.
begin;

alter table public.batches
    add column is_free boolean not null default false;

-- A free Batch cannot also carry a price or an early-registration discount —
-- the two are contradictory, and effectiveCourseFee() (lib/utils.ts) would
-- otherwise have a discounted_fee to return for a zero-fee event.
alter table public.batches
    add constraint free_batch_has_no_fee
        check (not is_free or (course_fee = 0 and discounted_fee is null));

comment on column public.batches.is_free is
    'True for a free event/webinar: no fee is ever charged. Requires course_fee = 0 and no early-registration discount. Distinct from a paid Batch whose fee happened to reach zero via a 100% code discount or a full staff waiver — those still count as revenue-bearing.';

-- BR-04 (revised 2026-08-03): a Payment is settled when amount_paid covers
-- course_fee — INCLUDING the 0 >= 0 case. The original ordering tested
-- amount_paid <= 0 first, so a zero-fee Payment short-circuited to 'Unpaid'
-- before course_fee was ever consulted and could never become 'Paid'.
--
-- This also fixes a live bug unrelated to free events: an admin granting a
-- 100% fee waiver to someone who had paid nothing (payments/service.ts
-- applyDiscount, wouldZeroBalance) left the Payment 'Unpaid' forever, so
-- runPaidTransitionSideEffects never fired — no confirmation, no Zoom
-- registration, no join link — while the reminder cron kept chasing them for
-- a balance of GHS 0.00.
--
-- The settled-first ordering matches fn_derive_installment_status
-- (202607240017_waitlist_payment_plans.sql), which has always ordered its
-- branches this way.
create or replace function public.fn_derive_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.amount_paid >= new.course_fee then
        new.payment_status := 'Paid';
    elsif new.amount_paid <= 0 then
        new.payment_status := 'Unpaid';
    else
        new.payment_status := 'Part Payment';
    end if;

    new.updated_at := now();
    return new;
end;
$$;

-- BR-06 (revised 2026-08-03): a zero-fee Payment is now born 'Paid' on
-- INSERT, and no UPDATE ever follows it, so an AFTER UPDATE trigger would
-- never confirm the Registration. Listen on INSERT as well.
--
-- OLD is not assigned for an INSERT, and referencing a field on it raises
-- "record 'old' is not assigned yet". SQL does not guarantee short-circuit
-- evaluation of AND/OR, so guarding with `tg_op = 'INSERT' or old...` inside a
-- single boolean expression is not safe. The TG_OP check is therefore a
-- separate, nested IF statement, which PL/pgSQL does evaluate in order.
create or replace function public.fn_sync_registration_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.payment_status <> 'Paid' then
        return new;
    end if;

    -- Already Paid before this write: nothing to advance (e.g. a part-payment
    -- top-up on a row that had already settled).
    if tg_op = 'UPDATE' then
        if old.payment_status = 'Paid' then
            return new;
        end if;
    end if;

    update public.registrations
       set registration_status = 'Confirmed',
           updated_at = now()
     where id = new.registration_id
       and registration_status = 'Registered';

    return new;
end;
$$;

drop trigger if exists trg_sync_registration_status on public.payments;

create trigger trg_sync_registration_status
after insert or update of amount_paid, course_fee on public.payments
for each row execute function public.fn_sync_registration_status();

-- Repair rows stranded by the old branch ordering: fully-covered Payments
-- (overwhelmingly past full fee waivers) that were left 'Unpaid'. Report them
-- rather than pretending they were handled — the side effects they missed
-- (confirmation email, WhatsApp group invite, Zoom registration and personal
-- join link) cannot be replayed from SQL, so staff must resend the joining
-- details for these registrations by hand.
do $$
declare
    stranded uuid[];
begin
    -- Under the new ordering, amount_paid >= course_fee always means 'Paid'.
    -- The only rows the old ordering could leave behind are the zero-covered
    -- ones (amount_paid = 0 against a fee of 0), so this is narrow by
    -- construction, not a blanket restatement of every payment's status.
    select coalesce(array_agg(registration_id), '{}'::uuid[])
      into stranded
      from public.payments
     where amount_paid >= course_fee
       and payment_status <> 'Paid';

    if array_length(stranded, 1) is null then
        raise notice 'free_events: no stranded fully-covered payments found.';
    else
        update public.payments
           set payment_status = 'Paid',
               updated_at = now()
         where registration_id = any(stranded);

        update public.registrations
           set registration_status = 'Confirmed',
               updated_at = now()
         where id = any(stranded)
           and registration_status = 'Registered';

        raise notice
            'free_events: repaired % stranded fully-covered payment(s). These registrations were never sent their confirmation, WhatsApp group invite or Zoom join link and have no zoom_registrants row — resend joining details manually for: %',
            array_length(stranded, 1), stranded;
    end if;
end;
$$;

-- Free-event welcome email. The paid 'welcome' template hardcodes the course
-- fee and promises payment instructions, so free registrants need their own
-- money-free variant rather than a conditional inside one body. Same
-- widen-the-CHECK pattern as 202607250028_installment_reminder_email_type.sql.
alter table public.email_templates
    drop constraint email_templates_email_type_check;

alter table public.email_templates
    add constraint email_templates_email_type_check
    check (
        email_type in (
            'welcome', 'payment_instruction', 'reminder_1', 'reminder_2',
            'reminder_3', 'reminder_4', 'payment_confirmation',
            'class_reminder_24h', 'class_reminder_2h', 'zoom_link',
            'whatsapp_invite', 'post_training_thankyou', 'upsell',
            'installment_reminder', 'free_welcome'
        )
    );

-- sms_log/whatsapp_log CHECKs are deliberately left alone. SMS keeps sending
-- message_type 'welcome' for a free event and branches only the body text, so
-- BR-07 deduplication semantics stay identical. WhatsApp is suppressed on
-- free Batches until a fee-free Meta template is approved (see
-- modules/communications/whatsapp-engine.ts).

commit;
