import { readFileSync } from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

import { ROOT } from './env.mjs';
import { installOverlay, makeUi } from './overlay.mjs';

const VIEWPORT = { width: 1280, height: 720 };

// Playwright starts the video when the page is created, not when we start
// stepping. A deliberate lead-in gives the first frames somewhere to go and
// keeps narration from starting over a half-painted page.
const LEAD_IN_MS = 1400;

export async function record({ flow, baseUrl, holdMs, outDir }) {
  const browser = await chromium.launch();
  try {
    return await recordWith(browser, { flow, baseUrl, holdMs, outDir });
  } finally {
    // Without this, a step that throws leaves Chromium running and holding a
    // Windows lock on the part-written .webm, which then breaks the *next*
    // run's cleanup rather than the run that actually failed.
    await browser.close().catch(() => {});
  }
}

async function recordWith(browser, { flow, baseUrl, holdMs, outDir }) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: outDir, size: VIEWPORT },
  });

  // Paystack is allowed to load ONLY when the configured public key is a test
  // key. Registered first so a flow could in principle override it.
  //
  // This is keyed on the environment rather than hard-coded so it cannot rot:
  // add a pk_test_ key and recording the checkout starts working, swap back to
  // pk_live_ and it stops, with no code change and nothing for anyone to
  // remember. A recording must never be able to open a real checkout against
  // the production key, whatever a flow's steps happen to click.
  const paystackKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? '';
  if (!paystackKey.startsWith('pk_test_')) {
    await context.route('https://js.paystack.co/**', (route) => route.abort());
    console.log(
      `  (Paystack blocked — key is ${paystackKey.slice(0, 8) || 'unset'}, not pk_test_)`,
    );
  }

  // Mocks are registered in declaration order, and Playwright checks the LAST
  // registered first. A method-specific mock must therefore come AFTER the
  // general one for the same URL — see the payment flow, where the submissions
  // list and the submission itself share a path.
  //
  // `sequence` returns each response in turn and then repeats the last, which
  // is what lets a flow show a list before an action and a changed list after
  // it without any real writes.
  for (const mock of flow.mocks ?? []) {
    const queue = Array.isArray(mock.sequence) ? [...mock.sequence] : null;
    await context.route(mock.url, async (route, request) => {
      if (mock.method && request.method() !== mock.method) {
        await route.fallback();
        return;
      }
      const body = queue ? (queue.length > 1 ? queue.shift() : queue[0]) : mock.json;
      await route.fulfill({
        status: mock.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  await installOverlay(context);

  // The dev server compiles routes lazily, so the first client-side navigation
  // to another page mid-flow sits on "Loading…" for several seconds — a dead
  // stretch in the finished video with narration playing over an empty screen.
  // Visiting those routes first forces the compile up front.
  //
  // Done on a throwaway page deliberately: Playwright records one video per
  // page, so warming up here leaves the recorded page's own video untouched
  // rather than opening with a few seconds of the wrong screen.
  // The flow's own entry path is always warmed, not just the extra routes a
  // flow declares. Recording starts the moment the page is created, so a cold
  // entry page means the video opens on however many seconds of blank screen
  // the compile takes — 20 of them, when this was first built.
  const warmup = await context.newPage();
  for (const warmPath of [flow.path, ...(flow.prewarm ?? [])]) {
    await warmup
      .goto(new URL(warmPath, baseUrl).toString(), { waitUntil: 'domcontentloaded' })
      .catch(() => {});
    await warmup.waitForTimeout(1500);
  }
  await warmup.close();

  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(new URL(flow.path, baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
  });
  // The Next dev server holds an HMR socket open, so networkidle never
  // settles. Each flow therefore declares its own readiness condition — the
  // recorder cannot know what "loaded" means for an arbitrary page, and
  // without it the opening frames can catch a half-populated form.
  if (flow.ready) {
    await page.waitForSelector(flow.ready.selector, {
      state: flow.ready.state ?? 'visible',
      timeout: 30_000,
    });
  }
  await page.waitForTimeout(LEAD_IN_MS);

  const ui = makeUi(page);
  const timings = [];

  for (const [index, step] of flow.steps.entries()) {
    const startMs = Date.now() - startedAt;
    process.stdout.write(`  · ${step.id}`);
    await step.run(ui);

    // Hold the frame until the step's narration has finished playing. Doing it
    // here — rather than stretching audio afterwards — is what keeps picture
    // and voice locked without any resampling.
    const elapsed = Date.now() - startedAt - startMs;
    const remaining = (holdMs[index] ?? 0) - elapsed;
    if (remaining > 0) await page.waitForTimeout(remaining);

    const endMs = Date.now() - startedAt;
    timings.push({ id: step.id, startMs, endMs });
    console.log(`  (${((endMs - startMs) / 1000).toFixed(1)}s)`);
  }

  await page.waitForTimeout(600);
  const elapsedMs = Date.now() - startedAt;

  // The video file is only flushed and released when the context closes, so
  // the path has to be read after.
  const video = page.video();
  await context.close();

  return { videoPath: await video.path(), timings, elapsedMs };
}

// Contact details are read from the same env vars the app itself uses, with
// the same defaults, so the video and the website cannot quote different
// numbers. Never hard-code a second copy of these.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://reg.knowsia.com';
const CONTACT_WHATSAPP = process.env.TUTORIAL_CONTACT_WHATSAPP ?? '053 053 1328';
const CONTACT_PHONE = process.env.TUTORIAL_CONTACT_PHONE ?? '020 370 1923';
const CONTACT_EMAIL = process.env.RESEND_FROM_EMAIL?.match(/<(.+)>/)?.[1] ?? 'info@knowsia.com';

const CARD_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 720px; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 26px;
    background: radial-gradient(circle at 30% 20%, #0f5d4a 0%, #08302a 55%, #04201c 100%);
    font-family: Georgia, 'Times New Roman', serif; color: #f4f1ea;
    text-align: center;
  }
  .logo { width: 230px; margin-bottom: 10px; }
  h1 { font-size: 58px; font-weight: 600; letter-spacing: -0.5px; }
  .rule { width: 90px; height: 3px; background: #2f9e7e; border-radius: 2px; }
  .kicker {
    font-family: system-ui, sans-serif; font-size: 22px; color: #9fc9ba;
    letter-spacing: 2.5px; text-transform: uppercase;
  }
  .url { font-size: 66px; color: #ffffff; letter-spacing: -1px; }
  .contact {
    font-family: system-ui, sans-serif; font-size: 23px; color: #cfe6dd;
    line-height: 2;
  }
  .contact span { color: #7fb8a5; padding: 0 10px; }
`;

// Titles come from a flow file rather than user input, but escaping costs
// nothing and stops an apostrophe or ampersand from silently breaking a card.
function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
}

// Both cards are rendered in one browser session — launching Chromium twice to
// take two screenshots is most of the cost of making them.
export async function renderCards({ flow, titlePath, outroPath }) {
  const logo = readFileSync(path.join(ROOT, 'public', 'knowsia-logo.png')).toString('base64');
  const logoTag = `<img class="logo" src="data:image/png;base64,${logo}" alt="">`;

  const cards = [
    {
      outPath: titlePath,
      inner: `
        ${logoTag}
        <h1>${escapeHtml(flow.title)}</h1>
        <div class="rule"></div>
        <p class="kicker">${escapeHtml(flow.subtitle)}</p>
      `,
    },
    {
      outPath: outroPath,
      inner: `
        ${logoTag}
        <p class="kicker">Register at</p>
        <h1 class="url">${escapeHtml(APP_URL.replace(/^https?:\/\//, ''))}</h1>
        <div class="rule"></div>
        <p class="contact">
          WhatsApp ${escapeHtml(CONTACT_WHATSAPP)}<span>·</span>Call ${escapeHtml(CONTACT_PHONE)}
          <br>${escapeHtml(CONTACT_EMAIL)}
        </p>
      `,
    },
  ];

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    for (const card of cards) {
      await page.setContent(`<style>${CARD_CSS}</style>${card.inner}`);
      await page.waitForTimeout(250);
      await page.screenshot({ path: card.outPath });
    }
  } finally {
    await browser.close();
  }

  return { titlePath, outroPath };
}
