// Knowsia privacy policy — rewritten 2026-09-04 (Coding Docs/20, Phase 2) to
// describe what the two Knowsia platforms actually do, replacing the WordPress
// text that named a different stack (Stripe, Akismet, Turnitin, forums).
//
// Every statement below was checked against the code on 2026-09-04:
// registration fields (modules/registrations), payments (Paystack + bank-slip
// upload to private R2), messaging (Resend, Meta WhatsApp templates, Arkesel
// SMS), automated calls (Vapi, transcript + summary stored), analytics (GA4 +
// Meta Pixel on public pages only, when configured), attribution cookie
// (first-touch, 30 days), error reporting (Sentry with PII scrubbed), live
// classes (Zoom cloud recording, release gated by consent + approval, BR-24),
// AI use (drafts and triage for staff review, AI cannot finalise grades,
// attendance, access or certificates — BR-25), deletion by anonymisation
// (BR-16), and KnowsiaApp's own data (question attempts, mock exams, study
// plans, AI explanations; httpOnly session cookies).
//
// This is a draft for the founder and a Ghanaian data-protection practitioner
// to review before it is deployed — see PRIVACY_REVIEW_NOTES at the bottom.
// Nothing here is published until the next production deploy, which is the
// review gate; adjust PRIVACY_EFFECTIVE_DATE and PRIVACY_VERSION on approval.

export const PRIVACY_EFFECTIVE_DATE = '4 September 2026';
export const PRIVACY_VERSION = '2.0';

export interface PolicySection {
  heading: string;
  blocks: PolicyBlock[];
}

export type PolicyBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'ul'; items: string[] };

const p = (text: string): PolicyBlock => ({ type: 'p', text });
const h3 = (text: string): PolicyBlock => ({ type: 'h3', text });
const ul = (items: string[]): PolicyBlock => ({ type: 'ul', items });

export const PRIVACY_INTRO: string[] = [
  'Knowsia provides live professional training, self-paced courses, a question bank and exam-preparation tools for accountants, auditors and finance professionals. This policy explains what personal data we collect when you use knowsia.com and app.knowsia.com, why we collect it, who we share it with, how long we keep it, and the choices and rights you have.',
  'It is written to comply with Ghana’s Data Protection Act, 2012 (Act 843). If you are in the European Economic Area or the United Kingdom, the General Data Protection Regulation also applies to the extent we process your data. Where the two differ, we apply the standard that protects you more.',
  'In short: we collect what we need to register you, teach you, bill you and certify you; we do not sell your data; we do not use it to train artificial-intelligence models; and you can ask us at any time to see it, correct it or delete it.',
];

