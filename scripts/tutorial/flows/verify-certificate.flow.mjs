// Checking that a Knowsia certificate is genuine.
//
// WHY THIS ONE MATTERS MOST COMMERCIALLY: the audience is not the student. It
// is the employer, the recruiter or the professional body holding a printed
// certificate and wondering whether to believe it. Every certificate carries a
// QR code pointing at this page, so the video is the answer to "what happens
// when someone scans it" — and a credential nobody can check is not a
// credential.
//
// ── THE ONE FLOW THAT CANNOT BE MOCKED ───────────────────────────────────────
//
// `/verify/<number>` is a SERVER component. It reads the database directly
// through certificatesService.verifyCertificate and makes no API call, so
// there is no request for Playwright to intercept. Fulfilling the navigation
// with hand-written HTML would put a page on screen that the application never
// rendered, which is the exact failure this whole pipeline exists to avoid.
//
// So this flow reads real data, and that carries a rule:
//
//   TUTORIAL_CERT_NUMBER must name a certificate issued to a DEMO recipient,
//   never a real participant's. The result page prints the recipient's name in
//   large type, and a marketing video is not the place to publish somebody's
//   name and qualification without them asking for it.
//
// The default below is the placeholder the app itself shows in the field. It
// will almost certainly resolve to "not found", and that is a deliberate safe
// default: the recording still completes and still teaches the check, and
// nobody's name reaches a video by accident because a flow was run without
// thinking about it.
//
// The step text is written to be true of all three outcomes — authentic,
// revoked, and not found — so the narration stays honest whichever the
// database returns.

const CERT_NUMBER = process.env.TUTORIAL_CERT_NUMBER || 'KNS-AI01-2026-0067';

const verifyCertificateFlow = {
  id: 'verify-certificate',
  title: 'Checking a Certificate Is Genuine',
  subtitle: 'Knowsia · Credentials',
  path: '/verify',

  // The result page is server-rendered on every request, so it is worth
  // compiling before the recording starts rather than filming the compile.
  prewarm: [`/verify/${CERT_NUMBER}`],

  ready: { selector: '#certificateNumber' },

  // Nothing to intercept — see the note above. Left explicit rather than
  // omitted so the absence reads as a decision.
  mocks: [],

  steps: [
    {
      id: 'page',
      does: 'Shows the certificate verification page, with a single field asking for the certificate number.',
      narrate:
        'Every Knowsia certificate can be checked here by anyone. No account, no login.',
      async run(ui) {
        await ui.pause(700);
      },
    },
    {
      id: 'where',
      does: 'Highlights the field and its example number, which matches the format printed on the certificate itself.',
      narrate:
        'The number is printed on the certificate, and the QR code on it opens this page directly.',
      async run(ui) {
        await ui.highlight('#certificateNumber');
        await ui.pause(1200);
        await ui.clearHighlight();
      },
    },
    {
      id: 'type',
      does: 'Types the certificate number into the field. Spacing and capitalisation are corrected automatically before the check runs.',
      narrate:
        'Type the number as it appears. Spacing and capitals are tidied up for you.',
      async run(ui) {
        await ui.type('#certificateNumber', CERT_NUMBER);
        await ui.clearHighlight();
        await ui.pause(400);
      },
    },
    {
      id: 'verify',
      does: 'Clicks Verify certificate. The result page reports one of three outcomes: that the certificate is authentic and names the holder and the course, that it has been revoked, or that no certificate with that number exists.',
      narrate:
        'Press verify. You are told the certificate is authentic, or revoked, or that no such number exists.',
      async run(ui) {
        await ui.click('button[type="submit"]');
        await ui.clearHighlight();
        await ui.page.waitForURL('**/verify/**');
        await ui.pause(1600);
      },
    },
    {
      id: 'result',
      does: 'Holds on the result so the outcome and the certificate number can be read.',
      narrate:
        'An authentic certificate names the holder and the course they completed. Nothing else is shown.',
      async run(ui) {
        await ui.pause(1500);
      },
    },
  ],
};

export default verifyCertificateFlow;
