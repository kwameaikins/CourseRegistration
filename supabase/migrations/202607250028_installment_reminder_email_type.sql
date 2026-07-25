-- Adds 'installment_reminder' to email_templates.email_type (founder-
-- approved 2026-07-24, payment plans) — the one email reminder ahead of a
-- payment plan's second installment due date. email_log has no CHECK on
-- email_type (see foundation.sql), so only the template table's constraint
-- needs widening.
begin;

alter table public.email_templates
    drop constraint email_templates_email_type_check;

alter table public.email_templates
    add constraint email_templates_email_type_check
    check (
        email_type in (
            'welcome', 'payment_instruction', 'reminder_1', 'reminder_2',
            'reminder_3', 'reminder_4', 'payment_confirmation',
            'class_reminder_24h', 'class_reminder_2h', 'zoom_link',
            'whatsapp_invite', 'post_training_thankyou', 'upsell',
            'installment_reminder'
        )
    );

commit;
