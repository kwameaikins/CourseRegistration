// How to use a coupon or referral code on the registration form.
//
// WHY THIS ONE: codes are where the least obvious pricing rule lives. A code
// discount NEVER stacks with the early-bird price — the form shows whichever
// is genuinely cheaper (see codeBeatsEarlyBird in RegistrationForm.tsx, which
// mirrors the server rule). People assume the two add up, and a video is a
// cheaper way to correct that than an email each time.
//
// The invalid code is shown FIRST on purpose. "I typed my code and nothing
// happened" is the actual support question, and the answer is that a wrong or
// expired code says so in red rather than failing silently.
//
// Only the code-preview endpoint is mocked, using a sequence so one settled
// value reads as invalid and the next as valid. That keeps the video
// independent of whatever real coupons happen to exist this week, and means it
// still records correctly after a promotion ends. Nothing is submitted, so no
// registration is created.

const INVALID_CODE = {
  data: {
    valid: false,
    discountType: null,
    discountValue: null,
    partnerId: null,
    reason: 'This code is not valid or has expired.',
  },
  error: null,
};

// 25% rather than a token amount so the discounted figure reliably lands below
// any early-bird price the live batch happens to carry — otherwise the form
// correctly shows the early-bird line instead and the video demonstrates
// nothing.
const VALID_CODE = {
  data: {
    valid: true,
    discountType: 'percentage',
    discountValue: 25,
    partnerId: null,
  },
  error: null,
};

const couponFlow = {
  id: 'coupon',
  title: 'Using a Coupon or Referral Code',
  subtitle: 'Knowsia · Course Registration',
  path: '/register',

  ready: { selector: '#batchId option:nth-child(2)', state: 'attached' },

  mocks: [
    {
      url: '**/api/register/preview-code',
      sequence: [INVALID_CODE, VALID_CODE],
    },
  ],

  steps: [
    {
      id: 'intro',
      does: 'Shows the registration form, and explains that a coupon or referral code is entered on this page while registering.',
      narrate:
        'Got a coupon or referral code? You enter it here on the registration form, as you sign up.',
      async run(ui) {
        await ui.pause(400);
      },
    },
    {
      id: 'course',
      does: 'Selects a course from the dropdown so that a fee appears. A code cannot be checked until a course is chosen, because a code can be restricted to particular courses.',
      narrate:
        'Choose your course first. A code can be tied to a specific programme, so we cannot check it until we know which one.',
      async run(ui) {
        await ui.selectByIndex('#batchId', 1);
        await ui.clearHighlight();
        await ui.pause(700);
      },
    },
    {
      id: 'field',
      does: 'Highlights the optional Coupon / Referral Code field near the bottom of the form.',
      narrate:
        'The code field sits here. If you arrived through a referral link, it is already filled in for you.',
      async run(ui) {
        await ui.moveTo('#couponCode');
        await ui.highlight('#couponCode');
        await ui.pause(900);
        await ui.clearHighlight();
      },
    },
    {
      id: 'invalid',
      does: 'Types a code that is not recognised. After a moment the form shows a message in red saying the code is not valid or has expired.',
      narrate:
        'If a code is wrong or expired, the form tells you straight away in red. Nothing fails silently.',
      async run(ui) {
        await ui.type('#couponCode', 'OLDCODE24');
        // The preview is debounced by 500ms, so give the request time to land
        // and the message time to render before moving on.
        await ui.page.waitForSelector('p.text-destructive', { timeout: 15_000 }).catch(() => {});
        await ui.pause(1200);
        await ui.clearHighlight();
      },
    },
    {
      id: 'valid',
      does: 'Clears the field and types a valid code. The form confirms in green that the code has been applied.',
      narrate:
        'Type the correct code and it confirms in green that the discount has been applied.',
      async run(ui) {
        await ui.page.locator('#couponCode').fill('');
        await ui.pause(300);
        await ui.type('#couponCode', 'KNOWSIA25');
        await ui.page
          .waitForSelector('p:has-text("Code applied")', { timeout: 15_000 })
          .catch(() => {});
        await ui.pause(900);
        await ui.clearHighlight();
      },
    },
    {
      id: 'price',
      does: 'Shows the fee line beneath the course dropdown, where the original price is struck through and the reduced price shown beside it.',
      narrate:
        'Scroll up and the price has changed — the old figure struck through, the new one beside it.',
      async run(ui) {
        // The exact line depends on whether the code beat an early-bird price,
        // which is live data. Highlight whichever rendered rather than
        // assuming, so the step can never fail on a pricing detail.
        const withCode = 'p:has-text("with your code applied")';
        const target = (await ui.page.locator(withCode).count()) > 0 ? withCode : '#batchId';
        await ui.moveTo(target);
        await ui.highlight(target);
        await ui.pause(1400);
        await ui.clearHighlight();
      },
    },
    {
      id: 'bestprice',
      does: 'Rests on the fee line while explaining that a code and an early-bird price are never added together; whichever is cheaper is the one charged.',
      narrate:
        'One thing to know: a code and an early-bird price never stack. You simply pay whichever is cheaper.',
      async run(ui) {
        await ui.pause(1000);
      },
    },
  ],
};

export default couponFlow;