export const PRIVACY_SECTIONS: PolicySection[] = [
  {
    heading: '1. Who we are and how to reach us',
    blocks: [
      p('Knowsia Professional Institute, Accra, Ghana (“Knowsia”, “we”, “us”) operates knowsia.com and app.knowsia.com and is the data controller for the personal data described in this policy.'),
      ul([
        'Email: info@knowsia.com',
        'Phone: +233 20 370 1923 or +233 53 053 1328',
        'Post: Knowsia Professional Institute, Accra, Ghana',
      ]),
      p('If you write to us about your personal data, please say so in the subject line so it reaches the right person quickly.'),
    ],
  },
  {
    heading: '2. What this policy covers',
    blocks: [
      p('This policy applies to:'),
      ul([
        'knowsia.com — the programme catalogue, registration, payments, the student, corporate, tutor and partner portals, certificate verification, and Knowsia Insights news pages;',
        'app.knowsia.com — the study platform: question bank, mock exams, AI explanations, study plans and self-paced courses;',
        'the emails, WhatsApp messages, SMS and phone calls we send or make in connection with those services;',
        'live classes delivered over Zoom and any recordings released to participants.',
      ]),
      p('It does not cover websites we link to but do not operate, such as the professional bodies whose qualifications we teach. Their own policies apply there.'),
    ],
  },
  {
    heading: '3. The personal data we collect',
    blocks: [
      h3('a. When you register for a programme or enquire'),
      ul([
        'Your first name and surname, email address and mobile number.',
        'Your gender, and if you give them, your organisation and job title.',
        'How you heard about us, and, if you followed a partner’s referral link or used a coupon, the partner or code involved.',
        'The programme and cohort you chose, the fee, and your registration status.',
        'A record that you agreed to this policy when you registered (the date and the version you accepted).',
        'Anything you write in an enquiry form, a feedback form or a message to us.',
      ]),
      h3('b. When you pay'),
      ul([
        'If you pay by card or mobile money, payment is handled by Paystack. We receive the amount, the date, the payment method, the last part of the reference and whether it succeeded. We never see or store your full card number or mobile-money PIN.',
        'If you pay by bank transfer and upload a payment slip, we store that image or PDF in private storage so staff can match it to your registration.',
        'For corporate bookings, the billing contact’s name, email, phone and the invoice details.',
      ]),
      h3('c. When you use a portal'),
      ul([
        'A personal identification number (PIN) you use to sign in. We store only a one-way hash of it, never the PIN itself, together with the number of failed attempts so we can lock an account under attack.',
        'Which pages you use, what you download, and when you joined a live class.',
        'For the corporate portal: the employees a company adds to its seats and their attendance and completion.',
        'For the tutor portal: your teaching schedule, the rosters you see, and the attendance and eligibility records you confirm.',
        'For the partner portal: your application details, referral activity and the details we need to pay commission.',
      ]),
      h3('d. When you learn'),
      ul([
        'Attendance at live sessions, assignment submissions, quiz and assessment results, and the feedback and ratings you give at the end of a programme.',
        'On app.knowsia.com: the questions you attempt, your answers and scores, mock-exam results, the topics you study, your study plan, and the questions you ask the AI tutor together with its replies.',
        'The certificates we issue to you, including the certificate number, your name as printed, the programme and the date.',
      ]),
      h3('e. When we communicate with you'),
      ul([
        'Copies of the emails, WhatsApp messages and SMS we send you and whether they were delivered or opened.',
        'Notes staff make about conversations with you.',
        'If we call you with our automated voice assistant (for example a payment reminder or a follow-up after you enquired), a transcript and a short summary of the call. The assistant introduces itself as automated at the start of the call.',
        'Your marketing preferences, including any request to stop receiving marketing.',
      ]),
      h3('f. Automatically, when you use our websites'),
      ul([
        'Your IP address, browser and device type, the pages you visit and the time of your visit.',
        'A first-visit attribution cookie that records how you arrived (for example a campaign link or the page that referred you). It lasts 30 days and is never overwritten.',
        'On public pages only, Google Analytics 4 and the Meta Pixel measure visits and conversions, where we have enabled them. They are not loaded on staff, portal or student screens.',
        'Error reports sent to Sentry so we can fix faults. Names, email addresses, phone numbers and IP addresses are removed from these reports before they leave our systems.',
      ]),
      h3('g. Recordings of live classes'),
      ul([
        'Live classes may be recorded through Zoom’s cloud recording. A recording is only released to the participants enrolled in that class, only after the tutor or an administrator approves it, and only where the consent and retention rules for that class allow it. Released recordings are streamed from a private video library and are not public.',
      ]),
    ],
  },
  {
    heading: '4. Where the data comes from',
    blocks: [
      p('Most of it comes from you, when you register, pay, learn or contact us. Some comes from:'),
      ul([
        'your employer, if it books and pays for your seat through the corporate portal;',
        'a Knowsia partner, if you registered through their referral link;',
        'our payment, messaging and video providers, who tell us whether a payment, message or recording succeeded;',
        'the study platform and the registration platform telling each other that the same person holds an account on both, so that you can sign in once and your cohort purchase can unlock study material. Only your identity is shared for this; never your payment history.',
      ]),
    ],
  },
  {
    heading: '5. Why we use your data, and the legal basis',
    blocks: [
      p('Under Act 843 we may process personal data where you have consented, where it is necessary for a contract with you, where the law requires it, or where it is necessary for our legitimate interests without overriding your rights. We rely on:'),
      h3('To deliver what you registered for (contract)'),
      ul([
        'creating your registration and portal account, sending your class links, schedule and materials;',
        'taking and confirming payment, issuing receipts, invoices and statements, and reminding you about balances;',
        'recording attendance and results, and issuing your certificate;',
        'running the study platform: serving questions, scoring attempts, generating explanations and study plans.',
      ]),
      h3('To keep certificates trustworthy (legitimate interest, and your interest)'),
      ul([
        'Anyone who has a certificate number or scans its QR code can confirm on our verification page that the certificate is genuine. The page shows the holder’s name, the programme and the date of issue — the same information printed on the certificate — and nothing else.',
      ]),
      h3('To communicate with you (contract and legitimate interest)'),
      ul([
        'service messages about your registration, payment, classes and certificate by email, WhatsApp and SMS;',
        'reminders and follow-ups, including automated voice calls about payments or an enquiry you made;',
        'answering your questions and resolving problems.',
      ]),
      h3('To tell you about programmes (consent, or legitimate interest with an easy opt-out)'),
      ul([
        'news about upcoming cohorts and related programmes, by email and, where you have agreed, WhatsApp or SMS. Every marketing email carries an unsubscribe link, and section 10 explains how to stop any channel.',
      ]),
      h3('To run and improve Knowsia (legitimate interest)'),
      ul([
        'measuring which programmes and campaigns people respond to, using aggregated analytics;',
        'publishing programme ratings and testimonials — a rating is only shown once at least five participants have rated a programme, and a quote is only attributed to you by name if you agreed to that on the feedback form;',
        'protecting our systems against fraud and misuse;',
        'training our staff and reviewing quality.',
      ]),
      h3('To meet our legal obligations'),
      ul(['keeping financial records for tax and audit purposes, and responding to lawful requests from authorities.']),
    ],
  },
  {
    heading: '6. How we use artificial intelligence',
    blocks: [
      p('We use AI services from Anthropic, xAI and Together AI in a limited and supervised way:'),
      ul([
        'to draft follow-up messages and rank enquiries for our staff, who review before anything important is sent;',
        'to run automated reminder and follow-up phone calls with a voice assistant, which identifies itself as automated;',
        'to mark practice answers, generate explanations and suggest what to study next on the study platform;',
        'to help our content team categorise past questions and check them against syllabuses.',
      ]),
      p('AI never makes a final decision about your grade, your attendance, your access to a programme or your certificate; a person does. We send our AI providers only the information a task needs, they process it on our instructions, and we do not allow your data to be used to train their models. You can ask us to explain any AI-assisted outcome that affects you, and to have a person review it.'),
    ],
  },
  {
    heading: '7. Who we share your data with',
    blocks: [
      p('We do not sell or rent personal data. We share it only with:'),
      h3('Service providers who process data for us'),
      ul([
        'Hosting and databases: Vercel, Supabase, Railway, Cloudflare, Upstash.',
        'Payments: Paystack.',
        'Email, WhatsApp and SMS: Resend, Meta (WhatsApp Business), Arkesel.',
        'Automated voice calls: Vapi.',
        'Live classes and recordings: Zoom, Bunny Stream.',
        'Artificial intelligence: Anthropic, xAI, Together AI (section 6).',
        'Analytics and error reporting: Google Analytics, Meta Pixel, Sentry.',
        'Internal tools: Google Workspace.',
      ]),
      p('Each provider is bound by contract to use the data only to provide its service to us and to protect it.'),
      h3('People and organisations connected to your training'),
      ul([
        'Your employer, if it sponsors your seat: your registration status, attendance, completion and certificate.',
        'Your tutor: your name and attendance for the classes they teach.',
        'A partner who referred you: confirmation that a referral led to a registration, for commission purposes, not your personal details.',
        'The public, but only through certificate verification (section 5) and only what is printed on the certificate.',
        'LinkedIn, only if you choose “Add to LinkedIn” on a certificate — you then share it yourself.',
      ]),
      h3('Authorities'),
      ul(['Regulators, courts or law-enforcement bodies where the law requires it.']),
      h3('The study platform and the registration platform'),
      ul([
        'knowsia.com and app.knowsia.com are two systems run by Knowsia. They exchange only what is needed to let you sign in once and to unlock study material you have paid for: your name, email, phone and an account link. Neither system reads the other’s database.',
      ]),
    ],
  },
  {
    heading: '8. International transfers',
    blocks: [
      p('Knowsia operates from Ghana. Several of our providers store or process data in the European Union or the United States. When we transfer your data outside Ghana we do so under contracts that require the recipient to protect it to a standard equivalent to Act 843, and, where the GDPR applies, using standard contractual clauses or an adequacy decision. You can ask us which providers hold your data and where.'),
    ],
  },
  {
    heading: '9. How long we keep your data',
    blocks: [
      p('We keep personal data only as long as we need it for the purposes above, then delete or anonymise it. Our standard periods are:'),
      ul([
        'Registration, attendance and results: for the life of your account and 7 years after your last programme, because they support certificates and financial records.',
        'Payment records, receipts and invoices: 7 years, as required for tax and audit.',
        'Certificates and the verification record: indefinitely, so a certificate can always be verified.',
        'Enquiries that never become a registration: 24 months from the last contact.',
        'Call transcripts and summaries: 12 months.',
        'Marketing opt-outs: indefinitely, so we can keep honouring them.',
        'Class recordings: the retention period set when the recording is released, shown to participants at the time.',
        'Study-platform activity (attempts, scores, study plans, AI explanations): for the life of your account.',
        'Website analytics and server logs: up to 26 months for analytics, 90 days for logs.',
        'The attribution cookie: 30 days.',
      ]),
      p('When you ask us to delete your account, we anonymise your record: your name, contact details and other identifiers are removed or replaced, while the financial and certificate records the law or the certificate requires are kept in a form that no longer identifies you unless a certificate is being verified.'),
    ],
  },
  {
    heading: '10. Your choices',
    blocks: [
      ul([
        'Marketing: use the unsubscribe link in any marketing email, or tell us by email, WhatsApp or phone which channel you want stopped. Service messages about a programme you are enrolled in continue until the programme ends.',
        'Automated calls: ask us not to call you and we will switch to email only.',
        'Cookies and analytics: you can block or delete cookies in your browser. Blocking the sign-in cookies will stop the portals and the study platform from working.',
        'Testimonials: you choose on the feedback form whether a quote may be published and whether your name may appear with it.',
        'Recordings: you will be told before a class is recorded. If you do not want to appear, keep your camera and microphone off, or tell the tutor.',
      ]),
    ],
  },
  {
    heading: '11. Your rights',
    blocks: [
      p('Under Act 843, and the GDPR where it applies, you have the right to:'),
      ul([
        'Access — ask for a copy of the personal data we hold about you and how we use it.',
        'Correction — have inaccurate or incomplete data corrected. You can change most contact details yourself in your portal.',
        'Deletion — ask us to delete your data, subject to the records we must keep (section 9).',
        'Objection — object to processing based on legitimate interests, and to direct marketing at any time.',
        'Withdraw consent — where we rely on consent, withdraw it at any time without affecting what was done before.',
        'Portability — where the GDPR applies, receive the data you gave us in a machine-readable format.',
        'Human review — ask a person to review any AI-assisted outcome that affects you.',
        'Complain — to us first, and to the Data Protection Commission of Ghana (www.dataprotection.org.gh) or, where the GDPR applies, to your local supervisory authority.',
      ]),
      p('To exercise any of these rights, email info@knowsia.com. We will confirm your identity, usually by asking you to write from the email address on your account or to sign in to your portal, and we aim to respond within 30 days. There is no charge unless a request is clearly excessive.'),
    ],
  },
  {
    heading: '12. How we protect your data',
    blocks: [
      ul([
        'All traffic to our websites is encrypted with HTTPS.',
        'Portal PINs are stored only as one-way hashes; staff passwords are managed by our authentication provider and never seen by our code; accounts lock after repeated failed attempts.',
        'Database rules restrict every record to the people who need it — a tutor sees only their classes, a company only its employees, a partner only their referrals.',
        'Uploaded files such as payment slips are held in private storage that is never publicly listable.',
        'Personal identifiers are removed from error reports before they leave our systems.',
        'Access by staff is limited by role and every sensitive action is logged.',
      ]),
      p('No system is perfectly secure. If a breach affects your data we will tell you and the Data Protection Commission without undue delay, explain what happened and what we are doing about it.'),
    ],
  },
  {
    heading: '13. Cookies',
    blocks: [
      p('We use a small number of cookies:'),
      ul([
        'Sign-in cookies for the staff area, the portals and the study platform. These are essential, are marked HttpOnly so scripts cannot read them, and expire when you sign out or after a period of inactivity (the study platform’s session lasts 15 minutes and is renewed for up to 30 days while you keep using it).',
        'knowsia_attribution — records how you first arrived at the site, for 30 days.',
        'Google Analytics and Meta Pixel cookies on public pages, where enabled, to measure visits and campaign results.',
      ]),
      p('We do not use cookies to serve advertising on our own pages.'),
    ],
  },
  {
    heading: '14. Children',
    blocks: [
      p('Our programmes are for working professionals and students of professional qualifications. We do not knowingly collect personal data from anyone under 18. If you believe a child has registered, contact us and we will remove the data.'),
    ],
  },
  {
    heading: '15. Changes to this policy',
    blocks: [
      p('We will update this policy when our services or the law change. The effective date and version at the top tell you when it last changed. For a material change we will tell you by email or a notice in your portal before it takes effect. Earlier versions are available on request.'),
    ],
  },
];

