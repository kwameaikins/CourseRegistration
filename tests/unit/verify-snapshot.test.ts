import { describe, expect, it } from 'vitest';
import { badEntries, diffSnapshots, extractMain, hashMain, mapLimit } from '../../scripts/verify-snapshot-lib.mjs';

const page = (main: string, chunk = 'a1') =>
  `<html><head><script src="/_next/static/chunks/${chunk}.js"></script></head><body><nav>x</nav>${main}<footer>y</footer></body></html>`;

describe('verify-snapshot', () => {
  it('extracts the main element, attributes and all', () => {
    const html = page('<main class="v" id="m"><h1>Valid</h1></main>');
    expect(extractMain(html)).toBe('<main class="v" id="m"><h1>Valid</h1></main>');
    expect(extractMain('<p>none</p>')).toBeNull();
  });

  it('hashes only main, so a changed chunk hash elsewhere does not matter', () => {
    const a = hashMain(page('<main><h1>Ama</h1></main>', 'a1'));
    const b = hashMain(page('<main><h1>Ama</h1></main>', 'zz9'));
    const c = hashMain(page('<main><h1>Kofi</h1></main>', 'a1'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(hashMain('<p>none</p>')).toBeNull();
  });

  it('lists every difference between two snapshots', () => {
    expect(diffSnapshots({ A: 'x', B: 'y' }, { A: 'x', B: 'y' })).toEqual([]);
    expect(diffSnapshots({ A: 'x', B: 'y' }, { A: 'x', B: 'z', C: 'q' })).toEqual([
      'B: <main> differs',
      'C: not in the saved snapshot',
    ]);
    expect(diffSnapshots({ A: 'x' }, {})).toEqual(['A: missing in the new snapshot']);
  });

  it('treats a missing main or an http error as a difference even when both sides match', () => {
    expect(diffSnapshots({ A: null }, { A: null })).toHaveLength(1);
    expect(diffSnapshots({ A: 'http-500' }, { A: 'http-500' })).toHaveLength(1);
    expect(diffSnapshots({ A: 'x' }, { A: 'error-boom' })).toHaveLength(1);
    expect(badEntries({ A: 'x', B: null, C: 'http-404', D: 'error-x' })).toEqual([
      'B: no <main> element', 'C: http-404', 'D: error-x',
    ]);
    expect(badEntries({ A: 'x' })).toEqual([]);
  });

  it('never runs more than the limit at once and keeps order', async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });
});
