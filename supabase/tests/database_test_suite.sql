-- =========================================================================
-- Database test suite — Document 9, Sections 3 & 5.
--
-- Run in the Supabase SQL editor (or psql) AFTER the foundation migration is
-- applied. Everything runs inside one transaction and is ROLLED BACK at the
-- end — no test data survives.
--
-- Covers the database-level guarantees:
--   T-BR03 (unique registration), T-BR04-01/02/03 (status derivation),
--   T-BR05-01 (generated balance), T-BR06-01/02 (status sync + guard),
--   T-BR07 (email_log dedup), T-BR14 (transaction_id uniqueness),
--   BR-01 trigger, fn_soft_delete_participant, hard-delete 30-day guard,
--   T-RLS-01/02/04/05/07 (role simulation via request.jwt.claims).
--
-- API-level cases (T-BR13, T-BR15, T-INT-*) are covered by the Vitest unit
-- suite and the live integration checklist.
-- =========================================================================

begin;

-- ---- fixtures -----------------------------------------------------------
insert into auth.users (id, email)
values
    ('00000000-0000-4000-8000-00000000a001', 'test-admin@test.local'),
    ('00000000-0000-4000-8000-00000000a002', 'test-tutor@test.local'),
    ('00000000-0000-4000-8000-00000000a003', 'test-finance@test.local'),
    ('00000000-0000-4000-8000-00000000a004', 'test-inactive@test.local');

insert into public.staff_users (id, user_id, full_name, email, role, is_active)
values
    ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-00000000a001', 'Test Admin',   'test-admin@test.local',   'admin',   true),
    ('00000000-0000-4000-8000-00000000b002', '00000000-0000-4000-8000-00000000a002', 'Test Tutor',   'test-tutor@test.local',   'tutor',   true),
    ('00000000-0000-4000-8000-00000000b003', '00000000-0000-4000-8000-00000000a003', 'Test Finance', 'test-finance@test.local', 'finance', true),
    ('00000000-0000-4000-8000-00000000b004', '00000000-0000-4000-8000-00000000a004', 'Test Inactive','test-inactive@test.local','finance', false);

insert into public.courses (id, course_code, course_name)
values ('00000000-0000-4000-8000-00000000c001', 'TEST-C1', 'Test Course');

insert into public.batches (id, course_id, cohort_label, course_fee, start_date, start_time, end_date, facilitator_name, facilitator_staff_id, is_active)
values
    ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000c001', 'TEST-ACTIVE',   1200.00, current_date + 30, '09:00', current_date + 34, 'Test Tutor', '00000000-0000-4000-8000-00000000b002', true),
    ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-00000000c001', 'TEST-INACTIVE', 1200.00, current_date + 30, '09:00', current_date + 34, 'Test Tutor', null, false);

insert into public.participants (id, full_name, email, phone, consent_given, consent_at)
values
    ('00000000-0000-4000-8000-00000000e001', 'Test Participant One', 'p1@test.local', '+233200000001', true, now()),
    ('00000000-0000-4000-8000-00000000e002', 'Test Participant Two', 'p2@test.local', '+233200000002', true, now());

insert into public.registrations (id, participant_id, batch_id, lead_source, consent_given)
values ('00000000-0000-4000-8000-00000000f001', '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', 'WhatsApp', true);

insert into public.payments (id, registration_id, course_fee)
values ('00000000-0000-4000-8000-000000010001', '00000000-0000-4000-8000-00000000f001', 1200.00);

-- ---- T-BR04-01/02/03 — payment_status derivation ------------------------
do $$
declare v_status text; v_balance numeric;
begin
    select payment_status into v_status from public.payments where id = '00000000-0000-4000-8000-000000010001';
    if v_status <> 'Unpaid' then raise exception 'T-BR04-01 FAILED: expected Unpaid, got %', v_status; end if;

    update public.payments set amount_paid = 400 where id = '00000000-0000-4000-8000-000000010001';
    select payment_status, balance into v_status, v_balance from public.payments where id = '00000000-0000-4000-8000-000000010001';
    if v_status <> 'Part Payment' then raise exception 'T-BR04-02 FAILED: expected Part Payment, got %', v_status; end if;
    if v_balance <> 800.00 then raise exception 'T-BR05 balance FAILED: expected 800.00, got %', v_balance; end if;

    update public.payments set amount_paid = 1200 where id = '00000000-0000-4000-8000-000000010001';
    select payment_status into v_status from public.payments where id = '00000000-0000-4000-8000-000000010001';
    if v_status <> 'Paid' then raise exception 'T-BR04-03 FAILED: expected Paid, got %', v_status; end if;

    raise notice 'T-BR04-01/02/03 + balance derivation PASSED';
