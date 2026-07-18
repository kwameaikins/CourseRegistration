-- Centralised Course Registration & Follow-Up System
-- Week 1 foundation: schema, business-rule triggers, RLS, and PostgREST grants.

begin;

create extension if not exists "pgcrypto";

-- Internal staff accounts extend Supabase Auth identities.
create table public.staff_users (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null unique references auth.users(id) on delete cascade,
    full_name       text not null,
    email           text not null unique,
    role            text not null check (
                        role in ('admin', 'finance', 'marketing', 'tutor', 'management')
                    ),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.staff_users is
    'Internal staff accounts. One row per Supabase Auth user. Role drives RLS policy evaluation.';

create table public.courses (
    id              uuid primary key default gen_random_uuid(),
    course_code     text not null unique,
    course_name     text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.courses is
    'A training programme identified by a unique human-readable Course Code.';

create table public.batches (
    id                          uuid primary key default gen_random_uuid(),
    course_id                   uuid not null references public.courses(id) on delete restrict,
    cohort_label                text not null,
    course_fee                  numeric(10,2) not null check (course_fee >= 0),
    start_date                  date not null,
    start_time                  time not null,
    end_date                    date not null,
    zoom_link                   text,
    whatsapp_group_link         text,
    facilitator_name            text not null,
    facilitator_staff_id        uuid references public.staff_users(id) on delete set null,
    welcome_email_enabled       boolean not null default true,
    payment_reminder_enabled    boolean not null default true,
    class_reminder_enabled      boolean not null default true,
    is_active                   boolean not null default true,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    unique (course_id, cohort_label)
);

comment on table public.batches is
    'One scheduled intake of a Course. A Course with existing Batches cannot be deleted.';
comment on column public.batches.facilitator_staff_id is
    'Optional Tutor account link used for RLS filtering; facilitator_name remains required.';

create table public.participants (
    id              uuid primary key default gen_random_uuid(),
    full_name       text not null,
    email           text not null unique,
    phone           text not null,
    consent_given   boolean not null default false,
    consent_at      timestamptz,
    deleted_at      timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table public.participants is
    'A person registered for a course. deleted_at and anonymised contact fields implement Ghana DPA erasure.';

create table public.registrations (
    id                      uuid primary key default gen_random_uuid(),
    participant_id          uuid not null references public.participants(id) on delete restrict,
    batch_id                uuid not null references public.batches(id) on delete restrict,
    registration_status     text not null default 'Registered'
                              check (
                                  registration_status in (
                                      'Registered', 'Confirmed', 'Attended', 'Cancelled'
                                  )
                              ),
    lead_source             text not null check (
                                lead_source in (
                                    'WhatsApp', 'Facebook', 'LinkedIn',
                                    'Referral', 'Website', 'Other'
                                )
                            ),
    consent_given           boolean not null,
    notes                   text,
    registered_at           timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (participant_id, batch_id)
);

comment on table public.registrations is
    'One Participant registration per Batch. The unique pair enforces BR-03.';

create table public.payments (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null unique references public.registrations(id) on delete restrict,
    course_fee          numeric(10,2) not null,
    amount_paid         numeric(10,2) not null default 0 check (amount_paid >= 0),
    balance             numeric(10,2) generated always as (course_fee - amount_paid) stored,
    payment_status      text not null default 'Unpaid'
                          check (payment_status in ('Unpaid', 'Part Payment', 'Paid')),
    payment_method      text check (
                            payment_method in (
                                'Paystack Card', 'MTN MoMo', 'Bank Transfer', 'Cash', 'Other'
                            )
                        ),
    transaction_id      text unique,
    payment_date        timestamptz,
    verified_by         uuid references public.staff_users(id) on delete set null,
    payment_notes       text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table public.payments is
    'Payment Status and Balance are derived. transaction_id uniqueness enforces BR-14 idempotency.';

create table public.email_templates (
    id              uuid primary key default gen_random_uuid(),
    course_id       uuid not null references public.courses(id) on delete cascade,
    email_type      text not null check (
                        email_type in (
                            'welcome', 'payment_instruction', 'reminder_1', 'reminder_2',
                            'reminder_3', 'reminder_4', 'payment_confirmation',
                            'class_reminder_24h', 'class_reminder_2h', 'zoom_link',
                            'whatsapp_invite', 'post_training_thankyou', 'upsell'
                        )
                    ),
    subject         text not null,
    body            text not null,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (course_id, email_type)
);

comment on table public.email_templates is
    'One email template per Course and Email Type.';

create table public.email_log (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null references public.registrations(id) on delete cascade,
    email_type          text not null,
    sent_at             timestamptz not null default now(),
    success             boolean not null,
    error_message       text,
    unique (registration_id, email_type)
);

comment on table public.email_log is
    'Immutable email audit trail. The unique pair enforces BR-07 deduplication.';

create table public.deletion_log (
    id                  uuid primary key default gen_random_uuid(),
    participant_id      uuid not null,
    deleted_by_staff_id uuid not null references public.staff_users(id),
    deleted_at          timestamptz not null default now()
);

comment on table public.deletion_log is
    'Audit trail for participant hard-deletion attempts and completions.';

create index idx_batches_course_id
    on public.batches(course_id);
create index idx_batches_active_start
    on public.batches(is_active, start_date);
create index idx_registrations_batch_id
    on public.registrations(batch_id);
create index idx_registrations_participant_id
    on public.registrations(participant_id);
create index idx_registrations_status
    on public.registrations(registration_status);
create index idx_payments_status
    on public.payments(payment_status);
create index idx_payments_transaction_id
    on public.payments(transaction_id);
create index idx_email_log_registration
    on public.email_log(registration_id, email_type);
create index idx_participants_email
    on public.participants(email)
    where deleted_at is null;

-- BR-01: direct database writes cannot register against an inactive Batch.
create or replace function public.fn_prevent_inactive_batch_registration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
    batch_is_active boolean;
begin
    select is_active
      into batch_is_active
      from public.batches
     where id = new.batch_id;

    if batch_is_active is not true then
        raise exception 'Cannot register for an inactive or unknown batch';
    end if;

    return new;
end;
$$;

create trigger trg_prevent_inactive_batch_registration
before insert on public.registrations
for each row execute function public.fn_prevent_inactive_batch_registration();

-- BR-04: application code writes Amount Paid, never Payment Status.
create or replace function public.fn_derive_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.amount_paid <= 0 then
        new.payment_status := 'Unpaid';
    elsif new.amount_paid < new.course_fee then
        new.payment_status := 'Part Payment';
    else
        new.payment_status := 'Paid';
    end if;

    new.updated_at := now();
    return new;
end;
$$;

create trigger trg_derive_payment_status
before insert or update of amount_paid, course_fee on public.payments
for each row execute function public.fn_derive_payment_status();

-- BR-06: Payment Status only advances a Registered Registration to Confirmed.
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
after update of payment_status on public.payments
for each row execute function public.fn_sync_registration_status();

alter table public.courses enable row level security;
alter table public.batches enable row level security;
alter table public.participants enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_log enable row level security;
alter table public.staff_users enable row level security;
alter table public.deletion_log enable row level security;

create or replace function public.fn_current_role()
returns text
language sql
security definer
stable
set search_path = ''
as $$
    select role
      from public.staff_users
     where user_id = auth.uid()
       and is_active = true;
$$;

create or replace function public.fn_current_staff_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
    select id
      from public.staff_users
     where user_id = auth.uid()
       and is_active = true;
$$;

create policy admin_full_courses
on public.courses for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy read_courses
on public.courses for select
to authenticated
using (public.fn_current_role() in ('finance', 'marketing', 'tutor', 'management'));

create policy admin_full_batches
on public.batches for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy read_batches_non_tutor
on public.batches for select
to authenticated
using (public.fn_current_role() in ('finance', 'marketing', 'management'));

create policy tutor_read_own_batches
on public.batches for select
to authenticated
using (
    public.fn_current_role() = 'tutor'
    and facilitator_staff_id = public.fn_current_staff_id()
);

create policy admin_full_participants
on public.participants for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy finance_marketing_read_participants
on public.participants for select
to authenticated
using (
    public.fn_current_role() in ('finance', 'marketing')
    and deleted_at is null
);

create policy tutor_read_confirmed_participants
on public.participants for select
to authenticated
using (
    public.fn_current_role() = 'tutor'
    and deleted_at is null
    and exists (
        select 1
          from public.registrations
          join public.batches
            on batches.id = registrations.batch_id
         where registrations.participant_id = participants.id
           and registrations.registration_status = 'Confirmed'
           and batches.facilitator_staff_id = public.fn_current_staff_id()
    )
);

create policy admin_full_registrations
on public.registrations for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy finance_read_registrations
on public.registrations for select
to authenticated
using (public.fn_current_role() = 'finance');

create policy marketing_read_registrations
on public.registrations for select
to authenticated
using (public.fn_current_role() = 'marketing');

create policy tutor_read_confirmed_own_batch
on public.registrations for select
to authenticated
using (
    public.fn_current_role() = 'tutor'
    and registration_status = 'Confirmed'
    and exists (
        select 1
          from public.batches
         where batches.id = registrations.batch_id
           and batches.facilitator_staff_id = public.fn_current_staff_id()
    )
);

create policy admin_full_payments
on public.payments for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy finance_full_payments
on public.payments for all
to authenticated
using (public.fn_current_role() = 'finance')
with check (public.fn_current_role() = 'finance');

create policy marketing_read_payment_status
on public.payments for select
to authenticated
using (public.fn_current_role() = 'marketing');

create policy admin_full_templates
on public.email_templates for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy admin_read_email_log
on public.email_log for select
to authenticated
using (public.fn_current_role() = 'admin');

create policy admin_full_staff_users
on public.staff_users for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy self_read_staff_users
on public.staff_users for select
to authenticated
using (user_id = auth.uid());

create policy admin_read_deletion_log
on public.deletion_log for select
to authenticated
using (public.fn_current_role() = 'admin');

-- The public registration flow is anonymous; all validation is repeated by
-- the server-side API before these inserts are attempted.
create policy public_insert_registration
on public.registrations for insert
to anon
with check (consent_given = true);

create policy public_insert_participant
on public.participants for insert
to anon
with check (consent_given = true and deleted_at is null);

-- The public registration API creates the initial Payment row in the same
-- orchestration (Document 5, Section 2). Anonymous inserts are locked to the
-- initial state only: nothing paid, no method, no verification metadata.
create policy public_insert_payment
on public.payments for insert
to anon
with check (
    amount_paid = 0
    and payment_method is null
    and transaction_id is null
    and verified_by is null
);

create or replace function public.fn_soft_delete_participant(
    participant_id_to_delete uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if public.fn_current_role() <> 'admin' then
        raise exception 'Only an active Admin may delete a Participant';
    end if;

    update public.participants
       set full_name = '[DELETED]',
           email = concat('deleted-', id, '@deleted.local'),
           phone = '[DELETED]',
           deleted_at = now(),
           updated_at = now()
     where id = participant_id_to_delete;

    if not found then
        raise exception 'Participant not found';
    end if;
end;
$$;

create or replace function public.fn_hard_delete_participant(
    participant_id_to_delete uuid,
    deleting_staff_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if public.fn_current_role() <> 'admin'
       or public.fn_current_staff_id() is distinct from deleting_staff_id then
        raise exception 'Only the current active Admin may hard-delete a Participant';
    end if;

    if not exists (
        select 1
          from public.participants
         where id = participant_id_to_delete
           and deleted_at is not null
           and deleted_at <= now() - interval '30 days'
    ) then
        raise exception
            'Participant not eligible for hard delete: soft delete must be at least 30 days old';
    end if;

    insert into public.deletion_log (participant_id, deleted_by_staff_id)
    values (participant_id_to_delete, deleting_staff_id);

    delete from public.participants
     where id = participant_id_to_delete;
end;
$$;

revoke all on function public.fn_soft_delete_participant(uuid) from public;
revoke all on function public.fn_hard_delete_participant(uuid, uuid) from public;
grant execute on function public.fn_soft_delete_participant(uuid) to authenticated;
grant execute on function public.fn_hard_delete_participant(uuid, uuid) to authenticated;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert on table
    public.registrations,
    public.participants,
    public.payments
to anon;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

commit;
