-- Knowsia Core identity link (Coding Docs/22 §3, Phase 2, 2026-09-18).
--
-- One person, one Core identity, SEPARATE app records. This app keeps every
-- participant and staff row exactly where it is; the identity id written
-- here is a shared KEY, set by the linker in knowsia-api (exact email only)
-- through POST /api/integration/identities/link. Nothing is merged, no row
-- moves, and nothing about sign-in reads this column yet — Phase 2's
-- dual-read only compares and logs.
begin;

alter table public.participants
    add column core_identity_id uuid;
alter table public.staff_users
    add column core_identity_id uuid;

create index participants_core_identity_idx on public.participants (core_identity_id)
    where core_identity_id is not null;
create index staff_users_core_identity_idx on public.staff_users (core_identity_id)
    where core_identity_id is not null;

comment on column public.participants.core_identity_id is
    'Knowsia Core identity this participant belongs to (Doc 22 §3). A shared key set by the linker, exact email only; never a merge.';
comment on column public.staff_users.core_identity_id is
    'Knowsia Core identity this staff account belongs to (Doc 22 §3). A shared key set by the linker, exact email only.';

commit;