end $$;

-- ---- T-BR06-01 — registration auto-confirms on Paid ---------------------
do $$
declare v_status text;
begin
    select registration_status into v_status from public.registrations where id = '00000000-0000-4000-8000-00000000f001';
    if v_status <> 'Confirmed' then raise exception 'T-BR06-01 FAILED: expected Confirmed, got %', v_status; end if;
    raise notice 'T-BR06-01 PASSED';
end $$;

-- ---- T-BR06-02 — Cancelled is never overridden --------------------------
do $$
declare v_status text;
begin
    update public.registrations set registration_status = 'Cancelled' where id = '00000000-0000-4000-8000-00000000f001';
    -- Re-trigger the payment_status derivation cycle.
    update public.payments set amount_paid = 0 where id = '00000000-0000-4000-8000-000000010001';
    update public.payments set amount_paid = 1200 where id = '00000000-0000-4000-8000-000000010001';
    select registration_status into v_status from public.registrations where id = '00000000-0000-4000-8000-00000000f001';
    if v_status <> 'Cancelled' then raise exception 'T-BR06-02 FAILED: Cancelled was overridden to %', v_status; end if;
    raise notice 'T-BR06-02 PASSED (guard clause holds)';
end $$;

-- ---- T-BR05-01 — balance cannot be written ------------------------------
do $$
begin
    begin
        update public.payments set balance = 0 where id = '00000000-0000-4000-8000-000000010001';
        raise exception 'T-BR05-01 FAILED: direct balance write was accepted';
    exception when others then
        if sqlerrm like '%T-BR05-01 FAILED%' then raise; end if;
        raise notice 'T-BR05-01 PASSED (generated column rejected write: %)', sqlerrm;
    end;
end $$;

-- ---- T-BR03-01 — duplicate registration rejected ------------------------
do $$
begin
    begin
        insert into public.registrations (participant_id, batch_id, lead_source, consent_given)
        values ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000d001', 'WhatsApp', true);
        raise exception 'T-BR03-01 FAILED: duplicate registration was accepted';
    exception when unique_violation then
        raise notice 'T-BR03-01 PASSED (unique constraint enforced)';
    end;
end $$;

-- ---- BR-01 — inactive batch registration rejected -----------------------
do $$
begin
    begin
        insert into public.registrations (participant_id, batch_id, lead_source, consent_given)
        values ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d002', 'Website', true);
        raise exception 'BR-01 FAILED: registration against inactive batch accepted';
    exception when others then
        if sqlerrm like '%BR-01 FAILED%' then raise; end if;
        raise notice 'BR-01 PASSED (trigger rejected inactive batch: %)', sqlerrm;
    end;
end $$;

-- ---- T-BR07-01 — email_log dedup constraint -----------------------------
do $$
begin
    insert into public.email_log (registration_id, email_type, success)
    values ('00000000-0000-4000-8000-00000000f001', 'welcome', true);
    begin
        insert into public.email_log (registration_id, email_type, success)
        values ('00000000-0000-4000-8000-00000000f001', 'welcome', true);
        raise exception 'T-BR07-01 FAILED: duplicate email_log row accepted';
    exception when unique_violation then
        raise notice 'T-BR07-01 PASSED (dedup constraint enforced)';
    end;
end $$;

-- ---- T-BR14 — transaction_id uniqueness ---------------------------------
do $$
begin
    update public.payments set transaction_id = 'PSK-TEST-1' where id = '00000000-0000-4000-8000-000000010001';
    insert into public.registrations (id, participant_id, batch_id, lead_source, consent_given)
    values ('00000000-0000-4000-8000-00000000f002', '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000d001', 'Website', true);
    insert into public.payments (id, registration_id, course_fee)
    values ('00000000-0000-4000-8000-000000010002', '00000000-0000-4000-8000-00000000f002', 1200.00);
    begin
        update public.payments set transaction_id = 'PSK-TEST-1' where id = '00000000-0000-4000-8000-000000010002';
        raise exception 'T-BR14 FAILED: duplicate transaction_id accepted';
    exception when unique_violation then
        raise notice 'T-BR14 PASSED (transaction_id uniqueness enforced)';
    end;
