# Feature tutorial pipeline

Generates a narrated screen-recording tutorial from a flow definition. The
video shows the **real application** — Playwright drives the actual UI against a
running instance, so nothing on screen is synthetic.

```bash
npm run dev                       # in one terminal
npm run tutorial -- --flow register
npm run tutorial -- register      # same thing, and the one that works in PowerShell
```

**PowerShell swallows the flags.** Run the first form from a PowerShell prompt
and the script receives exactly `["register"]` — the separator and `--flow` are
both eaten, and so is `--no-ai`. A bare flow id is therefore accepted as well,
because without it the documented command silently rebuilds the DEFAULT flow and
reports success: an ElevenLabs render spent on a finished video of the wrong
walkthrough. To force the drafts where the flag will not survive, use
`TUTORIAL_TTS` and the narration cache, or run `node scripts/tutorial/build.mjs`
directly from a shell that passes arguments through.

Output lands in `scripts/tutorial/out/<flow>/`:

| File            | What it is                                        |
| --------------- | ------------------------------------------------- |
| `<flow>.mp4`    | Title card, walkthrough with voice-over, outro card |
| `<flow>.srt`    | Caption track (exact timings, not transcribed)     |
| `narration.json`| Cached narration; delete or `--refresh` to redo    |
| `manifest.json` | Per-step timings, for debugging sync               |

## Why it is built this way

**Generative video cannot do this job.** Text-to-video models (Veo, Sora, and
the tools built on them) invent a plausible-looking application rather than
showing yours — wrong button labels, garbled text, steps in the wrong order. For
a tutorial that is worse than nothing, because it teaches users a flow that does
not exist. So the picture comes from a real browser, and the AI is confined to
the one job it is reliable at: writing the words.

**Narration is generated before recording, not after.** Each line is
synthesised first and its duration measured; the recorder then holds each step
on screen for exactly that long. Picture and voice are locked by construction —
nothing is stretched, and the caption timings are exact rather than guessed.

**The recording never mutates production data.** A flow declares `mocks` for
any state-changing request. The registration flow intercepts `POST
/api/registrations`, so no row is written, no email is sent, and Paystack is
never called — but every screen up to and including the confirmation is the
real component rendering real markup.

## Title and outro cards

Both are rendered as HTML in the same browser the pipeline already drives, then
screenshotted — so restyling them is CSS in `CARD_CSS`
([lib/record.mjs](lib/record.mjs)), not image editing.

The outro's URL and contact details are read from the same environment
variables the application uses, with the same defaults
(`NEXT_PUBLIC_APP_URL`, `RESEND_FROM_EMAIL`, plus `TUTORIAL_CONTACT_WHATSAPP`
and `TUTORIAL_CONTACT_PHONE`). Deliberately not hard-coded a second time: a
video quoting a number the website no longer uses is worse than no video.

Transitions are per-segment fades to black, **not** `xfade`. xfade overlaps its
inputs and so shortens the timeline by each fade's duration, which would shift
every narration clip and caption out of step — the one property this pipeline
exists to guarantee. Fading each segment in and out leaves all three durations
exactly as measured.

## Adding a flow

Create `flows/<id>.flow.mjs`:

```js
export default {
  id: 'verify-certificate',
  title: 'Verifying a Certificate',
  subtitle: 'Knowsia · Credentials',
  path: '/verify',
  mocks: [],
  steps: [
    {
      id: 'search',
      does: 'Types a certificate number into the search field and presses Verify.',
      narrate: 'Enter the certificate number printed on the document, then press Verify.',
      async run(ui) {
        await ui.type('#certNumber', 'KN-2026-0042');
        await ui.click('button[type="submit"]');
      },
    },
  ],
};
```

`does` and `narrate` are both required, and the distinction matters:

- **`does`** describes what the step's `run` actually performs. It is the only
  thing the narration model is allowed to describe. This is what stops
  generated narration from mentioning UI that is not there.
- **`narrate`** is the human-written line. It is used verbatim when there is no
  `ANTHROPIC_API_KEY`, when `--no-ai` is passed, **and when the model fails** —
  a narration failure is caught and falls back rather than killing the build,
  because an exhausted Anthropic balance once ended a run outright. That is the
  wrong outcome for a step that only rewrites wording somebody already wrote.

