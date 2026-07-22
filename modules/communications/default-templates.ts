// Default email templates seeded automatically for every new Course
// (founder-approved 2026-07-20, from the system review).
//
// Why this exists: templates are per-Course, and a Course with no template
// row for a type silently sends NOTHING (skipped_no_template) — the exact
// failure that once left registrations without any emails. Seeding on
// creation makes that failure mode impossible; the admin then tailors the
// copy on the Messaging screen. Seeding uses ignore-duplicates so it never
// overwrites edited templates.
import * as communicationsRepository from '@/modules/communications/repository';
import type { EmailType } from '@/lib/domain/types';

const CONTACT = 'info.knowsia@gmail.com';
const MOMO_PERSONAL = '0530531328';
const MOMO_MERCHANT_CODE = '143735';
const PORTAL_LOGIN_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com'}/portal/login`;

// Logo is referenced by public URL, not inlined — email clients (Gmail,
// Outlook) strip or mishandle base64 <img> data URIs far more often than a
// plain hosted URL. Served from public/knowsia-logo.png.
const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com'}/knowsia-logo.png`;

const wrap = (inner: string): string =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a2e;max-width:600px;margin:0 auto;"><p style="margin-bottom:24px;"><img src="${LOGO_URL}" alt="Knowsia" width="140" style="display:block;" /></p>${inner}<p style="margin-top:28px;">Warm regards,<br/><strong>The Knowsia Team</strong></p></div>`;

