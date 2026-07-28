-- Course resources link (founder-approved 2026-07-28) — a simple per-Batch
-- link to course materials/slides, same shape as the existing zoom_link and
-- whatsapp_group_link fields rather than building file storage.

begin;

alter table public.batches
    add column resources_link text;

commit;
