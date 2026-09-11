// Finding course materials in the student portal, using TAX1 as the example.
//
// WHY A SEPARATE FLOW FROM portal-login: that video is about getting in and
// what the portal holds. This one answers a single support question — "where
// are the slides?" — and materials are three clicks deep, inside Live Courses,
// on a per-course tab that only loads when you open it. Someone who does not
// know that tab exists will not find it by browsing.
//
// TWO ROUTES, and they are genuinely different things, which is why both are
// shown. `resourcesLink` is one link for the whole course, set on the batch by
// staff. The Materials tab lists items shared per session, each fetched from
// /api/portal/materials/<registrationId> and opened through a signed URL that
// expires. People are told about the first and never find the second.
//
// EVERY RESPONSE IS MOCKED, for the same privacy reason portal-login gives: a
// real session would put a real participant's name, email, phone and payment
// history into a file that then gets published. The UI is real and driven by an
// invented person.
//
// The TAX1 details are the real ones — SEP-2026, 5 to 7 September, Mr. Francis
// Agyen, 800 list against the 680 early-bird — because a training video quoting
// a fee or a date the site contradicts is worse than no video. The start time
// is 17:00, which is what the batch record says and what all three recordings
// show; 18:00 appears elsewhere and is wrong.
//
// The material TITLES are deliberately ordinary teaching artefacts rather than
// the "Recommended Course Deliverables" list in the course brief. That list is
// marked NOT YET PROMISED PUBLICLY, and a tutorial showing them as things you
// receive would quietly turn a maybe into a commitment.

const REGISTRATION_ID = '00000000-0000-4000-8000-000000000001';