export const DEFAULT_TEMPLATES: ReadonlyArray<{
  emailType: EmailType;
  subject: string;
  body: string;
}> = [
  {
    emailType: 'welcome',
    subject: 'Welcome to {{course_name}} — {{cohort_label}}',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>Thank you for registering for <strong>{{course_name}}</strong> ({{cohort_label}}). Your place has been recorded.</p>
<p><strong>Course details:</strong></p>
<ul>
  <li>Start date: {{start_date}}</li>
  <li>Start time: {{start_time}}</li>
  <li>Facilitator: {{facilitator_name}}</li>
  <li>Course fee: GHS {{course_fee}}</li>
</ul>
<p>A separate email with payment instructions is on its way to you. Your seat is confirmed once payment is received.</p>
<p>If you have any questions, simply reply to this email or write to ${CONTACT}.</p>`),
  },
  {
    emailType: 'payment_instruction',
    subject: 'Payment instructions — {{course_name}} ({{cohort_label}})',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>To confirm your seat for <strong>{{course_name}}</strong> ({{cohort_label}}), please complete payment of <strong>GHS {{course_fee}}</strong> using any of the options below.</p>
<p><strong>1. Pay online (Card or Mobile Money)</strong><br/>
Use the <em>Pay now</em> button shown on the registration page after you registered, and you will receive instant confirmation.</p>
<p><strong>2. MTN Mobile Money</strong><br/>
Send to our personal MoMo number <strong>${MOMO_PERSONAL}</strong>, or our MoMo Pay merchant code <strong>${MOMO_MERCHANT_CODE}</strong>.<br/>
<em>After paying, send your MoMo transaction reference to ${CONTACT} so we can confirm your payment.</em></p>
<p><strong>3. Bank transfer</strong><br/>
Reply to this email or write to ${CONTACT} and we will send you our bank account details.<br/>
<em>After making a bank transfer, send your transaction reference number to ${CONTACT} so we can confirm your payment.</em></p>
<p>Your registration is only fully confirmed once payment is received.</p>`),
  },
  {
    emailType: 'reminder_1',
    subject: 'Secure your seat — {{course_name}} ({{cohort_label}})',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>This is a friendly reminder that your registration for <strong>{{course_name}}</strong> ({{cohort_label}}) is awaiting payment.</p>
<p>Outstanding balance: <strong>GHS {{balance}}</strong></p>
<p>Seats are limited and are confirmed in order of payment. You can pay by card online, by MTN Mobile Money (personal number ${MOMO_PERSONAL} or MoMo Pay merchant code ${MOMO_MERCHANT_CODE}), or by bank transfer — see your payment instructions email, or write to ${CONTACT}.</p>`),
  },
  {
    emailType: 'reminder_2',
    subject: 'Reminder: complete your payment — {{course_name}}',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>We noticed your payment for <strong>{{course_name}}</strong> ({{cohort_label}}) is still pending.</p>
<p>Outstanding balance: <strong>GHS {{balance}}</strong><br/>
Course starts: {{start_date}} at {{start_time}}</p>
<p>To keep your seat, please complete payment at your earliest convenience — by card, MTN Mobile Money (${MOMO_PERSONAL} or MoMo Pay ${MOMO_MERCHANT_CODE}), or bank transfer. If you have already paid, kindly send your transaction reference to ${CONTACT} so we can confirm it.</p>`),
  },
  {
    emailType: 'reminder_3',
    subject: '{{course_name}} starts in 2 days — payment pending',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p><strong>{{course_name}}</strong> ({{cohort_label}}) begins on <strong>{{start_date}} at {{start_time}}</strong> — just two days away.</p>
<p>Our records show an outstanding balance of <strong>GHS {{balance}}</strong>. Please complete your payment now — by card, MTN Mobile Money (${MOMO_PERSONAL} or MoMo Pay ${MOMO_MERCHANT_CODE}), or bank transfer — so your seat and course materials are ready for you on day one.</p>
<p>Questions or already paid? Write to ${CONTACT}.</p>`),
  },
  {
    emailType: 'reminder_4',
    subject: '{{course_name}} starts today — final payment reminder',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p><strong>{{course_name}}</strong> ({{cohort_label}}) starts <strong>today at {{start_time}}</strong>.</p>
<p>Our records still show an outstanding balance of <strong>GHS {{balance}}</strong>. Complete your payment this morning — by card, MTN Mobile Money (${MOMO_PERSONAL} or MoMo Pay ${MOMO_MERCHANT_CODE}), or bank transfer — to join the class.</p>
<p>If you have already paid, please send your transaction reference to ${CONTACT} right away so we can confirm you before the session begins.</p>`),
  },
  {
    emailType: 'zoom_link',
    subject: 'Your personal Zoom link — {{course_name}} ({{cohort_label}})',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>Your seat for <strong>{{course_name}}</strong> ({{cohort_label}}) is confirmed, and here is your <strong>personal Zoom link</strong> for the sessions:</p>
<p><a href="{{zoom_link}}">{{zoom_link}}</a></p>
<p>Please use this link only — it is unique to you and records your attendance automatically.</p>
<ul>
  <li>First session: {{start_date}} at {{start_time}}</li>
  <li>Facilitator: {{facilitator_name}}</li>
</ul>
<p>See you in class!</p>`),
  },
  {
    emailType: 'payment_confirmation',
    subject: 'Payment received — your seat for {{course_name}} is confirmed',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>We have received your payment of <strong>GHS {{amount_paid}}</strong> for <strong>{{course_name}}</strong> ({{cohort_label}}). Your seat is confirmed — welcome aboard!</p>
<p><strong>What happens next:</strong></p>
<ul>
  <li>Course starts: {{start_date}} at {{start_time}}</li>
  <li>Facilitator: {{facilitator_name}}</li>
  <li>The Zoom link and WhatsApp group invitation will be shared with you before the start date.</li>
</ul>
<p>View your receipt, class Zoom link, and certificates anytime — log in to your <a href="${PORTAL_LOGIN_URL}">student portal</a> with your email or phone number and PIN.</p>
<p>If anything on this receipt looks incorrect, contact us at ${CONTACT}.</p>`),
  },
  {
    emailType: 'post_training_thankyou',
    subject: 'Thank you for completing {{course_name}} — 2 minutes of feedback?',
    body: wrap(`
<p>Dear {{participant_name}},</p>
<p>Congratulations on completing <strong>{{course_name}}</strong> ({{cohort_label}})! It was a pleasure having you in class.</p>
<p>We would love to hear how it went — it takes <strong>under two minutes</strong>:</p>
<p style="margin:24px 0;"><a href="{{feedback_link}}" style="background:#1a1a2e;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Share your feedback</a></p>
<p>Your certificate of participation will be sent to you once your feedback is received.</p>
<p>Thank you for learning with us — we hope to see you in another course soon.</p>`),
  },
];

// Insert-only (ignore-duplicates): existing templates are never overwritten.
export async function seedDefaultTemplatesForCourse(courseId: string): Promise<number> {
  let seeded = 0;
  for (const template of DEFAULT_TEMPLATES) {
    const outcome = await communicationsRepository.insertTemplateIfMissing({
      course_id: courseId,
      email_type: template.emailType,
      subject: template.subject,
      body: template.body,
      is_active: true,
    });
    if (outcome === 'inserted') seeded += 1;
  }
  return seeded;
}
