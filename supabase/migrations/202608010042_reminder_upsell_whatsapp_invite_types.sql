-- Widens sms_log/whatsapp_log message_type to allow the 4 message types that
-- already exist as EmailType/email_templates values but have never had
-- SMS/WhatsApp sending logic (class_reminder_24h, class_reminder_2h, upsell,
-- whatsapp_invite) — see Coding Docs/PLAN.md for the founder-flagged gap.
-- Same widen-the-CHECK pattern as 202607250028_installment_reminder_email_type.sql.
--
-- Required Meta Business Manager WhatsApp templates (positional {{1}}, {{2}}...
-- parameters, mirroring the header comment in 202607180002_whatsapp.sql):
--   course_class_reminder_24h    — [firstName, courseLabel, startDate, startTime]
--   course_class_reminder_2h     — [firstName, courseLabel, startTime, zoomLink]
--   course_upsell_pitch          — [firstName, pitchCourseLabel, pitchStartDate, pitchFee]
--   course_whatsapp_group_invite — [firstName, courseLabel, whatsappGroupLink]
-- These must be created and approved before WhatsApp sends of these 4 types
-- will succeed; isWhatsappConfigured() gates all WhatsApp sending until then.
begin;

alter table public.sms_log
    drop constraint sms_log_message_type_check;

alter table public.sms_log
    add constraint sms_log_message_type_check
    check (
        message_type in (
            'welcome', 'reminder_1', 'reminder_2', 'reminder_3', 'reminder_4',
            'payment_confirmation', 'class_reminder_24h', 'class_reminder_2h',
            'upsell', 'whatsapp_invite'
        )
    );

alter table public.whatsapp_log
    drop constraint whatsapp_log_message_type_check;

alter table public.whatsapp_log
    add constraint whatsapp_log_message_type_check
    check (
        message_type in (
            'welcome', 'reminder_1', 'reminder_2', 'reminder_3', 'reminder_4',
            'payment_confirmation', 'class_reminder_24h', 'class_reminder_2h',
            'upsell', 'whatsapp_invite'
        )
    );

commit;
