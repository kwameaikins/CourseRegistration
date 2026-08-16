import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { toWav } from './ffmpeg.mjs';
import { run } from './ffmpeg.mjs';

// Voice is the one part of this pipeline with a real quality ceiling, so it is
// the one part deliberately kept swappable. Everything else in the build talks
// to `synth()` and does not care which provider answered.
//
//   elevenlabs — production quality. Set ELEVENLABS_API_KEY.
//   windows    — offline Windows SAPI. Free, no key, audibly synthetic.
//                Good enough to prove timing and sync; not good enough to ship.
//
// Override with TUTORIAL_TTS=elevenlabs|windows.
export function pickProvider() {
  const forced = process.env.TUTORIAL_TTS;
  if (forced) return forced;
  if (process.env.ELEVENLABS_API_KEY) return 'elevenlabs';
  if (process.platform === 'win32') return 'windows';
  throw new Error(
    'No TTS provider available. Set ELEVENLABS_API_KEY, or run on Windows for the offline fallback.',
  );
}

const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

async function synthElevenLabs(text, outWav, workDir, index) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const mp3 = path.join(workDir, `step-${index}.mp3`);
  writeFileSync(mp3, Buffer.from(await response.arrayBuffer()));
  await toWav(mp3, outWav);
}

async function synthWindows(text, outWav, workDir, index) {
  // Text goes via a file rather than the command line: narration contains
  // apostrophes and commas that would otherwise need PowerShell quoting.
  const txt = path.join(workDir, `step-${index}.txt`);
  const ps1 = path.join(workDir, `step-${index}.ps1`);
  const raw = path.join(workDir, `step-${index}.raw.wav`);
  writeFileSync(txt, text, 'utf8');

  const q = (p) => `'${p.replace(/'/g, "''")}'`;
  writeFileSync(
    ps1,
    [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      // Default SAPI pace is too brisk to follow alongside a screen recording.
      '$s.Rate = -1',
      'try { $s.SelectVoice("Microsoft Zira Desktop") } catch {}',
      `$s.SetOutputToWaveFile(${q(raw)})`,
      `$s.Speak([IO.File]::ReadAllText(${q(txt)}, [Text.Encoding]::UTF8))`,
      '$s.Dispose()',
    ].join('\n'),
    'utf8',
  );

  await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1]);
  await toWav(raw, outWav);
}

export async function synth({ text, index, workDir, provider }) {
  const outWav = path.join(workDir, `step-${index}.wav`);
  if (provider === 'elevenlabs') await synthElevenLabs(text, outWav, workDir, index);
  else if (provider === 'windows') await synthWindows(text, outWav, workDir, index);
  else throw new Error(`Unknown TTS provider: ${provider}`);
  return outWav;
}
