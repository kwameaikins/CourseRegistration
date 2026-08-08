begin;

-- Default copy for the three access-grant message types added in
-- 202608080053. Seeded for every Course that exists today, because
-- sendEmailOnce returns 'skipped_no_template' when a Course has no row for
-- the type — so without this, granting access would work silently and the
-- student would never be told they are in, when their access ends, or that
-- it has ended.
--
-- `on conflict do nothing` against the unique (course_id, email_type):
-- re-running this migration, or running it after an admin has already
-- written their own copy in the messaging editor, never overwrites their
-- wording.
--
-- NOTE: this seeds EXISTING courses only. Nothing in this codebase seeds
-- templates when a Course is created (no other email type does either), so a
-- Course added after this migration needs its three templates authored in
-- the messaging editor like every other type. Flagged rather than solved
-- here: an auto-seed-on-create trigger would be a broader change to how
-- templates work, and is the founder's call.
--
-- Placeholders come from placeholderData in modules/communications/
-- email-engine.ts. {{access_expires_on}} is passed per-send by
-- modules/access-grants/service.ts; {{portal_link}} was added alongside this
-- migration. Bodies are rendered as HTML.
--
-- Dollar-quoting ($tpl$) throughout: the bodies contain both apostrophes and
-- {{...}} braces, and escaping them into ordinary SQL string literals is how
-- template copy gets silently mangled.

insert into public.email_templates (course_id, email_type, subject, body)
select
    c.id,
    'access_granted',
    $tpl$You're in — {{course_name}} starts {{start_date}}$tpl$,
    $tpl$<p>Hi {{participant_name}},</p>

<p>Good news — your place on <strong>{{course_name}}</strong> ({{cohort_label}}) is open and you can start attending straight away.</p>

<h3>Your class details</h3>
<ul>
  <li><strong>Starts:</strong> {{start_date}} at {{start_time}}</li>
  <li><strong>Ends:</strong> {{end_date}}</li>
  <li><strong>Facilitator:</strong> {{facilitator_name}}</li>
</ul>

<p><a href="{{portal_link}}">Open your student portal</a> — your personal join link, course materials and payment details all live there.</p>

<h3>About your balance</h3>
<p>You have paid <strong>GHS {{amount_paid}}</strong> of <strong>GHS {{course_fee}}</strong>, leaving <strong>GHS {{balance}}</strong> outstanding.</p>

<p>Your access runs until <strong>{{access_expires_on}}</strong>. Settle the balance before then and your place stays open for the rest of the course. If the balance is still outstanding after that date, your access pauses until it is cleared — and your certificate is only issued once the course fee is paid in full.</p>

<p>You can pay any time from your portal, or reply to this email if you would like to arrange something different. If money is the obstacle, please talk to us — we would much rather find a way forward than have you drop out.</p>

<p>See you in class,<br>The Knowsia Team</p>$tpl$
from public.courses c
on conflict (course_id, email_type) do nothing;

insert into public.email_templates (course_id, email_type, subject, body)
select
    c.id,
    'access_expiring',
    $tpl$Your {{course_name}} access ends on {{access_expires_on}}$tpl$,
    $tpl$<p>Hi {{participant_name}},</p>

<p>A quick heads-up: your access to <strong>{{course_name}}</strong> ({{cohort_label}}) is due to end on <strong>{{access_expires_on}}</strong>.</p>

<p>There is still <strong>GHS {{balance}}</strong> outstanding on your course fee of GHS {{course_fee}}.</p>

<p><a href="{{portal_link}}">Pay from your student portal</a> — card and mobile money both work, and your access continues without interruption the moment the payment clears.</p>

<p>If the balance is still outstanding on {{access_expires_on}}, your join link stops working and your place is held rather than cancelled — you keep your attendance record and can pick up where you left off once the balance is settled.</p>

<p>If you need more time, reply to this email before the date above and we will sort something out. We would rather hear from you than lose you.</p>

<p>The Knowsia Team</p>$tpl$
from public.courses c
on conflict (course_id, email_type) do nothing;

insert into public.email_templates (course_id, email_type, subject, body)
select
    c.id,
    'access_expired',
    $tpl$Your {{course_name}} access has paused$tpl$,
    $tpl$<p>Hi {{participant_name}},</p>

<p>Your access to <strong>{{course_name}}</strong> ({{cohort_label}}) ended on {{access_expires_on}}, so your join link has stopped working for now.</p>

<p>Nothing has been cancelled. Your place, your attendance record and any work you have submitted are all still here — <strong>GHS {{balance}}</strong> is simply still outstanding on your course fee of GHS {{course_fee}}.</p>

<p><a href="{{portal_link}}">Settle the balance from your student portal</a> and your access is restored right away, along with your personal join link.</p>

<p>If something has changed, or the timing is difficult, reply to this email and let us know. We can usually work something out — but we can only do that if we hear from you.</p>

<p>The Knowsia Team</p>$tpl$
from public.courses c
on conflict (course_id, email_type) do nothing;

do $$
declare
    seeded integer;
    courses integer;
begin
    select count(*) into seeded
      from public.email_templates
     where email_type in ('access_granted', 'access_expiring', 'access_expired');
    select count(*) into courses from public.courses;
    raise notice
        'access templates: % of % expected rows present (% courses x 3 types).',
        seeded, courses * 3, courses;
end;
$$;

commit;
