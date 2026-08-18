// Walkthrough of finding an issued certificate in the student portal and
// putting it on a LinkedIn profile.
//
// WHY THIS FLOW EXISTS: the certificate is the thing a participant actually
// wanted from the course, and "Add to LinkedIn" is a one-click button most
// people never notice sitting next to the download link. The whole point of
// issuing a credential with a public /verify URL is that it can be shown to an
// employer, which only happens if someone knows the button is there.
//
// EVERY RESPONSE IS MOCKED, for the same privacy reason as portal-login: a real
// session would put a real participant's name, email, phone and certificate
// number into a published video. The persona and her certificate number are
// invented; the UI rendering them is entirely real.
//
// THE LINKEDIN TAB IS DELIBERATELY NOT OPENED. window.open is stubbed for the
// one step that clicks the button, so the recording cannot wander onto
// linkedin.com — a third-party page this pipeline does not control, which in a
// fresh browser shows a sign-in wall rather than the pre-filled form, and would
// add an unpredictable extra page to the stitched output. The click, the
// button, and the URL it builds are all real; only the navigation is withheld.

const DEMO_CERTIFICATE = {
  id: '00000000-0000-4000-8000-0000000000c1',
  certificateNumber: 'KNS-TAX1-2026-0042',
  issuedDate: '2026-08-14',
  revoked: false,
};

const DEMO_REGISTRATION = {
  registrationId: '00000000-0000-4000-8000-000000000001',
  courseName: 'Preparing For Tax Audit',
  courseCode: 'TAX1',
  cohortLabel: 'JUL-2026',
  registrationStatus: 'Attended',
  // A finished cohort, so a certificate on the account is honest rather than
  // a course nobody has sat yet.
  startDate: '2026-07-04',
  startTime: '18:00:00',
  endDate: '2026-08-13',
  facilitatorName: 'Mr. Francis Agyen',
  zoomLink: null,
  accessExpiresOn: null,
  isFree: false,
  writtenOff: false,
  paymentStatus: 'Paid',
  courseFee: 680,
  originalFee: 800,
  amountPaid: 680,
  balance: 0,
  attendance: [],
  certificates: [DEMO_CERTIFICATE],
  resourcesLink: null,
  installments: [],
  feedbackSubmitted: true,
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

const certificateLinkedInFlow = {
  id: 'certificate-linkedin',
  title: 'Adding Your Certificate to LinkedIn',
  subtitle: 'Knowsia · Certificates',
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
    { url: '**/api/portal/next-class', json: { data: { nextClass: null }, error: null } },
    { url: '**/api/portal/other-courses', json: { data: [], error: null } },
    { url: '**/api/portal/referrals', json: { data: null, error: null } },
  ],

  steps: [
    {
      id: 'intro',
      does: 'Shows the student portal login page, which asks for an email or mobile number and a four-digit PIN.',
      narrate:
        'Your certificate lives in your student portal. Start by signing in.',
      async run(ui) {
        await ui.pause(400);
      },
    },
    {
      id: 'sign-in',
      does: 'Types an email address and a four-digit PIN, then clicks Log in. The dashboard opens on the Overview section.',
      narrate:
        'Sign in with the email or mobile number you registered with, and your four-digit PIN.',
      async run(ui) {
        await ui.type('#identifier', 'ama.boateng@example.com');
        await ui.type('#pin', '4567');
        await ui.pause(400);
        await ui.click('button[type="submit"]');
        // Cleared BEFORE the wait: logging in is a client-side push rather than
        // a real navigation, so the overlay is never re-injected and the ring
        // would otherwise hang over the dashboard as it loads.
        await ui.clearHighlight();
        await ui.page.waitForURL('**/portal');
        await ui.page.waitForSelector('button:has-text("Certificates")', { timeout: 20_000 });
        await ui.pause(1000);
      },
    },
    {
      id: 'open-certificates',
      does: 'Opens the Certificates section from the sidebar. It shows a card for the completed course with the certificate number and the date it was issued.',
      narrate:
        'Open Certificates. Every programme you have completed appears here.',
      async run(ui) {
        await ui.click('button:has-text("Certificates")');
        await ui.clearHighlight();
        await ui.pause(1100);
      },
    },
    {
      id: 'the-card',
      does: 'Highlights the certificate card, which shows the course name, the certificate number, the issue date, and a public verification link.',
      narrate:
        'Each certificate carries its own number and a public verification link, so anyone can confirm it is genuine.',
      async run(ui) {
        await ui.highlight('.cert-card');
        await ui.pause(1400);
        await ui.clearHighlight();
      },
    },
    {
      id: 'download',
      does: 'Points at the Download PDF button without pressing it.',
      narrate:
        'Download PDF gives you the certificate itself, any time you need it.',
      async run(ui) {
        // Deliberately moveTo + highlight rather than click: the link opens a
        // new tab and streams a PDF, neither of which belongs in the recording.
        await ui.moveTo('a:has-text("Download PDF")');
        await ui.highlight('a:has-text("Download PDF")');
        await ui.pause(900);
        await ui.clearHighlight();
      },
    },
    {
      id: 'add-to-linkedin',
      does: 'Clicks the Add to LinkedIn button next to the download link.',
      narrate:
        'Next to it is Add to LinkedIn. One click, and LinkedIn opens ready to add this certificate.',
      async run(ui) {
        // Stub window.open for this click only. The button, the click and the
        // URL it builds are all real; withholding the navigation keeps the
        // recording off a third-party sign-in page. The captured URL is
        // asserted below, so a broken link still fails the run rather than
        // quietly recording a button that does nothing.
        await ui.page.evaluate(() => {
          window.__tutLinkedInUrl = null;
          window.open = (url) => {
            window.__tutLinkedInUrl = String(url);
            return null;
          };
        });
        await ui.click('button:has-text("Add to LinkedIn")');
        await ui.pause(700);

        const opened = await ui.page.evaluate(() => window.__tutLinkedInUrl);
        if (!opened || !opened.startsWith('https://www.linkedin.com/profile/add?')) {
          throw new Error(`Add to LinkedIn built an unexpected URL: ${opened}`);
        }
        // The four fields the narration promises are pre-filled. If the URL
        // builder ever drops one, this flow fails instead of teaching people to
        // expect something the button no longer does.
        for (const param of ['name=', 'issueYear=', 'certUrl=', 'certId=']) {
          if (!opened.includes(param)) {
            throw new Error(`Add to LinkedIn URL is missing ${param}: ${opened}`);
          }
        }
        await ui.clearHighlight();
      },
    },
    {
      id: 'on-linkedin',
      does: 'Stays on the certificates page while explaining what the opened LinkedIn form already contains.',
      narrate:
        'LinkedIn opens with the course name, the issue date, the credential number and the verification link already filled in. Check the details, then press Save. It appears under Licenses and Certifications on your profile.',
      async run(ui) {
        await ui.highlight('.cert-card');
        await ui.pause(1600);
        await ui.clearHighlight();
      },
    },
    {
      id: 'verify',
      does: 'Highlights the public verification line on the certificate card.',
      narrate:
        'Anyone who clicks that link on your profile lands on the Knowsia verification page and sees the certificate is real.',
      async run(ui) {
        await ui.highlight('.verify');
        await ui.pause(1300);
        await ui.clearHighlight();
      },
    },
  ],
};

export default certificateLinkedInFlow;