// Not rendered. What the founder and a Ghanaian data-protection practitioner
// must confirm before PRIVACY_EFFECTIVE_DATE is set and the page goes live.
export const PRIVACY_REVIEW_NOTES: string[] = [
  'Legal entity: Knowsia Professional Institute (founder confirmation, 2026-09-04); KnowsiaApp’s page now says the same. Add the registered address and the Data Protection Commission registration number to section 1 once registered (Act 843 s.27 requires controllers to register).',
  'AI providers (section 6): the statement "we do not allow your data to be used to train their models" must be checked against the current terms of Anthropic, xAI and Together AI for API use, and the Vapi transcript retention setting.',
  'Retention periods (section 9) are proposed defaults, not current practice — nothing in either system deletes on a schedule yet. Either adopt them and build the purge jobs, or change the numbers to what will actually happen.',
  'Recordings (section 3g): the consent and retention wording assumes BR-24 is enforced end to end, including telling participants before a class is recorded.',
  'Analytics (section 3f): GA4 and Meta Pixel are only loaded when NEXT_PUBLIC_GA4_ID / NEXT_PUBLIC_META_PIXEL_ID are set. If neither is set in production, drop those lines rather than describe tracking that does not happen.',
  'Contact details: confirm the two phone numbers and that info@knowsia.com is monitored for data requests after the mail migration (Doc 20 §9).',
  'app.knowsia.com currently serves its own June 2026 privacy page. Once this text is approved, that page should link here (or carry the same text) so the two platforms do not publish different policies.',
];
