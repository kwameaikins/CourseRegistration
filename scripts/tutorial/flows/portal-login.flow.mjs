// Walkthrough of the student portal: logging in, and finding the things
// people currently email staff about.
//
// WHY THIS FLOW EXISTS: "your PIN is the last 4 digits of your phone number"
// is written 20 times across 15 files in this codebase, and there are three
// separate recovery mechanisms for it (forgot-PIN, reset-PIN, and an admin
// backfill-pins endpoint). Explaining something twenty times in copy and still
// needing three escape hatches is the clearest signal in the repository that
// this is where support load lives.
//
// EVERY RESPONSE IS MOCKED, and that is a privacy decision, not a convenience.
// A real portal session would put a real participant's name, email, phone,
// payment history and certificate numbers on screen in a file that then gets
// published. The portal login page and dashboard are both client components
// that fetch through the browser, so Playwright can intercept the lot and the
// video shows the real UI driven by an invented person. No database row is
// created, no real account is touched, and no PII is disclosed.

const DEMO_REGISTRATION = {
  registrationId: '00000000-0000-4000-8000-000000000001',
  courseName: 'Preparing For Tax Audit',
  courseCode: 'TAX1',
  cohortLabel: 'SEP-2026',
  registrationStatus: 'Confirmed',
  startDate: '2026-09-05',
  startTime: '18:00:00',
  endDate: '2026-09-13',
  facilitatorName: 'Mr. Francis Agyen',
  zoomLink: 'https://zoom.us/j/00000000000',
  accessExpiresOn: null,
  isFree: false,
  writtenOff: false,
  paymentStatus: 'Paid',
  // Paid at the early-bird price against a list fee of 800, so the portal
  // shows a real discount rather than a suspiciously round number.
  courseFee: 680,
  originalFee: 800,
  amountPaid: 680,
  balance: 0,
  attendance: [],
  // Deliberately empty: this cohort has not run yet, and showing a certificate
  // for a course nobody has sat would be a lie told in a training video.
  certificates: [],
  resourcesLink: null,
  installments: [],
  feedbackSubmitted: false,
};

const DEMO_DASHBOARD = {
  fullName: 'Ama Boateng',
  firstName: 'Ama',
  middleName: null,
  surname: 'Boateng',
  email: 'ama.boateng@example.com',
  phone: '+233201234567',
  mustChangePin: false,
  studyPlatformEnabled: false,
  registrations: [DEMO_REGISTRATION],
};

const portalLoginFlow = {
  id: 'portal-login',
  title: 'Using Your Student Portal',
  subtitle: 'Knowsia · Student Portal',
  path: '/portal/login',

  ready: { selector: '#pin' },

  // Logging in is a client-side push to /portal, which the dev server would
  // otherwise compile on the spot, mid-recording.
  prewarm: ['/portal'],

  mocks: [
    {
      url: '**/api/portal/login',
      json: { data: { mustChangePin: false }, error: null },
    },
    { url: '**/api/portal/me', json: { data: DEMO_DASHBOARD, error: null } },
    {
      url: '**/api/portal/next-class',
      json: {
        data: {
          nextClass: {
            title: 'Preparing For Tax Audit — Session 1',
            startsAt: '2026-09-05T18:00:00+00:00',
            endsAt: '2026-09-05T20:00:00+00:00',
            joinUrl: 'https://zoom.us/j/00000000000',
          },
        },
        error: null,
      },
    },
    { url: '**/api/portal/other-courses', json: { data: [], error: null } },
    { url: '**/api/portal/referrals', json: { data: null, error: null } },
  ],

  steps: [
    {
      id: 'intro',
      does: 'Shows the student portal login page, which asks for an email or mobile number and a four-digit PIN.',
      narrate:
        'Your student portal is where everything lives after you register. Start at the login page.',
      async run(ui) {
        await ui.pause(400);
      },
    },
    {
      id: 'identifier',
      does: 'Types an email address into the "Email or Mobile Number" field. The same field also accepts the mobile number used at registration.',
      narrate:
        'Sign in with either the email address or the mobile number you registered with. Both work.',
      async run(ui) {
        await ui.type('#identifier', 'ama.boateng@example.com');
        await ui.clearHighlight();
      },
    },
    {
      id: 'pin',
      does: 'Types a four-digit PIN into the PIN field, which masks what is typed. The page states that a first-time PIN is the last four digits of the registered mobile number.',
      narrate:
        'If you have never logged in, your PIN is the last four digits of your mobile number. Just four digits.',
      async run(ui) {
        await ui.type('#pin', '4567');
        await ui.pause(500);
        await ui.clearHighlight();
      },
    },
    {
      id: 'submit',
      does: 'Clicks Log in. The dashboard opens on the Overview section, showing the registered course and the next class with its join link.',
      narrate:
        'Log in, and you land on your overview — your course, and your next class with its join link.',
      async run(ui) {
        await ui.click('button[type="submit"]');
        // Cleared BEFORE the wait, not after: logging in is a client-side push
        // rather than a real navigation, so the overlay is never re-injected
        // and the ring would otherwise hang over the dashboard as it loads.
        await ui.clearHighlight();
        await ui.page.waitForURL('**/portal');
        await ui.page.waitForSelector('button:has-text("My Courses")', { timeout: 20_000 });
        await ui.pause(1200);
      },
    },
    {
      id: 'courses',
      does: 'Opens the My Courses section, which lists the registered course with its dates, facilitator and Zoom join link.',
      narrate:
        'My Courses has every programme you have registered for, with the dates and the link to join each class.',
      async run(ui) {
        await ui.click('button:has-text("My Courses")');
        await ui.clearHighlight();
        await ui.pause(900);
      },
    },
    {
      id: 'payments',
      does: 'Opens the Payments and Receipts section, showing what was paid, any balance still owing, and receipts.',
      narrate:
        'Payments and Receipts shows what you have paid, anything still owing, and lets you download a receipt.',
      async run(ui) {
        await ui.click('button:has-text("Payments & Receipts")');
        await ui.clearHighlight();
        await ui.pause(900);
      },
    },
    {
      id: 'certificates',
      does: 'Opens the Certificates section. It is empty here because the course has not run yet; certificates appear after the programme is completed.',
      narrate:
        'Certificates appear here once you have completed a programme, ready to download or verify.',
      async run(ui) {
        await ui.click('button:has-text("Certificates")');
        await ui.clearHighlight();
        await ui.pause(900);
      },
    },
    {
      id: 'account',
      does: 'Opens the Account section, where the participant can change their PIN and correct their own name.',
      narrate:
        'And under Account you can change that PIN to something of your own, or correct your name.',
      async run(ui) {
        await ui.click('button:has-text("Account")');
        await ui.clearHighlight();
        await ui.pause(1100);
      },
    },
  ],
};

export default portalLoginFlow;
