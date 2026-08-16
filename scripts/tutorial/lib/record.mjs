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

  for (const mock of flow.mocks ?? []) {
    await context.route(mock.url, (route) =>
      route.fulfill({
        status: mock.status ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(mock.json),
      }),
    );
  }

  await installOverlay(context);

  const page = await context.newPage();
  const startedAt = Date.now();

  await page.goto(new URL(flow.path, baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
  });
  // The Next dev server holds an HMR socket open, so networkidle never
  // settles. Wait on the thing the flow actually needs instead: a Course
  // dropdown with at least one real batch in it. `attached` rather than the
  // default `visible` — an <option> inside a closed <select> never counts as
  // visible, so the default state would always time out here.
  await page.waitForSelector('#batchId option:nth-child(2)', {
    state: 'attached',
    timeout: 30_000,
  });
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

export async function renderTitleCard({ flow, outPath }) {
  const logo = readFileSync(path.join(ROOT, 'public', 'knowsia-logo.png')).toString('base64');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await page.setContent(`
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px; height: 720px; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 28px;
        background: radial-gradient(circle at 30% 20%, #0f5d4a 0%, #08302a 55%, #04201c 100%);
        font-family: Georgia, 'Times New Roman', serif; color: #f4f1ea;
        text-align: center;
      }
      img { width: 240px; margin-bottom: 12px; }
      h1 { font-size: 62px; font-weight: 600; letter-spacing: -0.5px; }
      p { font-family: system-ui, sans-serif; font-size: 22px; color: #9fc9ba;
          letter-spacing: 2.5px; text-transform: uppercase; }
      .rule { width: 90px; height: 3px; background: #2f9e7e; border-radius: 2px; }
    </style>
    <img src="data:image/png;base64,${logo}" alt="">
    <h1>${flow.title}</h1>
    <div class="rule"></div>
    <p>${flow.subtitle}</p>
  `);
  await page.waitForTimeout(300);
  await page.screenshot({ path: outPath });
  await browser.close();
  return outPath;
}
