// Walkthrough definition for the public course-registration flow (F1.01).
//
// Two rules keep this file honest:
//
//  1. `does` is the ground truth handed to the narration model. It describes
//     what the step's `run` actually performs. The model may only rewrite it —
//     it is never allowed to invent UI. This is the whole reason the tutorials
//     can be trusted: the words are derived from the clicks, not from a guess
//     about what the page looks like.
//
//  2. `narrate` is the human-written fallback. If ANTHROPIC_API_KEY is absent
//     (or --no-ai is passed) the build uses these verbatim and still produces
//     a complete video.

const registerFlow = {
  id: 'register',
  title: 'Registering for a Course',
  subtitle: 'Knowsia · Course Registration',
  path: '/register',

  // Don't start recording until the Course dropdown holds at least one real
  // batch, or the opening frames catch an empty form. `attached` rather than
  // the default `visible`: an <option> inside a closed <select> is never
  // "visible" to Playwright, so `visible` would always time out here.
  ready: { selector: '#batchId option:nth-child(2)', state: 'attached' },

  // The recording must never write to the real database, send a real email,
  // or touch Paystack. Intercepting the one POST that mutates state is enough:
  // everything up to it is genuine, read-only page behaviour against real
  // course data, and the confirmation screen is rendered by the real component
  // from a synthetic response.
  mocks: [
    {
      url: '**/api/registrations',
      json: {
        data: {
          outcome: 'registered',
          registrationId: '00000000-0000-4000-8000-000000000000',
          message:
            'Thank you for registering. Payment instructions have been emailed to you.',
          courseFee: 2500,
        },
        error: null,
      },
    },
  ],

  steps: [
    {
      id: 'intro',
      does: 'Shows the Knowsia course registration page as it first loads, before anything is filled in.',
      narrate:
        'Registering for a Knowsia programme takes about two minutes. Here is the form.',
      async run(ui) {
        await ui.pause(400);
      },
    },
    {
      id: 'course',
      does: 'Opens the Course dropdown and picks the first available intake. The course fee then appears directly beneath the dropdown.',
      narrate:
        'Start by choosing your course. Once you pick an intake, the fee appears right below it.',
      async run(ui) {
        await ui.selectByIndex('#batchId', 1);
        await ui.clearHighlight();
        await ui.pause(700);
      },
    },
    {
      id: 'name',
      does: 'Types a first name and a surname into the First Name and Surname fields. The Middle Name field between them is skipped because it is optional.',
      narrate:
        'Next, your name. First name and surname are required — middle name is optional.',
      async run(ui) {
        await ui.type('#firstName', 'Ama');
        await ui.type('#surname', 'Boateng');
        await ui.clearHighlight();
      },
    },
    {
      id: 'contact',
      does: 'Selects a gender from the dropdown, then types an email address and a phone number.',
      narrate:
        'Then your gender, email address and phone number. We use these to send your joining details.',
      async run(ui) {
        await ui.selectByIndex('#gender', 1);
        await ui.type('#email', 'ama.boateng@example.com');
        await ui.type('#phone', '+233201234567');
        await ui.clearHighlight();
      },
    },
    {
      id: 'work',
      does: 'Types a job title and a company name. Both fields accept "N/A" if the person is not currently employed.',
      narrate:
        'Your job title and organisation. If either does not apply, simply enter N slash A.',
      async run(ui) {
        await ui.type('#jobTitle', 'Finance Manager');
        await ui.type('#company', 'Accra Trust Bank');
        await ui.clearHighlight();
      },
    },
    {
      id: 'source',
      does: 'Selects an option from the "How did you hear about us?" dropdown.',
      narrate: 'Let us know how you heard about us.',
      async run(ui) {
        await ui.selectByIndex('#leadSource', 1);
        await ui.clearHighlight();
      },
    },
    {
      id: 'coupon',
      does: 'Highlights the optional Coupon / Referral Code field without typing anything into it.',
      narrate:
        'If you have a coupon or referral code, enter it here — the discount is applied straight away.',
      async run(ui) {
        await ui.moveTo('#couponCode');
        await ui.highlight('#couponCode');
        await ui.pause(600);
        await ui.clearHighlight();
      },
    },
    {
      id: 'consent',
      does: 'Ticks the data-protection consent checkbox. The Complete Registration button, which was greyed out, becomes active.',
      narrate:
        'Tick the data-protection consent box. Notice the Complete Registration button becomes active only now.',
      async run(ui) {
        await ui.check('#consent');
        await ui.clearHighlight();
        await ui.highlight('button[type="submit"]');
        await ui.pause(500);
        await ui.clearHighlight();
      },
    },
    {
      id: 'submit',
      does: 'Clicks Complete Registration. The confirmation screen replaces the form, showing the course fee and the option to pay now or pay later through the student portal.',
      narrate:
        'Submit, and you are registered. From here you can pay now, or log in to your student portal to pay later.',
      async run(ui) {
        await ui.click('button[type="submit"]');
        await ui.page.getByRole('heading', { name: /Registration received|You're registered/i }).waitFor();
        await ui.clearHighlight();
        await ui.pause(900);
      },
    },
  ],
};

export default registerFlow;
