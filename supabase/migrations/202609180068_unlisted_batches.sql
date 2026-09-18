-- Unlisted Batches (founder request 2026-09-18): one-to-one tuition.
--
-- A student asked for private, hybrid one-to-one tuition (Excel Data
-- Analytics) at an agreed fee. That is deliberately NOT a new entity — it is
-- an ordinary Course + Batch with one seat and the agreed fee, so the whole
-- registration -> payment -> portal -> LMS grant -> certificate chain works
-- unchanged (the same reasoning as free events, 202608030048). The one thing
-- an ordinary Batch cannot do is stay OFF the public programmes page, and a
-- private price on a public page is a price everyone else sees.
--
-- is_unlisted keeps a Batch out of every public LISTING (the programmes
-- pages, the catalogue API, the registration form's dropdown) while leaving
-- it registerable by direct link — the staff seat offer sends
-- /register?batchId=..., and the form includes that one Batch when the URL
-- names it. Nothing staff-facing changes: an unlisted Batch appears on the
-- Courses screen, in registrations, in reports, exactly as any other.
begin;

alter table public.batches
    add column is_unlisted boolean not null default false;

comment on column public.batches.is_unlisted is
    'True for a private Batch (one-to-one tuition, a bespoke corporate run): hidden from every public listing, reachable only by a direct /register?batchId= link. Staff screens are unaffected.';

commit;