end $$;

-- ---- RLS tests ----------------------------------------------------------
-- Simulate PostgREST: set role and the JWT claims RLS reads via auth.uid().

-- T-RLS-01 — tutor sees only Confirmed rows in own batches.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a002", "role": "authenticated"}';
do $$
declare v_count int; v_bad int;
begin
    select count(*) into v_count from public.registrations;
    select count(*) into v_bad
      from public.registrations r
     where r.registration_status <> 'Confirmed'
        or not exists (
            select 1 from public.batches b
             where b.id = r.batch_id
               and b.facilitator_staff_id = '00000000-0000-4000-8000-00000000b002'
        );
    if v_bad > 0 then raise exception 'T-RLS-01 FAILED: tutor sees % non-permitted rows', v_bad; end if;
    raise notice 'T-RLS-01 PASSED (tutor sees % permitted rows only)', v_count;
end $$;

-- T-RLS-02 — tutor sees zero payments.
do $$
declare v_count int;
begin
    select count(*) into v_count from public.payments;
    if v_count <> 0 then raise exception 'T-RLS-02 FAILED: tutor sees % payment rows', v_count; end if;
    raise notice 'T-RLS-02 PASSED';
end $$;
reset role;

-- T-RLS-04 — finance sees zero email templates.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a003", "role": "authenticated"}';
do $$
declare v_count int;
begin
    select count(*) into v_count from public.email_templates;
    if v_count <> 0 then raise exception 'T-RLS-04 FAILED: finance sees % template rows', v_count; end if;
    raise notice 'T-RLS-04 PASSED';
end $$;
reset role;

-- T-RLS-05 — inactive staff account sees zero rows everywhere.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a004", "role": "authenticated"}';
do $$
declare v_count int;
begin
    select (select count(*) from public.registrations)
         + (select count(*) from public.payments)
         + (select count(*) from public.participants)
         + (select count(*) from public.courses)
         + (select count(*) from public.batches)
      into v_count;
    if v_count <> 0 then raise exception 'T-RLS-05 FAILED: inactive account sees % rows', v_count; end if;
    raise notice 'T-RLS-05 PASSED';
end $$;
reset role;

-- T-RLS-07 — anon sees zero payments.
set local role anon;
do $$
declare v_count int;
begin
    select count(*) into v_count from public.payments;
    if v_count <> 0 then raise exception 'T-RLS-07 FAILED: anon sees % payment rows', v_count; end if;
    raise notice 'T-RLS-07 PASSED';
end $$;
reset role;

-- ---- DPA soft delete + hard-delete guard --------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a001", "role": "authenticated"}';
do $$
declare v_name text; v_email text;
begin
    perform public.fn_soft_delete_participant('00000000-0000-4000-8000-00000000e002');
    select full_name, email into v_name, v_email from public.participants where id = '00000000-0000-4000-8000-00000000e002';
    if v_name <> '[DELETED]' or v_email not like 'deleted-%' then
        raise exception 'BR-16 FAILED: participant not anonymised (name=%, email=%)', v_name, v_email;
    end if;
    raise notice 'BR-16 soft delete PASSED';

    -- Hard delete must be refused before 30 days have passed.
    begin
        perform public.fn_hard_delete_participant('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000b001');
        raise exception 'DPA-02 FAILED: hard delete accepted before 30 days';
    exception when others then
        if sqlerrm like '%DPA-02 FAILED%' then raise; end if;
        raise notice 'DPA-02 30-day guard PASSED (%)', sqlerrm;
    end;
end $$;
reset role;

-- T-RLS non-admin cannot soft delete.
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-8000-00000000a003", "role": "authenticated"}';
do $$
begin
    begin
        perform public.fn_soft_delete_participant('00000000-0000-4000-8000-00000000e001');
        raise exception 'DPA guard FAILED: finance was able to soft delete';
    exception when others then
        if sqlerrm like '%DPA guard FAILED%' then raise; end if;
        raise notice 'DPA admin-only guard PASSED (%)', sqlerrm;
    end;
end $$;
reset role;

-- Nothing above survives.
rollback;
