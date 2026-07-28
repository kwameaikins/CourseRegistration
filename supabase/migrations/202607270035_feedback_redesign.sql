-- Feedback questionnaire redesign (founder-approved 2026-07-27) — richer
-- question set (relevance, confidence, materials clarity, most-valuable-
-- learning, categorical recommendation, testimonial choice), and the old
-- checkbox "interested courses" list replaced by a single free-text "which
-- other course would you like us to offer" question. Additive-then-convert-
-- then-drop so the handful of feedback rows already submitted are preserved,
-- not discarded.

begin;

alter table public.feedback
    add column relevance_rating   integer check (relevance_rating between 1 and 5),
    add column confidence_rating  integer check (confidence_rating between 1 and 5),
    add column materials_clarity  text check (materials_clarity in ('Yes', 'Partly', 'No')),
    add column most_valuable_text text,
    add column recommendation     text check (recommendation in ('Yes', 'Maybe', 'No')),
    add column other_course_suggestion text,
    add column testimonial_choice text not null default 'No'
        check (testimonial_choice in ('Named', 'Anonymous', 'No'));

-- Backfill existing rows (a handful, per the founder) before the new columns
-- become required — no better source exists for relevance/confidence than
-- the overall rating, and materials_clarity defaults to the most common
-- answer rather than guessing.
update public.feedback
set testimonial_choice = case
    when testimonial_consent and not comments_anonymous then 'Named'
    when testimonial_consent and comments_anonymous then 'Anonymous'
    else 'No'
end;

update public.feedback
set recommendation = case
    when recommend_rating >= 4 then 'Yes'
    when recommend_rating = 3 then 'Maybe'
    else 'No'
end
where recommendation is null;

update public.feedback set relevance_rating = overall_rating where relevance_rating is null;
update public.feedback set confidence_rating = overall_rating where confidence_rating is null;
update public.feedback set materials_clarity = 'Yes' where materials_clarity is null;

alter table public.feedback
    alter column relevance_rating set not null,
    alter column confidence_rating set not null,
    alter column materials_clarity set not null,
    alter column recommendation set not null;

-- Superseded by the columns above; dropping also drops their own inline
-- CHECK constraints automatically (they were declared unnamed/inline, same
-- as the columns themselves — no separate constraint-drop step needed).
alter table public.feedback
    drop column recommend_rating,
    drop column testimonial_consent,
    drop column comments_anonymous,
    drop column interested_courses;

commit;
