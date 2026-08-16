// How to pay: card, Mobile Money, bank transfer, and submitting proof.
//
// WHY THIS IS THE THIRD VIDEO: it is the only journey in the product that
// touches money, and it has four routes through it — Paystack card, Paystack
// MoMo, and paying out-of-band by bank transfer or MoMo and then telling the
// system about it. The last of those is a form nobody can discover on their
// own, and it is the one that generates "I've paid, why does it still say
// unpaid?" messages to staff.
//
// TWO SAFETY DECISIONS, both deliberate:
//
// 1. The Paystack checkout is opened for real, but ONLY because the recorder
//    refuses to load js.paystack.co unless NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is
//    a pk_test_ key (see record.mjs). With a live key the request is aborted
//    and this step records nothing rather than opening a real checkout. The
//    guard is on the environment, not on this file, so it cannot be defeated
//    by editing the flow.
//
// 2. Every response is mocked, so no payment submission row is created and no
//    real participant's balance appears on screen. Same reasoning as the
//    portal walkthrough.
//
// WHY PAYSTACK COMES LAST: the submissions mock is a sequence (empty, then
// pending), so any reload or revisit mid-flow would consume an entry early and
// show "awaiting confirmation" before the submission happens. Opening the
// checkout at the end needs no reload — and it lands as the closing call to
// action rather than a detour.

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
  // Unpaid at the early-bird price, so the video shows a real outstanding
  // balance and every payment surface renders.
  paymentStatus: 'Unpaid',
  courseFee: 680,
  originalFee: 800,
  amountPaid: 0,
  balance: 680,
  attendance: [],
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

const NO_SUBMISSIONS = { data: { submissions: [] }, error: null };
const PENDING_SUBMISSION = {
  data: {
    submissions: [
      { id: 'sub-1', status: 'pending', reviewNote: null, createdAt: '2026-08-16T10:00:00Z' },
    ],
  },
  error: null,
};

