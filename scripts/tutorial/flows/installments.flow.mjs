// Splitting a course fee into two payments.
//
// WHY THIS IS WORTH A VIDEO: it is the answer to "I want the course but not
// all at once", and nobody finds it. The control is a plain text link at the
// bottom of a course card, below the Pay Now button, and it only exists in one
// narrow state — so a student who has already paid a deposit, or who looks
// after the plan was needed, never sees it and never learns it was there.
//
// The offer is genuinely once-only, and the narration says so plainly rather
// than selling it. The rule, quoted from the portal itself:
//
//   "50% now, 50% closer to the course start date. Available once, before you
//    make any payment."
//
// THE FIXTURE HAS TO BE UNPAID, and that is not the demo registration the
// other portal flows reuse. The trigger renders only when the registration is
// not written off, the balance is above zero, no plan exists yet, and the
// payment status is exactly "Unpaid" — so this file carries its own.

const REGISTRATION_ID = '00000000-0000-4000-8000-000000000001';

const DEMO_REGISTRATION = {
  registrationId: REGISTRATION_ID,
  courseName: 'Preparing For Tax Audit',
  courseCode: 'TAX1',
  cohortLabel: 'SEP-2026',
  registrationStatus: 'Registered',
  startDate: '2026-09-05',
  startTime: '18:00:00',
  endDate: '2026-09-13',
  facilitatorName: 'Mr. Francis Agyen',
  zoomLink: null,
  accessExpiresOn: null,
  isFree: false,
  writtenOff: false,
  paymentStatus: 'Unpaid',
  courseFee: 800,
  originalFee: 800,
  amountPaid: 0,
  balance: 800,
  attendance: [],
  certificates: [],
  resourcesLink: null,
  // Empty, or the offer is replaced by the existing plan and never appears.
  installments: [],
  feedbackSubmitted: false,
};

const WITH_PLAN = {
  ...DEMO_REGISTRATION,
  installments: [
    {
      installmentNumber: 1,
      amountDue: 400,
      amountPaid: 0,
      dueDate: '2026-08-20',
      paymentStatus: 'Pending',
    },
    {
      installmentNumber: 2,
      amountDue: 400,
      amountPaid: 0,
      dueDate: '2026-09-03',
      paymentStatus: 'Pending',
    },
  ],
};

function dashboard(registration) {
  return {
    data: {
      fullName: 'Ama Boateng',
      firstName: 'Ama',
      middleName: null,
      surname: 'Boateng',
      email: 'ama.boateng@example.com',
      phone: '+233201234567',
      mustChangePin: false,
      studyPlatformEnabled: false,
      selfPacedCourses: [],
      registrations: [registration],
    },
    error: null,
  };
}

const installmentsFlow = {
  id: 'installments',
  title: 'Paying in Two Instalments',
  subtitle: 'Knowsia · Payments',
  path: '/portal',

  ready: { selector: 'button:has-text("Live Courses")' },

  mocks: [
    // Confirming the plan re-loads the dashboard, so `me` is a sequence: the
    // course has no plan until the button is pressed and two instalments
    // afterwards. Nothing is written.
    { url: '**/api/portal/me', sequence: [dashboard(DEMO_REGISTRATION), dashboard(WITH_PLAN)] },
    { url: '**/api/portal/next-class', json: { data: { nextClass: null }, error: null } },
    { url: '**/api/portal/other-courses', json: { data: [], error: null } },
    { url: '**/api/portal/referrals', json: { data: null, error: null } },
    { url: '**/api/portal/payment-submissions**', json: { data: { submissions: [] }, error: null } },
    { url: '**/api/portal/set-installment-plan', json: { data: { created: true }, error: null } },
  ],

  steps: [
    {
      id: 'courses',
      does: 'Opens the Live Courses section of the student portal, showing a course whose full fee is still outstanding.',
      narrate:
        'Open Live Courses in your portal. Here is a course with the whole fee still to pay.',
      async run(ui) {
        await ui.click('button:has-text("Live Courses")');
        await ui.clearHighlight();
        await ui.pause(900);
      },
    },
    {
      id: 'find-it',
      does: 'Highlights the link beneath the Pay Now button reading "Prefer to split this into two payments? Set up a payment plan".',
      narrate:
        'Under the Pay Now button there is a link most people miss. It offers to split the fee.',
      async run(ui) {
        await ui.highlight('button:has-text("Prefer to split this into two payments")');
        await ui.pause(1300);
        await ui.clearHighlight();
      },
    },
    {
      id: 'terms',
      does: 'Clicks the link. The terms appear: half now, half closer to the start date, available once and only before any payment is made.',
      narrate:
        'The terms are half now and half nearer the start date. It is offered once, before you pay anything.',
      async run(ui) {
        await ui.click('button:has-text("Prefer to split this into two payments")');
        await ui.clearHighlight();
        await ui.page.waitForSelector('.plan-confirm', { timeout: 15_000 });
        await ui.pause(1400);
      },
    },
    {
      id: 'confirm',
      does: 'Clicks Confirm payment plan. The course card now shows two instalments, each with its amount and its due date.',
      narrate:
        'Confirm, and the card shows both instalments with the amount and the date each one is due.',
      async run(ui) {
        await ui.click('button:has-text("Confirm payment plan")');
        await ui.clearHighlight();
        await ui.page.waitForSelector('.plan-box', { timeout: 20_000 });
        await ui.pause(1500);
      },
    },
    {
      id: 'pay-first',
      does: 'Highlights the Pay Now button, which is now used to pay the first instalment rather than the whole fee.',
      narrate:
        'Pay the first instalment the usual way. The second is due before the course begins.',
      async run(ui) {
        await ui.highlight('.pay-block');
        await ui.pause(1200);
        await ui.clearHighlight();
      },
    },
  ],
};

export default installmentsFlow;
