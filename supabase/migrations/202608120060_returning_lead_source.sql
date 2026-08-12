begin;

-- 'Returning' lead source: re-enrolment by a Participant who already has an
-- account (founder direction 2026-08-12).
--
-- The problem this fixes. Every Registration must carry a `lead_source`, and
-- until now the only values available described how a STRANGER first found
-- Knowsia: WhatsApp, Facebook, LinkedIn, Referral, Website, Other. That set has
-- no answer at all for the case the student portal's new one-click enrolment
-- creates — somebody who is already a Participant, already has a portal login,
-- and is simply taking a second course. Every available answer is a lie:
--
--   * carrying forward their original source ('Facebook', say) credits that
--     channel again on every future course they ever take. `lead_source` feeds
--     the dashboard, the leads screen filters and campaign audience building,
--     so this quietly and permanently overstates whichever channel happened to
--     find them first;
--   * 'Other' is already the genuine-unknown bucket. Putting known returning
--     students in it destroys the ability to count repeat enrolments — which,
--     for a training business, is close to the most valuable number there is.
--
-- Why a new value rather than reusing one. Exactly the reasoning that produced
-- 'Lapsed' rather than a second meaning for 'Cancelled' three days ago
-- (202608090059): once two distinct facts are merged into one value they can
-- never be separated again except by string-matching free text. "This person
-- came back" and "we don't know how this person found us" are different facts.
--
-- 'Returning' is SYSTEM-ASSIGNED, never self-declared. It is set only by the
-- portal enrolment path, where the participant's identity is already proven by
-- a portal session. The public registration form does not offer it and
-- app/api/registrations rejects it, because an anonymous visitor claiming to be
-- a returning student would corrupt the very number this value exists to make
-- countable. See SELF_DECLARED_LEAD_SOURCES in lib/domain/types.ts.
--
-- Both tables that constrain lead_source move together. waitlist_entries is not
-- optional here: a returning student enrolling onto a FULL batch takes
-- createRegistration's waitlist branch, which forwards the same lead_source —
-- so leaving that constraint alone would turn "enrol me" into a constraint
-- violation for precisely the batches most in demand.
--
-- leads.lead_source is deliberately untouched: it is `text not null default
-- 'Website'` with no CHECK (202607240018 / 202607260031 constrained `status`
-- only), so the value flows through createRegistration's lead creation without
-- a schema change. The application-side enum in lib/domain/types.ts is what
-- keeps that column honest, and it gains 'Returning' in the same commit.

alter table public.registrations
    drop constraint if exists registrations_lead_source_check;

alter table public.registrations
    add constraint registrations_lead_source_check
    check (
        lead_source in (
            'WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other',
            'Returning'
        )
    );

alter table public.waitlist_entries
    drop constraint if exists waitlist_entries_lead_source_check;

alter table public.waitlist_entries
    add constraint waitlist_entries_lead_source_check
    check (
        lead_source in (
            'WhatsApp', 'Facebook', 'LinkedIn', 'Referral', 'Website', 'Other',
            'Returning'
        )
    );

comment on column public.registrations.lead_source is
    'The marketing channel that brought this Participant to register. ''Returning'' is system-assigned by the student portal''s enrolment path for a Participant who already has an account, and is never self-declared on the public form.';

commit;
