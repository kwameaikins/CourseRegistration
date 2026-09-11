// Submitting an assignment, and reading the mark when it comes back.
//
// WHY THIS IS WORTH A VIDEO: the Assignments tab is one of four tabs on a
// course card, and a student who never opens it never learns that work was
// set. It is also the only place in the participant portal where a file goes
// UP rather than down, and the only place a tutor's written feedback lands.
//
// The video shows the mark before the upload, not after. A tutorial that ends
// on "submitted" leaves the viewer at the least interesting moment; showing
// the marked assignment first tells them what they are working towards, and
// the resubmission warning then means something.
//
// The file input is filled through `ui.page` rather than the small `ui` helper
// deliberately. Uploading is the one action the helper has no verb for, and
// widening the helper for a single flow would be the wrong trade — the helper
// stays small so flow files stay readable.

const REGISTRATION_ID = '00000000-0000-4000-8000-000000000001';
const MARKED_ID = '00000000-0000-4000-8000-0000000000f1';
const OPEN_ID = '00000000-0000-4000-8000-0000000000f2';

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
  paymentStatus: 'Paid',
  courseFee: 800,
  originalFee: 800,
  amountPaid: 800,
  balance: 0,
  attendance: [],
  certificates: [],
  resourcesLink: null,
  installments: [],
  feedbackSubmitted: false,
};

const MARKED = {
  id: MARKED_ID,
  batchId: 'batch-1',
  liveSessionId: null,
  title: 'Session 1 — Reconciling a VAT return',
  instructions: 'Reconcile the VAT return to the control account and explain any difference.',
  dueAt: '2026-09-08T21:00:00Z',
  status: 'closed',
  allowResubmission: false,
  createdByTutorId: 'tutor-1',
  createdByStaffId: null,
  createdAt: '2026-09-05T09:00:00Z',
  mySubmission: {
    id: 'sub-marked',
    assignmentId: MARKED_ID,
    registrationId: REGISTRATION_ID,
    fileName: 'vat-reconciliation.pdf',
    fileSizeBytes: 184320,
    contentType: 'application/pdf',
    participantNotes: null,
    submittedAt: '2026-09-07T18:20:00Z',
    status: 'reviewed',
    grade: 72,
    feedback:
      'The reconciliation is right and clearly laid out. Say WHY the timing difference arises, not just that it does — that is where the marks are.',
    reviewedByTutorId: 'tutor-1',
    reviewedByStaffId: null,
    reviewedAt: '2026-09-09T11:00:00Z',
  },
};

function open(submission) {
  return {
    id: OPEN_ID,
    batchId: 'batch-1',
    liveSessionId: null,
    title: 'Session 2 — Capital allowances computation',
    instructions:
      'Compute the capital allowances for the year and show the written-down values carried forward.',
    dueAt: '2026-09-15T21:00:00Z',
    status: 'open',
    allowResubmission: true,
    createdByTutorId: 'tutor-1',
    createdByStaffId: null,
    createdAt: '2026-09-10T09:00:00Z',
    mySubmission: submission,
  };
}

const SUBMITTED = {
  id: 'sub-new',
  assignmentId: OPEN_ID,
  registrationId: REGISTRATION_ID,
  fileName: 'capital-allowances.pdf',
  fileSizeBytes: 96000,
  contentType: 'application/pdf',
  participantNotes: 'I was unsure about the private-use restriction on the vehicle.',
  submittedAt: '2026-09-11T16:00:00Z',
  status: 'submitted',
  grade: null,
  feedback: null,
  reviewedByTutorId: null,
  reviewedByStaffId: null,
  reviewedAt: null,
};

const assignmentsFlow = {
  id: 'assignments',
  title: 'Submitting an Assignment',
  subtitle: 'Knowsia · Student Portal',
  path: '/portal',

  ready: { selector: 'button:has-text("Live Courses")' },

  mocks: [
    {
      url: '**/api/portal/me',
      json: {
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
          registrations: [DEMO_REGISTRATION],
        },
        error: null,
      },
    },
    { url: '**/api/portal/next-class', json: { data: { nextClass: null }, error: null } },
    { url: '**/api/portal/other-courses', json: { data: [], error: null } },
    { url: '**/api/portal/referrals', json: { data: null, error: null } },
    // The list is re-fetched after the upload, so the second response carries
    // the new submission. Nothing is stored and no file leaves the machine.
    {
      url: `**/api/portal/assignments/${REGISTRATION_ID}`,
      sequence: [
        { data: [MARKED, open(null)], error: null },
        { data: [MARKED, open(SUBMITTED)], error: null },
      ],
    },
    // Declared after the list so Playwright checks it first: the two share a
    // prefix and are separated by method.
    { url: '**/api/portal/assignments', method: 'POST', json: { data: SUBMITTED, error: null } },
  ],

  steps: [
    {
      id: 'tab',
      does: 'Opens the Live Courses section and then the Assignments tab on the course card, which lists the work the tutor has set.',
      narrate:
        'Work set by your tutor lives under the Assignments tab on your course card.',
      async run(ui) {
        await ui.click('button:has-text("Live Courses")');
        await ui.clearHighlight();
        await ui.pause(500);
        await ui.click('button:has-text("Assignments")');
        await ui.clearHighlight();
        await ui.page.getByText('Capital allowances computation', { exact: false }).waitFor({ timeout: 20_000 });
        await ui.pause(900);
      },
    },
    {
      id: 'marked',
      does: 'Shows an assignment already marked, with the grade out of one hundred and the tutor’s written feedback beneath it.',
      narrate:
        'A marked assignment shows your grade and, more usefully, what your tutor wrote about it.',
      async run(ui) {
        await ui.pause(1600);
      },
    },
    {
      id: 'open-form',
      does: 'Clicks "Submit your work" on the assignment that is still open, which opens a file field and a box for notes to the tutor.',
      narrate:
        'For one still open, Submit your work opens a file field and a note to your tutor.',
      async run(ui) {
        await ui.click('button:has-text("Submit your work")');
        await ui.clearHighlight();
        await ui.pause(800);
      },
    },
    {
      id: 'choose',
      does: 'Attaches a PDF of the working, then types a note saying which part of the computation the student was unsure about.',
      narrate:
        'Attach your work, and say where you struggled. Your tutor reads the note before marking.',
      async run(ui) {
        await ui.highlight(`#assignmentFile-${OPEN_ID}`);
        // The only action the ui helper has no verb for. Kept here rather than
        // widening the helper for one flow.
        await ui.page.setInputFiles(`#assignmentFile-${OPEN_ID}`, {
          name: 'capital-allowances.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4\n% demo working\n'),
        });
        await ui.clearHighlight();
        await ui.type(
          `#assignmentNotes-${OPEN_ID}`,
          'I was unsure about the private-use restriction on the vehicle.',
        );
        await ui.clearHighlight();
        await ui.pause(500);
      },
    },
    {
      id: 'submit',
      does: 'Clicks Submit. The assignment now shows the file name, the time it was submitted, and that it is awaiting marking.',
      narrate:
        'Submit, and it shows the file and the time. It then waits for your tutor to mark it.',
      async run(ui) {
        await ui.click(`button:has-text("Submit")`);
        await ui.clearHighlight();
        await ui.page.getByText('Awaiting marking', { exact: false }).waitFor({ timeout: 20_000 });
        await ui.pause(1500);
      },
    },
  ],
};

export default assignmentsFlow;
