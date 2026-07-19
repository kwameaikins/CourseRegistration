-- Post-course feedback (founder-approved 2026-07-19).
--
-- Flow: the morning after a Batch's end_date, the daily cron sends the
-- post_training_thankyou email (BR-07 dedup via email_log) containing
-- {{feedback_link}} — a public per-Registration URL (/feedback/<uuid>; the
-- unguessable Registration UUID is the access token). Submission writes one
-- feedback row per Registration; unique(registration_id) makes double
-- submission impossible. Admin/Management review aggregates per Batch.

begin;

create table public.feedback (
    id                    uuid primary key default gen_random_uuid(),
    registration_id       uuid not null references public.registrations(id) on delete cascade,
    overall_rating        integer not null check (overall_rating between 1 and 5),
    facilitator_rating    integer not null check (facilitator_rating between 1 and 5),
    recommend_rating      integer not null check (recommend_rating between 1 and 5),
    improvement_text      text,
    testimonial_consent   boolean not null default false,
    comments_anonymous    boolean not null default false,
    interested_courses    text,
    submitted_at          timestamptz not null default now(),
    unique (registration_id)
);

comment on table public.feedback is
    'One post-course feedback submission per Registration. Writes happen only via the service-role client from the public token URL; unique(registration_id) prevents double submission.';

create index idx_feedback_registration on public.feedback(registration_id);

alter table public.feedback enable row level security;

-- Admin and Management review feedback; Tutors deliberately have no read
-- access so anonymous comments stay anonymous to facilitators.
create policy staff_read_feedback
on public.feedback for select
to authenticated
using (public.fn_current_role() in ('admin', 'management'));

grant select, insert, update, delete on table public.feedback to authenticated;

commit;
