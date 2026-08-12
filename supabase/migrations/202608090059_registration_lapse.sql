begin;

-- Lapsed registrations: closing out the people who never paid and never came
-- (founder direction 2026-08-09).
--
-- The problem this fixes. `registration_status` has always had 'Cancelled' and
-- 'Attended' in its CHECK constraint, and BR-06 describes "a Registration
-- manually set to Cancelled by an Admin" — but nothing in the codebase has
-- ever written either value. The only status transition that exists is
-- Registered -> Confirmed, fired by the payment trigger. So a registrant who
-- never paid and never showed up stays 'Registered' with an open balance
-- forever, and:
--
--   * the dashboard's Total Outstanding counts them as collectible, because
--     it aggregates every registration on an active batch with no status
--     filter at all (modules/dashboard/repository.ts);
--   * they sit in the Payments screen's "outstanding" queue alongside real
--     debtors, indefinitely;
--   * their student portal shows a live Pay Now button for a course that
--     finished months ago;
--   * they keep occupying a seat in the capacity count.
--
-- The only tool for clearing one was a hard DELETE, which destroys the
-- Registration and its Payment row — losing the very fact you want to keep
-- (that this person registered and then went quiet).
--
-- Why a new status rather than reusing 'Cancelled'. 'Cancelled' would then
-- mean three unrelated things: the participant asked to cancel, an admin
-- cancelled a mis-entry, and we gave up collecting. The third group is a
-- re-marketing audience and a lead-quality signal; the first is the opposite.
-- Merged, they can never be told apart again except by string-matching free
-- text. Founder chose the separate value 2026-08-09.
--
-- Note that no existing `.eq('registration_status', 'Confirmed')` read needs
-- to change for this — tutor rosters, live-session portal access and
-- communications targeting all stay correct, because a lapsed row simply is
-- not 'Confirmed'. The reads that DO need teaching are the ones phrased as a
-- negative: seat counting uses `.neq(..., 'Cancelled')` and is updated in the
-- same commit as this migration.

alter table public.registrations
    drop constraint registrations_registration_status_check;

alter table public.registrations
    add constraint registrations_registration_status_check
    check (
        registration_status in (
            'Registered', 'Confirmed', 'Attended', 'Cancelled', 'Lapsed'
        )
    );

-- The status gates behaviour; these three columns carry the audit and the
-- reporting. A status alone cannot answer "how many lapsed in July" —
-- updated_at is clobbered by any later edit — and cannot distinguish the
-- nightly sweep's ruling from an admin's deliberate write-off.
alter table public.registrations
    add column lapsed_at     timestamptz,
    add column lapsed_by     uuid references public.staff_users(id) on delete set null,
    add column lapsed_reason text;

comment on column public.registrations.lapsed_at is
    'When this Registration was written off as uncollectible. Also the sweep''s idempotency key: it only ever considers rows where this is null.';

comment on column public.registrations.lapsed_by is
    'The staff member who wrote it off, or NULL when the 15-day automatic sweep did — the two are different decisions with different accountability.';

comment on column public.registrations.lapsed_reason is
    'Free text from a manual write-off, or the sweep''s own fixed sentence. Never the sole record of the event — lapsed_at is.';

-- A Lapsed row must always carry its audit, and a non-Lapsed row must never
-- carry a stale one (which is what a reinstatement has to clear). Enforced in
-- the database rather than trusted to the service layer, because two separate
-- paths write this — the manual action and the nightly sweep.
alter table public.registrations
    add constraint registrations_lapsed_audit_check
    check (
        (registration_status = 'Lapsed' and lapsed_at is not null)
        or (registration_status <> 'Lapsed' and lapsed_at is null)
    );

-- The sweep scans for candidates every night; this keeps it off a full scan
-- as the table grows. Partial, because the rows it never wants are the
-- overwhelming majority.
create index idx_registrations_not_lapsed
    on public.registrations(batch_id)
    where lapsed_at is null;

commit;