const payingFlow = {
  id: 'paying',
  title: 'Paying for Your Course',
  subtitle: 'Knowsia · Payments',
  path: '/portal',

  ready: { selector: 'button:has-text("My Courses")' },

  mocks: [
    { url: '**/api/portal/me', json: { data: DEMO_DASHBOARD, error: null } },
    { url: '**/api/portal/next-class', json: { data: { nextClass: null }, error: null } },
    { url: '**/api/portal/other-courses', json: { data: [], error: null } },
    { url: '**/api/portal/referrals', json: { data: null, error: null } },
    // Empty until the submission is made, then pending — which is how the
    // video can end on the confirmation state without writing anything.
    {
      url: '**/api/portal/payment-submissions**',
      method: 'GET',
      sequence: [NO_SUBMISSIONS, PENDING_SUBMISSION],
    },
    // Declared AFTER the GET so Playwright checks it first; anything that is
    // not a POST falls through to the list above.
    {
      url: '**/api/portal/payment-submissions**',
      method: 'POST',
      json: { data: { id: 'sub-1' }, error: null },
    },
  ],

  steps: [
    {
      id: 'intro',
      does: 'Opens the My Courses section of the student portal, showing a course with an outstanding balance.',
      narrate:
        'Everything about paying lives in your student portal, under My Courses. Here is a course still to be paid for.',
      async run(ui) {
        await ui.click('button:has-text("My Courses")');
        await ui.clearHighlight();
        await ui.pause(900);
      },
    },
    {
      id: 'balance',
      does: 'Highlights the course fee, amount paid and balance shown on the course card.',
      narrate:
        'The card shows the fee, what you have paid so far, and what is still outstanding.',
      async run(ui) {
        await ui.highlight('.course-card');
        await ui.pause(1200);
        await ui.clearHighlight();
      },
    },
    {
      id: 'manual',
      does: 'Clicks "I have already paid via MoMo or bank transfer", which opens a short form for telling Knowsia about a payment made outside the system.',
      narrate:
        'If you already paid by Mobile Money or bank transfer, tell us here so we can match it to your registration.',
      async run(ui) {
        await ui.click('button:has-text("already paid via MoMo")');
        await ui.clearHighlight();
        await ui.pause(700);
      },
    },
    {
      id: 'method',
      does: 'Selects the payment method from a dropdown offering MTN Mobile Money and Bank Transfer.',
      narrate: 'Choose how you paid — Mobile Money, or a bank transfer.',
      async run(ui) {
        await ui.selectByIndex(`#proofMethod-${REGISTRATION_ID}`, 0);
        await ui.clearHighlight();
      },
    },
    {
      id: 'amount',
      does: 'Types the amount paid in cedis, and the transaction reference from the Mobile Money or bank confirmation message.',
      narrate:
        'Enter the amount, and the transaction reference from your Mobile Money or bank message.',
      async run(ui) {
        await ui.type(`#proofAmount-${REGISTRATION_ID}`, '680');
        await ui.type(`#proofRef-${REGISTRATION_ID}`, 'MP260816.1423.A47281');
        await ui.clearHighlight();
      },
    },
    {
      id: 'date',
      does: 'Fills in the date the payment was made, and points out the optional payment slip upload beneath it.',
      narrate:
        'Add the date you paid. Attaching a screenshot or slip is optional, but it speeds up confirmation.',
      async run(ui) {
        await ui.moveTo(`#proofDate-${REGISTRATION_ID}`);
        await ui.highlight(`#proofDate-${REGISTRATION_ID}`);
        await ui.page.locator(`#proofDate-${REGISTRATION_ID}`).fill('2026-08-16');
        await ui.pause(400);
        await ui.clearHighlight();
        await ui.highlight(`#proofSlip-${REGISTRATION_ID}`);
        await ui.pause(900);
        await ui.clearHighlight();
      },
    },
    {
      id: 'submit',
      does: 'Clicks "Submit for confirmation". The form is replaced by a note saying the payment was submitted and is awaiting confirmation.',
      narrate:
        'Submit it, and our team confirms it against the account. You will see it marked as awaiting confirmation.',
      async run(ui) {
        await ui.click('button:has-text("Submit for confirmation")');
        await ui.clearHighlight();
        await ui.page.waitForSelector('.confirming-note', { timeout: 20_000 });
        await ui.pause(1400);
      },
    },
    {
      id: 'paystack',
      does: 'Clicks the Pay now button, which opens the secure Paystack checkout window showing the amount and offering card or MTN Mobile Money.',
      narrate:
        'Not paid yet? Pay Now opens a secure window for card or Mobile Money, and your balance clears straight away.',
      async run(ui) {
        // Two stages. The portal's own button reads "Pay GHS 680.00 now — Card
        // or Mobile Money" and only REVEALS the checkout component; that
        // component then renders its own "Pay now — Card or Mobile Money"
        // button, which is the one that opens Paystack. Matching on the stable
        // half of the first label keeps this working when the balance changes.
        await ui.click('button:has-text("Card or Mobile Money")');
        await ui.pause(700);
        await ui.click('button:has-text("Pay now")');

        // Wait for the iframe to attach — measured at ~330ms and reliable —
        // then hold a FIXED pause for its contents to paint.
        //
        // A fixed pause is the right tool here, having tried the alternatives:
        // waiting on the iframe alone captured a spinner, and waiting on text
        // Paystack renders (`getByText('Mobile Money')`) never resolved, most
        // likely because the checkout nests frames inside the popup. Chasing a
        // readiness signal inside a third-party surface couples this recording
        // to markup that can change without notice, for no real gain: nothing
        // is being asserted here, we are only filming. Six seconds is generous
        // for a modal that paints in about two.
        await ui.page
          .waitForSelector('iframe[src*="checkout.paystack.com"]', { timeout: 15_000 })
          .catch(() => {});
        await ui.clearHighlight();
        await ui.pause(6000);
      },
    },
  ],
};

export default payingFlow;
