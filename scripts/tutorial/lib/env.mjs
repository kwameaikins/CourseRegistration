import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../../..');

// The app gets .env for free from Next; a bare `node scripts/...` run does not.
// Deliberately does not overwrite anything already in the environment, so CI
// secrets always win over a stale local file.
export function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    const full = path.join(ROOT, file);
    if (!existsSync(full)) continue;
    for (const rawLine of readFileSync(full, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
