-- Existing-tutor/existing-student self-serve referral + commission-as-
-- course-credit redemption (founder-requested 2026-08-02, same-day follow-up
-- to the Knowsia Growth Partner Programme in 202608020044).
begin;

-- Links an Ambassador partner to their own participant/student record, when
-- they self-serve as an existing student via the portal's "Refer & Earn"
-- action — mirrors partners.tutor_id's existing pattern exactly. Null for
-- partners who applied via the public form and aren't also a customer.
alter table public.partners
    add column participant_id uuid references public.participants(id) on delete set null;

comment on column public.partners.participant_id is
    'Set for an Ambassador partner who self-served from their existing student portal login. They manage referrals from that portal, never partner_auth/partner_sessions — same posture as tutor_id.';

-- Commission credit redemption: a partner can spend their own 'payable'
-- commission balance to reduce a course fee (their own, or a referred
-- student's) instead of waiting for a cash payout. 'redeemed' sits
-- alongside 'paid' as a terminal state — same pipeline stage, different
-- settlement method.
alter table public.partner_commissions
    drop constraint if exists partner_commissions_status_check;
alter table public.partner_commissions
    add constraint partner_commissions_status_check
    check (status in ('pending', 'approved', 'payable', 'paid', 'clawed_back', 'redeemed'));

alter table public.partner_commissions
    add column redeemed_against_registration_id uuid references public.registrations(id) on delete set null;

comment on column public.partner_commissions.redeemed_against_registration_id is
    'Set when status=redeemed — which registration''s fee this commission was applied against (the partner''s own, or a referred student''s).';

commit;
