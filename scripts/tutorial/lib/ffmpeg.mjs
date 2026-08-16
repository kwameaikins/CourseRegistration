import { spawn } from 'node:child_process';

// Prefer the npm-vendored binaries over whatever is on PATH. They are pinned,
// present on every platform the build runs on, and remove the need for a
// system ffmpeg in CI. An explicit FFMPEG_PATH / FFPROBE_PATH still wins.
async function resolveBinary(envVar, pkg, pick, fallback) {
  if (process.env[envVar]) return process.env[envVar];
  try {
    const mod = await import(pkg);
    const resolved = pick(mod.default ?? mod);
    if (resolved) return resolved;
  } catch {
    // Package not installed — fall back to PATH.
  }
  return fallback;
}

const FFMPEG = await resolveBinary('FFMPEG_PATH', 'ffmpeg-static', (m) => m, 'ffmpeg');
const FFPROBE = await resolveBinary('FFPROBE_PATH', 'ffprobe-static', (m) => m?.path, 'ffprobe');

export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${bin} exited ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

export const ffmpeg = (args) => run(FFMPEG, args);

export async function durationMs(file) {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not probe duration: ${file}`);
  return Math.round(seconds * 1000);
}

// Everything downstream assumes one audio format, so normalise on the way in
// rather than special-casing each TTS provider's output.
export async function toWav(input, output) {
  await ffmpeg(['-y', '-i', input, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', output]);
  return output;
}

// Places each step's clip at its measured start time on one silent bed.
// adelay + amix rather than concat-with-silence: the clips never overlap, so
// amix with normalize=0 is a straight sum and no volume ducking happens.
export async function buildNarrationTrack(clips, totalMs, output) {
  if (clips.length === 0) {
    await ffmpeg([
      '-y', '-f', 'lavfi',
      '-i', `anullsrc=channel_layout=stereo:sample_rate=44100`,
      '-t', (totalMs / 1000).toFixed(3), output,
    ]);
    return output;
  }

  const args = ['-y'];
  for (const clip of clips) args.push('-i', clip.file);

  const filters = clips.map(
    (clip, i) => `[${i}:a]adelay=${clip.startMs}|${clip.startMs}[a${i}]`,
  );
  const inputs = clips.map((_, i) => `[a${i}]`).join('');
  filters.push(`${inputs}amix=inputs=${clips.length}:normalize=0[mixed]`);
  // apad + -t pins the track to the video length so the mux cannot end early.
  filters.push(`[mixed]apad[out]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-t', (totalMs / 1000).toFixed(3),
    '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le',
    output,
  );
  await ffmpeg(args);
  return output;
}

// Title card + body in a single encode. Concat demuxer would need both
// segments pre-encoded identically; the concat filter just needs matching
// scale/fps/format, which is cheaper to guarantee.
export async function assemble({ titlePng, titleSeconds, videoIn, audioIn, output }) {
  await ffmpeg([
    '-y',
    '-loop', '1', '-t', String(titleSeconds), '-i', titlePng,
    '-f', 'lavfi', '-t', String(titleSeconds),
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-i', videoIn,
    '-i', audioIn,
    '-filter_complex',
    '[0:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[tv];' +
      '[2:v]scale=1280:720,setsar=1,fps=30,format=yuv420p[bv];' +
      '[3:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[ba];' +
      '[tv][1:a][bv][ba]concat=n=2:v=1:a=1[v][a]',
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    output,
  ]);
  return output;
}
