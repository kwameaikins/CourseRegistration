# Centralised Course Registration & Follow-Up System
## Data Schema and ERD

---

| Field | Value |
|---|---|
| **Document** | Data Schema and ERD |
| **Version** | 1.0 |
| **Date** | June 2026 |
| **Status** | Approved for Development |
| **Audience** | AI Coding Agent |
| **Input from** | Document 1 (PRD), Document 2 (Technical Architecture) |

---

## Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | June 2026 | Initial schema — 8 tables, all RLS policies, aggregates identified |

---

## Table of Contents

1. [Schema Design Principles](#1-schema-design-principles)
2. [System of Record vs Derived Data](#2-system-of-record-vs-derived-data)
3. [Aggregates and Consistency Boundaries](#3-aggregates-and-consistency-boundaries)
4. [Full Table Definitions](#4-full-table-definitions)
5. [Indexes](#5-indexes)
6. [Row Level Security Policies](#6-row-level-security-policies)
7. [Supabase May 2026 API Grant Requirement](#7-supabase-may-2026-api-grant-requirement)
8. [Soft Delete Implementation](#8-soft-delete-implementation)
9. [Seed Data Requirements](#9-seed-data-requirements)
10. [Ready for Development Checklist](#10-ready-for-development-checklist)

---

## 1. Schema Design Principles

- **UUID v4 primary keys on every table** (PAT-006). Prevents enumeration attacks; no
  sequential integer ID is ever exposed in a URL or API response.
- **Relational model throughout** (P4.11). No JSON blob fields for structured data that
  needs querying, filtering, or aggregation.
- **Soft delete pattern** (PAT-007) on `participants` only — the one table with a genuine
  right-to-erasure requirement. Other tables use hard delete where appropriate (e.g. deleting
  a draft Batch that has never had a Registration).
- **Every foreign key has an explicit `ON DELETE` behaviour** stated — never left to database
  default, per P4.02 (design against human error).
- **Designed against the full roadmap** (Phase 1–3), built only for Phase 1 tables where
  Phase 2/3 fields do not yet exist (URISK-T04 — data model lock-in). Fields that Phase 2
  will need (e.g. `assigned_staff_id` on a future follow-up table) are NOT pre-built into
  Phase 1 tables — they belong to a Phase 2 `follow_ups` table, added when Phase 2 begins.
  This keeps Phase 1 lean without creating a schema that cannot represent Phase 2.

---

## 2. System of Record vs Derived Data

Per P4.23 — every store must be labelled system-of-record or derived, with a rebuild
procedure for derived stores.

| Table | Classification | Rebuild procedure (if derived) |
|---|---|---|
| `courses` | System of record | N/A |
| `batches` | System of record | N/A |
| `participants` | System of record | N/A |
| `registrations` | System of record | N/A |
| `payments` | System of record | N/A |
| `email_log` | System of record (audit trail) | N/A — never rebuilt, only appended |
| `email_templates` | System of record | N/A |
| `staff_users` | System of record | N/A |
| Dashboard aggregates (F1.08) | **Derived** | Recomputed live via SQL aggregation query on every dashboard page load. Not materialised or cached in Phase 1 — volume (1,440 rows/year) does not require it. |

No table in this system is a cache or materialised view in Phase 1. All dashboard figures
are computed live from the system-of-record tables at request time.

---

## 3. Aggregates and Consistency Boundaries

Per P17.03 — an aggregate is a cluster of objects treated as a unit for data changes, with
one root entity through which all changes flow. Transactions should not span aggregates.

| Aggregate root | Members | Rule |
|---|---|---|
| **Registration** | `registrations` (root), `payments` (1:1 child) | A Registration and its Payment are always created together in a single transaction. Payment Status changes always go through the Payment record, never by directly editing Registration Status — Registration Status is derived from Payment Status by trigger (BR-06). |
| **Course** | `courses` (root), `batches` (1:many child), `email_templates` (1:many child) | A Batch cannot exist without a Course. An Email Template cannot exist without a Course. Deleting a Course's is blocked if any Batch has Registrations (see cascade rules, Section 4). |
| **Participant** | `participants` (root) — standalone aggregate | A Participant exists independently of any single Registration. One Participant can have multiple Registrations across different Batches (repeat customers). |

**Why this resolves the transaction boundary question (P17.03):** The Paystack webhook
handler needs to update Payment and (via trigger) Registration Status in one atomic operation.
Because Registration + Payment form one aggregate, this is a single-aggregate transaction —
no distributed transaction or two-phase commit is ever required (P7.06 avoided entirely by
correct aggregate design).

---

## 4. Full Table Definitions

```sql
-- =========================================================
-- EXTENSION: UUID generation
-- =========================================================
create extension if not exists "pgcrypto";

-- =========================================================
-- TABLE: staff_users
-- System of record. Extends Supabase auth.users via user_id.
-- =========================================================
create table staff_users (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null unique references auth.users(id) on delete cascade,
    full_name       text not null,
    email           text not null unique,
    role            text not null check (role in ('admin','finance','marketing','tutor','management')),
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table staff_users is 'Internal staff accounts. One row per Supabase Auth user. Role drives RLS policy evaluation across all other tables.';

-- =========================================================
-- TABLE: courses
-- System of record. Aggregate root for batches and email_templates.
-- =========================================================
create table courses (
    id              uuid primary key default gen_random_uuid(),
    course_code     text not null unique,
    course_name     text not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

comment on table courses is 'A training programme. Course Code is the human-readable unique identifier used in email templates and staff communication.';

-- =========================================================
-- TABLE: batches
-- System of record. Child of courses. Aggregate member with courses.
-- =========================================================
create table batches (
    id                          uuid primary key default gen_random_uuid(),
    course_id                   uuid not null references courses(id) on delete restrict,
    cohort_label                text not null,
    course_fee                  numeric(10,2) not null check (course_fee >= 0),
    start_date                  date not null,
    start_time                  time not null,
    end_date                    date not null,
    zoom_link                   text,
    whatsapp_group_link         text,
    facilitator_name            text not null,
    facilitator_staff_id        uuid references staff_users(id) on delete set null,
    welcome_email_enabled       boolean not null default true,
    payment_reminder_enabled    boolean not null default true,
    class_reminder_enabled      boolean not null default true,
    is_active                   boolean not null default true,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now(),
    unique (course_id, cohort_label)
);

comment on table batches is 'One scheduled intake of a Course. course_id ON DELETE RESTRICT: a Course with existing Batches cannot be deleted, preventing orphaned historical data.';
comment on column batches.facilitator_staff_id is 'Links a Batch to the Tutor staff_users record for RLS filtering (BR-11). Nullable because facilitator_name (free text) is required but the staff account link is optional for external/guest facilitators.';

-- =========================================================
-- TABLE: participants
-- System of record. Standalone aggregate. Soft-deletable (PAT-007).
-- =========================================================
create table participants (
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

comment on table participants is 'A person who has registered for at least one course. Matched by unique email (BR-02). deleted_at implements soft delete for Ghana DPA erasure requests (DPA-02, PAT-007); on soft delete, full_name/email/phone are overwritten with [DELETED] rather than the row being removed, to preserve payments FK integrity.';

-- =========================================================
-- TABLE: registrations
-- System of record. Aggregate root, 1:1 with payments.
-- =========================================================
create table registrations (
    id                      uuid primary key default gen_random_uuid(),
    participant_id          uuid not null references participants(id) on delete restrict,
    batch_id                uuid not null references batches(id) on delete restrict,
    registration_status     text not null default 'Registered'
                              check (registration_status in ('Registered','Confirmed','Attended','Cancelled')),
    lead_source             text not null check (lead_source in ('WhatsApp','Facebook','LinkedIn','Referral','Website','Other')),
    consent_given            boolean not null,
    notes                   text,
    registered_at           timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (participant_id, batch_id)
);

comment on table registrations is 'One Participant''s registration for one Batch. unique(participant_id, batch_id) enforces BR-03 (no duplicate registration for same batch) at the database level, not just application logic.';

-- =========================================================
-- TABLE: payments
-- System of record. 1:1 child of registrations (same aggregate).
-- =========================================================
create table payments (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null unique references registrations(id) on delete restrict,
    course_fee          numeric(10,2) not null,
    amount_paid         numeric(10,2) not null default 0 check (amount_paid >= 0),
    balance             numeric(10,2) generated always as (course_fee - amount_paid) stored,
    payment_status      text not null default 'Unpaid'
                          check (payment_status in ('Unpaid','Part Payment','Paid')),
    payment_method      text check (payment_method in ('Paystack Card','MTN MoMo','Bank Transfer','Cash','Other')),
    transaction_id      text unique,
    payment_date        timestamptz,
    verified_by         uuid references staff_users(id) on delete set null,
    payment_notes       text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table payments is 'BR-05: balance is a generated column, never manually set. BR-04: payment_status is set by the application layer trigger below, derived from amount_paid vs course_fee. transaction_id is globally unique to support Paystack webhook idempotency (BR-14).';

-- =========================================================
-- TABLE: email_templates
-- System of record. Child of courses.
-- =========================================================
create table email_templates (
    id              uuid primary key default gen_random_uuid(),
    course_id       uuid not null references courses(id) on delete cascade,
    email_type      text not null check (email_type in (
                        'welcome','payment_instruction','reminder_1','reminder_2',
                        'reminder_3','reminder_4','payment_confirmation',
                        'class_reminder_24h','class_reminder_2h','zoom_link',
                        'whatsapp_invite','post_training_thankyou','upsell'
                    )),
    subject         text not null,
    body            text not null,
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (course_id, email_type)
);

comment on table email_templates is 'One template per Course per Email Type (Section 12.3, PRD). course_id ON DELETE CASCADE: deleting a Course removes its templates, since templates have no independent meaning without the Course.';

-- =========================================================
-- TABLE: email_log
-- System of record (immutable audit trail). Never updated, only inserted.
-- =========================================================
create table email_log (
    id                  uuid primary key default gen_random_uuid(),
    registration_id     uuid not null references registrations(id) on delete cascade,
    email_type          text not null,
    sent_at             timestamptz not null default now(),
    success             boolean not null,
    error_message       text,
    unique (registration_id, email_type)
);

comment on table email_log is 'BR-07 deduplication is enforced by the unique(registration_id, email_type) constraint — a second insert attempt for the same pair fails at the database level, guaranteeing idempotency even under concurrent cron execution.';

-- =========================================================
-- TRIGGER: derive payment_status from amount_paid (BR-04)
-- =========================================================
create or replace function fn_derive_payment_status()
returns trigger as $$
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
$$ language plpgsql;

create trigger trg_derive_payment_status
before insert or update of amount_paid, course_fee on payments
for each row execute function fn_derive_payment_status();

-- =========================================================
-- TRIGGER: cascade payment_status -> registration_status (BR-06)
-- =========================================================
create or replace function fn_sync_registration_status()
returns trigger as $$
begin
    if new.payment_status = 'Paid' and old.payment_status is distinct from 'Paid' then
        update registrations
        set registration_status = 'Confirmed', updated_at = now()
        where id = new.registration_id
          and registration_status = 'Registered';
    end if;
    return new;
end;
$$ language plpgsql;

create trigger trg_sync_registration_status
after update of payment_status on payments
for each row execute function fn_sync_registration_status();
```

---

## 5. Indexes

```sql
create index idx_batches_course_id           on batches(course_id);
create index idx_batches_active_start         on batches(is_active, start_date);
create index idx_registrations_batch_id       on registrations(batch_id);
create index idx_registrations_participant_id on registrations(participant_id);
create index idx_registrations_status         on registrations(registration_status);
create index idx_payments_status              on payments(payment_status);
create index idx_payments_transaction_id      on payments(transaction_id);
create index idx_email_log_registration       on email_log(registration_id, email_type);
create index idx_participants_email           on participants(email) where deleted_at is null;
```

**Rationale:** Every index supports a filter used in Section 4 (F1.03, F1.04 filters) or a
lookup used in a business rule (BR-14 transaction ID lookup, BR-07 email log lookup). No
speculative indexes are added — P4.19 (partition/index by actual access pattern, not
hypothetical ones).

---

## 6. Row Level Security Policies

RLS is enabled on every table. Policies map directly to PRD Section F1.09's access matrix.

```sql
alter table courses enable row level security;
alter table batches enable row level security;
alter table participants enable row level security;
alter table registrations enable row level security;
alter table payments enable row level security;
alter table email_templates enable row level security;
alter table email_log enable row level security;
alter table staff_users enable row level security;

-- Helper function: get the role of the currently authenticated user
create or replace function fn_current_role()
returns text as $$
    select role from staff_users where user_id = auth.uid() and is_active = true;
$$ language sql security definer stable;

-- Helper function: get the staff_users.id of the currently authenticated user
create or replace function fn_current_staff_id()
returns uuid as $$
    select id from staff_users where user_id = auth.uid() and is_active = true;
$$ language sql security definer stable;

-- ---------- courses ----------
create policy "admin_full_courses" on courses for all
    using (fn_current_role() = 'admin');
create policy "read_courses" on courses for select
    using (fn_current_role() in ('finance','marketing','tutor','management'));

-- ---------- batches ----------
create policy "admin_full_batches" on batches for all
    using (fn_current_role() = 'admin');
create policy "read_batches_non_tutor" on batches for select
    using (fn_current_role() in ('finance','marketing','management'));
create policy "tutor_read_own_batches" on batches for select
    using (fn_current_role() = 'tutor' and facilitator_staff_id = fn_current_staff_id());

-- ---------- participants ----------
create policy "admin_full_participants" on participants for all
    using (fn_current_role() = 'admin');
create policy "finance_marketing_read_participants" on participants for select
    using (fn_current_role() in ('finance','marketing') and deleted_at is null);
-- Tutor read restricted further at the registrations join level (see below);
-- participants table itself only exposes rows tied to a Confirmed registration
-- in one of the tutor's own batches.
create policy "tutor_read_confirmed_participants" on participants for select
    using (
        fn_current_role() = 'tutor'
        and deleted_at is null
        and exists (
            select 1 from registrations r
            join batches b on b.id = r.batch_id
            where r.participant_id = participants.id
              and r.registration_status = 'Confirmed'
              and b.facilitator_staff_id = fn_current_staff_id()
        )
    );

-- ---------- registrations ----------
create policy "admin_full_registrations" on registrations for all
    using (fn_current_role() = 'admin');
create policy "finance_read_registrations" on registrations for select
    using (fn_current_role() = 'finance');
create policy "marketing_full_registrations" on registrations for select
    using (fn_current_role() = 'marketing');
create policy "tutor_read_confirmed_own_batch" on registrations for select
    using (
        fn_current_role() = 'tutor'
        and registration_status = 'Confirmed'
        and exists (
            select 1 from batches b
            where b.id = registrations.batch_id
              and b.facilitator_staff_id = fn_current_staff_id()
        )
    );

-- ---------- payments ----------
create policy "admin_full_payments" on payments for all
    using (fn_current_role() = 'admin');
create policy "finance_full_payments" on payments for all
    using (fn_current_role() = 'finance');
create policy "marketing_read_payment_status" on payments for select
    using (fn_current_role() = 'marketing');
-- Note: application layer restricts the Marketing SELECT to specific columns
-- (payment_status only) at the query level; RLS grants row access, and the
-- API layer (Document 5) is responsible for field-level restriction since
-- Postgres RLS operates at row granularity, not column granularity.

-- ---------- email_templates ----------
create policy "admin_full_templates" on email_templates for all
    using (fn_current_role() = 'admin');

-- ---------- email_log ----------
create policy "admin_read_email_log" on email_log for select
    using (fn_current_role() = 'admin');
-- Inserts to email_log are performed only by the service-role key from
-- server-side code (cron jobs, webhook handlers) — no RLS insert policy
-- is granted to any staff role. This is enforced by using the Supabase
-- service role client exclusively in modules/communications/repository.ts.

-- ---------- staff_users ----------
create policy "admin_full_staff_users" on staff_users for all
    using (fn_current_role() = 'admin');
create policy "self_read_staff_users" on staff_users for select
    using (user_id = auth.uid());
```

⚠️ **Column-level restriction flag:** Postgres RLS operates at row granularity. The PRD
requirement that Marketing sees Payment Status but not Payment Notes or Transaction ID
(F1.09) cannot be enforced by RLS alone. This is implemented at the API layer: the
`/api/registrations` GET endpoint, when called by a Marketing-role session, selects only the
permitted columns from the joined payments table. This is documented explicitly in Document 5
(API Contract) as a required field-filtering rule, not left to be inferred.

---

## 7. Supabase May 2026 API Grant Requirement

Per FOUNDRY_RESEARCH — Supabase now requires explicit PostgREST grants for auto-generated
REST API access on projects created after May 30, 2026. This project is created after that
date. The following grants are required after table creation:

```sql
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert on registrations, participants, payments to anon; -- public registration form only
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
```

⚠️ **RLS remains the actual access control.** These grants permit the API layer to reach the
tables at all; RLS policies (Section 6) determine what each authenticated role can actually
see or modify. The `anon` grant is scoped tightly — anonymous (public, unauthenticated)
access is required only for the registration form's INSERT into `participants` and
`registrations`, and even then, RLS on `registrations` should include an explicit anonymous
insert policy limited to that exact operation:

```sql
create policy "public_insert_registration" on registrations for insert
    to anon
    with check (true); -- validation happens at application layer before insert

create policy "public_insert_participant" on participants for insert
    to anon
    with check (true);
```

---

## 8. Soft Delete Implementation

Per PAT-007 and DPA-02 (PRD Section F1.10).

```sql
-- Step 1: Soft delete (Admin-triggered, immediate)
create or replace function fn_soft_delete_participant(p_participant_id uuid)
returns void as $$
begin
    update participants
    set full_name = '[DELETED]',
        email = concat('deleted-', id, '@deleted.local'),
        phone = '[DELETED]',
        deleted_at = now(),
        updated_at = now()
    where id = p_participant_id;
end;
$$ language plpgsql security definer;

-- Step 2: Hard delete (Admin-triggered, manual, ≥30 days after soft delete)
create table deletion_log (
    id                  uuid primary key default gen_random_uuid(),
    participant_id      uuid not null,
    deleted_by_staff_id uuid not null references staff_users(id),
    deleted_at          timestamptz not null default now()
);

create or replace function fn_hard_delete_participant(p_participant_id uuid, p_staff_id uuid)
returns void as $$
begin
    -- Guard: only allow hard delete 30+ days after soft delete
    if not exists (
        select 1 from participants
        where id = p_participant_id
          and deleted_at is not null
          and deleted_at <= now() - interval '30 days'
    ) then
        raise exception 'Participant not eligible for hard delete: soft delete must be at least 30 days old';
    end if;

    insert into deletion_log (participant_id, deleted_by_staff_id)
    values (p_participant_id, p_staff_id);

    delete from participants where id = p_participant_id;
    -- registrations.participant_id has ON DELETE RESTRICT — hard delete of a
    -- Participant with existing Registrations will fail intentionally. This
    -- is correct: financial audit records (via registrations -> payments)
    -- must be preserved. Full anonymisation via soft delete is the DPA-
    -- compliant end state; true row removal is not offered where financial
    -- retention obligations apply. This function is retained for the rare
    -- case of a Participant with zero Registrations (e.g. registered then
    -- immediately requested deletion before any payment activity).
end;
$$ language plpgsql security definer;
```

---

## 9. Seed Data Requirements

Before Phase 1 go-live, the following must be seeded (not synthetic test data — this is
real operational setup):

1. At least one row in `staff_users` for the founder, role = `admin`, linked to a real
   Supabase Auth user created via the Supabase dashboard.
2. At least one `courses` row and one `batches` row for the course intake driving the
   5-week deadline.
3. Email templates (`email_templates`) for all 7 Phase 1 email types for that course —
   the system sends nothing if templates are missing (Section 12.3, PRD).

---

## 10. Ready for Development Checklist

```
□ 1. All 8 core tables created exactly as specified, plus deletion_log.
□ 2. UUID v4 primary keys confirmed on every table (PAT-006).
□ 3. Aggregates identified: Registration+Payment, Course+Batch+Templates,
      standalone Participant. Transaction boundaries respect these (P17.03).
□ 4. Generated column for balance confirmed — never manually settable (BR-05).
□ 5. Trigger fn_derive_payment_status implements BR-04 at the database level.
□ 6. Trigger fn_sync_registration_status implements BR-06 at the database level.
□ 7. unique(participant_id, batch_id) on registrations enforces BR-03 at the DB level.
□ 8. unique(registration_id, email_type) on email_log enforces BR-07 at the DB level.
□ 9. unique(transaction_id) on payments supports BR-14 webhook idempotency.
□ 10. All RLS policies applied and tested per role before go-live.
□ 11. Column-level restriction for Marketing (payment_status visible,
       transaction_id/payment_notes not) is implemented at the API layer,
       not assumed to be handled by RLS.
□ 12. Supabase May 2026 PostgREST grants applied post-table-creation.
□ 13. Soft delete and hard delete functions created and tested against
       DPA-02 timing rule (30-day minimum between soft and hard delete).
□ 14. Seed data plan understood — real admin user and real course/batch
       required before go-live, not synthetic test data alone.
□ 15. Next document to read: Document 4 — Business Logic Rules Document.
```

---

*Document 4 of 12: Business Logic Rules Document follows.*
*Input to Document 4: This document + Document 1 (PRD Section 11).*
