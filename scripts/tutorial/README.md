# Feature tutorial pipeline

Generates a narrated screen-recording tutorial from a flow definition. The
video shows the **real application** — Playwright drives the actual UI against a
running instance, so nothing on screen is synthetic.

```bash
npm run dev                       # in one terminal
npm run tutorial -- --flow register
```

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
  `ANTHROPIC_API_KEY` or when `--no-ai` is passed, so the pipeline never
  depends on the model being available.

The `ui` helper is deliberately small — `moveTo`, `click`, `type`,
`selectByIndex`, `check`, `highlight`, `clearHighlight`, `pause`, and raw
`ui.page` as an escape hatch. Prefer `selectByIndex` over hard-coded option
values: courses, genders and lead sources are all live data.

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

## Requirements

- Node 22+
- `npx playwright install chromium` (one-off; the npm package alone has no browser)

`ffmpeg` and `ffprobe` come from the `ffmpeg-static` / `ffprobe-static` dev
dependencies, so there is nothing to install system-wide and CI needs no
`apt-get` step. A system build still wins if you point `FFMPEG_PATH` /
`FFPROBE_PATH` at one.
