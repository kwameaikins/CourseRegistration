-- Tutor Portal Phase 4 (founder-approved 2026-07-31) — Session Materials.
--
-- A tutor-shared link (slides, agenda, readings) per batch/session, visible to staff
-- and the batch's enrolled participants. Deliberately link-based, not a file upload:
-- migration 202607280036 added batches.resources_link as a plain link specifically
-- instead of building file storage ("same shape as the existing zoom_link... rather
-- than building file storage") — this table follows that same, very recent precedent.

begin;

create table public.session_materials (
    id                    uuid primary key default gen_random_uuid(),
    batch_id              uuid not null references public.batches(id) on delete cascade,
    live_session_id       uuid references public.live_sessions(id) on delete set null,
    uploaded_by_tutor_id  uuid references public.tutors(id) on delete set null,
    title                 text not null check (char_length(trim(title)) between 2 and 200),
    link                  text not null check (char_length(trim(link)) > 0),
    created_at            timestamptz not null default now()
);

comment on table public.session_materials is
    'Tutor-shared material links (slides/agenda/readings) per batch, optionally scoped to one live session. No file storage — link only.';

create index session_materials_batch_created_at_idx
    on public.session_materials (batch_id, created_at desc);

alter table public.session_materials enable row level security;

-- Same staff role gate as the /live-sessions screen (lib/auth/roles.ts: ['admin', 'management']).
create policy admin_full_session_materials
on public.session_materials for all
to authenticated
using (public.fn_current_role() = 'admin')
with check (public.fn_current_role() = 'admin');

create policy management_read_session_materials
on public.session_materials for select
to authenticated
using (public.fn_current_role() = 'management');

grant select, insert, update, delete on table public.session_materials to authenticated;

-- No tutor- or participant-facing RLS policy: both read/write through the
-- service-role client, gated in the application layer (requireOwnBatch for tutors,
-- the participant portal's own registration-ownership check for students).

commit;