const DEMO_REGISTRATION = {
  registrationId: REGISTRATION_ID,
  courseName: 'Preparing For Tax Audit',
  courseCode: 'TAX1',
  cohortLabel: 'SEP-2026',
  registrationStatus: 'Confirmed',
  startDate: '2026-09-05',
  startTime: '17:00:00',
  endDate: '2026-09-07',
  facilitatorName: 'Mr. Francis Agyen',
  zoomLink: 'https://zoom.us/j/00000000000',
  accessExpiresOn: null,
  isFree: false,
  writtenOff: false,
  paymentStatus: 'Paid',
  courseFee: 680,
  originalFee: 800,
  amountPaid: 680,
  balance: 0,
  attendance: [
    { sessionDate: '2026-09-05', durationMinutes: 178 },
    { sessionDate: '2026-09-06', durationMinutes: 164 },
  ],
  certificates: [],
  // The whole-course link staff set on the batch. Shown but never clicked —
  // it leaves the app, and this pipeline does not record pages it controls.
  resourcesLink: 'https://drive.google.com/drive/folders/example-tax1-resources',
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

const DEMO_MATERIALS = [
  {
    id: 'mat-1',
    kind: 'file',
    title: 'Session 1 — slides',
    link: null,
    fileSizeBytes: 2_640_000,
    createdAt: '2026-09-05T19:40:00+00:00',
  },
  {
    id: 'mat-2',
    kind: 'file',
    title: 'Sample tax audit notification',
    link: null,
    fileSizeBytes: 184_000,
    createdAt: '2026-09-05T19:42:00+00:00',
  },
  {
    id: 'mat-3',
    kind: 'link',
    title: 'Ghana Revenue Authority — taxpayer guidance',
    link: 'https://gra.gov.gh/',
    fileSizeBytes: null,
    createdAt: '2026-09-06T19:15:00+00:00',
  },
];

const materialsFlow = {
  id: 'materials',
  title: 'Finding Your Course Materials',
  subtitle: 'Knowsia · Student Portal',
  path: '/portal/login',

  ready: { selector: '#pin' },
  prewarm: ['/portal'],

  mocks: [
    { url: '**/api/portal/login', json: { data: { mustChangePin: false }, error: null } },
    { url: '**/api/portal/me', json: { data: DEMO_DASHBOARD, error: null } },
    { url: '**/api/portal/next-class', json: { data: { nextClass: null }, error: null } },
    { url: '**/api/portal/other-courses', json: { data: [], error: null } },
    { url: '**/api/portal/referrals', json: { data: null, error: null } },
    // Distinct globs rather than one broad pattern, so the download-url call
    // can never be answered by the list mock whatever order they register in.
    {
      url: '**/api/portal/materials/*/download-url**',
      json: { data: { url: 'https://example.invalid/signed/session-1-slides.pdf' }, error: null },
    },
    { url: `**/api/portal/materials/${REGISTRATION_ID}`, json: { data: DEMO_MATERIALS, error: null } },
  ],

  steps: [
    {
      id: 'intro',
      does: 'Shows the student portal login page, which asks for an email or mobile number and a four-digit PIN.',
      narrate:
        'Course materials live in your student portal. Start by signing in at the portal login page.',
      async run(ui) {
        await ui.pause(400);
      },
    },
    {
      id: 'signin',
      does: 'Types an email address and a four-digit PIN, then clicks Log in. The dashboard opens on the Overview section.',
      narrate:
        'Sign in with the email or mobile number you registered with, and your four-digit PIN.',
      async run(ui) {
        await ui.type('#identifier', 'ama.boateng@example.com');
        await ui.type('#pin', '4567');
        await ui.click('button[type="submit"]');
        await ui.clearHighlight();
        await ui.page.waitForURL('**/portal');
        await ui.page.waitForSelector('button:has-text("Live Courses")', { timeout: 20_000 });
        await ui.pause(1000);
      },
    },
    {
      id: 'courses',
      does: 'Opens the Live Courses section, which lists Preparing For Tax Audit with its dates and facilitator.',
      narrate:
        'Materials are not on the overview. Open Live Courses, and find the programme you are taking.',
      async run(ui) {
        await ui.click('button:has-text("Live Courses")');
        await ui.clearHighlight();
        await ui.pause(1100);
      },
    },
    {
      id: 'resources-link',
      does: 'Highlights the Course resources button on the course card, which opens the shared folder for the whole programme in a new tab.',
      narrate:
        'If your facilitator has shared a folder for the whole course, it appears here as Course resources.',
      async run(ui) {
        await ui.highlight('a:has-text("Course resources")');
        await ui.pause(1600);
        await ui.clearHighlight();
      },
    },
    {
      id: 'materials-tab',
      does: 'Clicks the Materials tab on the course card. The list loads, showing files and links shared for each session with their sizes and dates.',
      narrate:
        'For anything shared session by session, open the Materials tab. This is the one people miss.',
      async run(ui) {
        await ui.click('button:has-text("Materials")');
        await ui.clearHighlight();
        await ui.page.waitForSelector('text=Session 1 — slides', { timeout: 15_000 });
        await ui.pause(1400);
      },
    },
    {
      id: 'open-file',
      does: 'Clicks a file in the Materials list, which opens it in a new tab through a temporary download link.',
      narrate:
        'Click any file to open it. The link is generated fresh each time, so save the file rather than the link.',
      async run(ui) {
        // Same guard as the certificate-linkedin flow: the click calls
        // window.open, and the recording must not wander onto a page this
        // pipeline does not control. The button, the click and the request are
        // all real — only the navigation is withheld.
        await ui.page.evaluate(() => {
          window.__openedUrl = null;
          window.open = (url) => {
            window.__openedUrl = url;
            return null;
          };
        });
        await ui.click('button:has-text("Session 1 — slides")');
        await ui.pause(900);
        const opened = await ui.page.evaluate(() => window.__openedUrl);
        if (!opened) {
          throw new Error('Clicking a material opened nothing — the download link is broken.');
        }
        await ui.clearHighlight();
        await ui.pause(700);
      },
    },
  ],
};

export default materialsFlow;