The `ui` helper is deliberately small — `moveTo`, `click`, `type`,
`selectByIndex`, `check`, `highlight`, `clearHighlight`, `pause`, and raw
`ui.page` as an escape hatch. Prefer `selectByIndex` over hard-coded option
values: courses, genders and lead sources are all live data.

## Flows that touch a third party

`certificate-linkedin` clicks **Add to LinkedIn**, which calls `window.open`.
That step stubs `window.open` for the duration of the click, so the recording
cannot wander onto `linkedin.com` — a page this pipeline does not control, which
in a fresh browser shows a sign-in wall rather than the pre-filled form, and
which would add an unpredictable extra page to the stitched output.

The button, the click and the URL it builds are all real. Only the navigation is
withheld, and the captured URL is asserted (`name`, `issueYear`, `certUrl`,
`certId`) so a broken link fails the run rather than quietly recording a button
that does nothing. Use the same shape for any future step that leaves the app.

## Voice quality

The voice provider is the one swappable part, because it is the one part with a
real quality ceiling:

| Provider     | Setup                  | Quality                                  |
| ------------ | ---------------------- | ---------------------------------------- |
| `windows`    | none — offline SAPI    | Audibly synthetic. Proves the pipeline.  |
| `elevenlabs` | `ELEVENLABS_API_KEY`   | Production quality.                      |

Selection is automatic (ElevenLabs if the key is present, otherwise Windows
SAPI). Force it with `TUTORIAL_TTS=elevenlabs`. Optionally set
`ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID`.

**The Windows voice is a stand-in, not the deliverable.** Judge the timing,
framing, cursor work and captions from it; judge the voice only after adding an
ElevenLabs key and re-running. Nothing else in the pipeline changes.

## The other thing you get

These flow files are Playwright end-to-end tests. The project has unit tests
only (`tests/unit`), so a walkthrough of registration is also the first real
regression check on the highest-traffic path in the app. The maintenance cost of
keeping flows working is the same cost as keeping e2e tests working — which is
the honest argument for starting with three or four core flows rather than
"every new feature".

## The flows

| Flow                   | What it teaches                                                |
| ---------------------- | -------------------------------------------------------------- |
| `register`             | Filling in the public registration form                         |
| `paying`               | Card, Mobile Money, and telling us about a transfer you made     |
| `portal-login`         | Signing in and finding your way round the portal                 |
| `coupon`               | Coupons and referral codes, including best-price-wins            |
| `materials`            | Finding the materials for your course                            |
| `certificate-linkedin` | Putting your certificate on LinkedIn                             |
| `installments`         | Splitting the fee in two — offered once, before you pay anything |
| `assignments`          | Submitting work, and reading the mark when it comes back         |
| `company-seats`        | A company filling the seats it bought, by pasting a spreadsheet  |
| `verify-certificate`   | Checking a certificate is genuine — for employers, not students  |

The last four were added 2026-09-11. They were chosen because they are the
journeys nobody completes unaided: a payment plan hidden behind a text link, an
Assignments tab most students never open, a corporate buyer expected to discover
a paste box in a portal they were never shown, and a verification page whose
audience is not the student at all.

**`verify-certificate` is the one flow that cannot be mocked.** The result page
is a server component reading the database directly, so there is no request to
intercept, and fulfilling the navigation with hand-written HTML would put a page
on screen the application never rendered. It therefore reads real data, and
`TUTORIAL_CERT_NUMBER` must name a certificate issued to a DEMO recipient — the
page prints the holder's name in large type, and a marketing video is not the
place to publish somebody's qualification without them asking. The default is
the app's own placeholder, which resolves to "not found" and is a deliberately
safe fallback.

## Keeping them current

A rendered video is a snapshot; the flow file is the thing that is maintained.
When the UI moves, re-run the flow rather than re-shooting it — and re-run every
flow, not just the one you were thinking about. On 2026-09-11 the portal's nav
label had been renamed from "My Courses" to "Live Courses" and **two flows had
been silently broken ever since**: they could not record at all, and their
published videos still showed a label that no longer existed.

## Requirements

- Node 22+
- `npx playwright install chromium` (one-off; the npm package alone has no browser)

`ffmpeg` and `ffprobe` come from the `ffmpeg-static` / `ffprobe-static` dev
dependencies, so there is nothing to install system-wide and CI needs no
`apt-get` step. A system build still wins if you point `FFMPEG_PATH` /
`FFPROBE_PATH` at one.
