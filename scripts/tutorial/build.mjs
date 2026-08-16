#!/usr/bin/env node
//
// Builds a narrated tutorial video from a flow definition.
//
//   node scripts/tutorial/build.mjs --flow register
//
// Options:
//   --flow <id>        flow file under scripts/tutorial/flows (default: register)
//   --base-url <url>   app to record (default: http://localhost:3000)
//   --note "<text>"    changelog / feature note passed to the narration model
//   --no-ai            skip Claude, use the hand-written draft lines
//   --refresh          ignore cached narration and regenerate
//
// Order matters: narration is synthesised BEFORE recording, so the recorder
// can hold each step on screen for exactly as long as its line takes to read.
// That is what keeps audio and picture in sync without stretching either.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadEnv } from './lib/env.mjs';
import { assemble, buildNarrationTrack, durationMs } from './lib/ffmpeg.mjs';
import { generateNarration } from './lib/narrate.mjs';
import { record, renderTitleCard } from './lib/record.mjs';
import { pickProvider, synth } from './lib/voice.mjs';

const TITLE_SECONDS = 3;
// Breathing room after each line so steps do not run into one another.
const STEP_GAP_MS = 650;

function parseArgs(argv) {
  const args = { flow: 'register', baseUrl: 'http://localhost:3000' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--flow') args.flow = argv[++i];
    else if (arg === '--base-url') args.baseUrl = argv[++i];
    else if (arg === '--note') args.note = argv[++i];
    else if (arg === '--no-ai') args.noAi = true;
    else if (arg === '--refresh') args.refresh = true;
  }
  return args;
}

// Each run gets its own scratch directory. Windows can hold a lock on a
// recording from a crashed run long after the browser is gone, and a build
// must not fail because of a previous build's corpse — so old runs are pruned
// best-effort and never block the current one.
function prepareWorkDir(outDir) {
  const base = path.join(outDir, 'work');
  mkdirSync(base, { recursive: true });
  for (const entry of readdirSync(base)) {
    try {
      rmSync(path.join(base, entry), { recursive: true, force: true });
    } catch {
      // Still locked. Leave it; the next run will get it.
    }
  }
  const dir = path.join(base, String(Date.now()));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function srtTime(ms) {
  const h = String(Math.floor(ms / 3_600_000)).padStart(2, '0');
  const m = String(Math.floor(ms / 60_000) % 60).padStart(2, '0');
  const s = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  const milli = String(Math.floor(ms) % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${milli}`;
}

function writeSrt(entries, outPath) {
  const body = entries
    .map((entry, i) =>
      [i + 1, `${srtTime(entry.startMs)} --> ${srtTime(entry.endMs)}`, entry.text, ''].join('\n'),
    )
    .join('\n');
  writeFileSync(outPath, body, 'utf8');
  return outPath;
}

async function main() {
  loadEnv();
  const args = parseArgs(process.argv.slice(2));

  const flowPath = path.join(import.meta.dirname, 'flows', `${args.flow}.flow.mjs`);
  if (!existsSync(flowPath)) throw new Error(`No such flow: ${flowPath}`);
  const flow = (await import(pathToFileURL(flowPath).href)).default;

  const outDir = path.join(import.meta.dirname, 'out', flow.id);
  mkdirSync(outDir, { recursive: true });
  const workDir = prepareWorkDir(outDir);

  // 1 — narration ----------------------------------------------------------
  const cachePath = path.join(outDir, 'narration.json');
  let narration;
  const useAi = !args.noAi && Boolean(process.env.ANTHROPIC_API_KEY);

  if (!args.refresh && existsSync(cachePath)) {
    narration = JSON.parse(readFileSync(cachePath, 'utf8'));
    console.log(`\n[1/5] Narration — reused cache (${cachePath})`);
  } else if (useAi) {
    console.log('\n[1/5] Narration — generating with claude-opus-5');
    narration = await generateNarration({ flow, featureNote: args.note });
    writeFileSync(cachePath, JSON.stringify(narration, null, 2));
  } else {
    console.log('\n[1/5] Narration — using hand-written drafts (no ANTHROPIC_API_KEY or --no-ai)');
    narration = flow.steps.map((step) => ({ id: step.id, text: step.narrate, source: 'draft' }));
  }
  for (const line of narration) console.log(`  · ${line.id}: ${line.text}`);

  // 2 — voice --------------------------------------------------------------
  const provider = pickProvider();
  console.log(`\n[2/5] Voice — ${provider}`);
  const clips = [];
  for (const [index, line] of narration.entries()) {
    const file = await synth({ text: line.text, index, workDir, provider });
    const ms = await durationMs(file);
    clips.push({ id: line.id, file, ms, text: line.text });
    console.log(`  · ${line.id} (${(ms / 1000).toFixed(1)}s)`);
  }

  // 3 — record -------------------------------------------------------------
  console.log(`\n[3/5] Recording — ${new URL(flow.path, args.baseUrl)}`);
  const holdMs = clips.map((clip) => clip.ms + STEP_GAP_MS);
  const { videoPath, timings, elapsedMs } = await record({
    flow,
    baseUrl: args.baseUrl,
    holdMs,
    outDir: workDir,
  });

  // 4 — align --------------------------------------------------------------
  // Playwright's recording begins slightly before the first step, so the
  // measured wall-clock elapsed time is shorter than the video. The
  // difference is exactly how far the narration has to slide.
  const videoMs = await durationMs(videoPath);
  const offsetMs = Math.max(0, videoMs - elapsedMs);
  console.log(
    `\n[4/5] Aligning — video ${(videoMs / 1000).toFixed(1)}s, ` +
      `stepped ${(elapsedMs / 1000).toFixed(1)}s, offset ${offsetMs}ms`,
  );

  const placed = clips.map((clip, i) => ({ ...clip, startMs: timings[i].startMs + offsetMs }));
  const narrationWav = await buildNarrationTrack(
    placed.map((clip) => ({ file: clip.file, startMs: clip.startMs })),
    videoMs,
    path.join(workDir, 'narration.wav'),
  );

  // 5 — assemble -----------------------------------------------------------
  console.log('\n[5/5] Assembling');
  const titlePng = await renderTitleCard({ flow, outPath: path.join(workDir, 'title.png') });
  const mp4 = await assemble({
    titlePng,
    titleSeconds: TITLE_SECONDS,
    videoIn: videoPath,
    audioIn: narrationWav,
    output: path.join(outDir, `${flow.id}.mp4`),
  });

  const titleOffset = TITLE_SECONDS * 1000;
  const srt = writeSrt(
    placed.map((clip) => ({
      startMs: titleOffset + clip.startMs,
      endMs: titleOffset + clip.startMs + clip.ms,
      text: clip.text,
    })),
    path.join(outDir, `${flow.id}.srt`),
  );

  writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify(
      {
        flow: flow.id,
        title: flow.title,
        provider,
        offsetMs,
        videoMs,
        // Deliberately without each clip's `file`: the work directory is
        // per-run and pruned, so the path would be dead by the next build.
        steps: placed.map((clip) => ({
          id: clip.id,
          startMs: clip.startMs,
          ms: clip.ms,
          text: clip.text,
        })),
      },
      null,
      2,
    ),
  );

  const total = (TITLE_SECONDS + videoMs / 1000).toFixed(1);
  console.log(`\nDone — ${total}s\n  ${mp4}\n  ${srt}`);
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}`);
  process.exitCode = 1;
});
