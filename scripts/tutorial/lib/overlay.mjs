// A screen recording of a form that fills itself in is not a tutorial — the
// viewer cannot tell what is being pointed at. This injects a synthetic cursor
// and a highlight ring so every action has something to follow. Playwright
// does not render the real pointer into its video, so the cursor has to be a
// DOM element we drive ourselves.

const CURSOR_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>" +
  "<path d='M5 2l14 9-6.6 1.2L15.2 19l-2.7 1.1-2.5-6.6L5 17z' fill='%23141414' " +
  "stroke='%23ffffff' stroke-width='1.5' stroke-linejoin='round'/></svg>";

const MOVE_MS = 620;
const RING_MS = 420;

export async function installOverlay(page) {
  await page.addInitScript((cursorSvg) => {
    const install = () => {
      if (document.getElementById('__tut_cursor')) return;

      const style = document.createElement('style');
      style.textContent = `
        /* The Next dev server paints its tools badge into <nextjs-portal>.
           It is bottom-left on every frame and has no business in a tutorial.
           Hidden here rather than via devIndicators config so recording
           against a production build behaves identically. */
        nextjs-portal { display: none !important; }
        #__tut_cursor {
          position: fixed; left: 0; top: 0; width: 26px; height: 26px;
          background: url("${cursorSvg}") no-repeat center / contain;
          z-index: 2147483647; pointer-events: none;
          transform: translate(-120px, -120px);
          transition: transform ${620}ms cubic-bezier(.4,.1,.2,1);
          filter: drop-shadow(0 2px 5px rgba(0,0,0,.4));
        }
        #__tut_ring {
          position: fixed; left: 0; top: 0; width: 0; height: 0;
          border: 3px solid rgba(4,120,87,.95); border-radius: 10px;
          background: rgba(4,120,87,.08);
          z-index: 2147483646; pointer-events: none; opacity: 0;
          transition: all ${420}ms cubic-bezier(.4,.1,.2,1);
        }
        .__tut_ripple {
          position: fixed; width: 14px; height: 14px; margin: -7px 0 0 -7px;
          border-radius: 50%; background: rgba(4,120,87,.5);
          z-index: 2147483645; pointer-events: none;
          animation: __tut_ripple 520ms ease-out forwards;
        }
        @keyframes __tut_ripple {
          from { transform: scale(1); opacity: .75; }
          to   { transform: scale(4.5); opacity: 0; }
        }
      `;
      document.head.appendChild(style);

      const ring = document.createElement('div');
      ring.id = '__tut_ring';
      const cursor = document.createElement('div');
      cursor.id = '__tut_cursor';
      document.body.append(ring, cursor);

      window.__tut = {
        move(x, y) {
          cursor.style.transform = `translate(${x - 5}px, ${y - 3}px)`;
        },
        ring(box) {
          if (!box) {
            ring.style.opacity = '0';
            return;
          }
          ring.style.opacity = '1';
          ring.style.left = `${box.x - 6}px`;
          ring.style.top = `${box.y - 6}px`;
          ring.style.width = `${box.width + 12}px`;
          ring.style.height = `${box.height + 12}px`;
        },
        ripple(x, y) {
          const dot = document.createElement('div');
          dot.className = '__tut_ripple';
          dot.style.left = `${x}px`;
          dot.style.top = `${y}px`;
          document.body.appendChild(dot);
          setTimeout(() => dot.remove(), 600);
        },
      };
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install);
    } else {
      install();
    }
  }, CURSOR_SVG);
}

// Everything a flow step is allowed to do. Keeping the surface this small is
// what stops flow files from drifting into arbitrary Playwright scripts that
// nobody can read six months from now.
export function makeUi(page) {
  async function boxOf(selector) {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    // Let the smooth-scroll settle before measuring, or the ring lands where
    // the element used to be.
    await page.waitForTimeout(260);
    const box = await el.boundingBox();
    if (!box) throw new Error(`Element has no box: ${selector}`);
    return { el, box };
  }

  const ui = {
    page,

    async pause(ms) {
      await page.waitForTimeout(ms);
    },

    async moveTo(selector) {
      const { box } = await boxOf(selector);
      const x = box.x + Math.min(box.width / 2, 90);
      const y = box.y + box.height / 2;
      await page.evaluate(([px, py]) => window.__tut?.move(px, py), [x, y]);
      await page.waitForTimeout(MOVE_MS);
      return { x, y, box };
    },

    async highlight(selector) {
      const { box } = await boxOf(selector);
      await page.evaluate((b) => window.__tut?.ring(b), box);
      await page.waitForTimeout(RING_MS);
    },

    async clearHighlight() {
      await page.evaluate(() => window.__tut?.ring(null));
      await page.waitForTimeout(200);
    },

    async click(selector) {
      const { x, y } = await ui.moveTo(selector);
      await ui.highlight(selector);
      await page.evaluate(([px, py]) => window.__tut?.ripple(px, py), [x, y]);
      await page.locator(selector).first().click();
      await page.waitForTimeout(220);
    },

    // Typed at human speed rather than filled instantly — an input that
    // snaps to its final value reads as a glitch, not a demonstration.
    async type(selector, text) {
      await ui.moveTo(selector);
      await ui.highlight(selector);
      await page.locator(selector).first().pressSequentially(text, { delay: 45 });
      await page.waitForTimeout(200);
    },

    // Selects by option index. Flow files deliberately do not hard-code option
    // values: the batch list, gender list and lead-source list are all live
    // data and would break the flow the first time someone edits them.
    async selectByIndex(selector, index) {
      await ui.moveTo(selector);
      await ui.highlight(selector);
      const value = await page
        .locator(`${selector} option`)
        .nth(index)
        .getAttribute('value');
      await page.locator(selector).first().selectOption(value);
      await page.waitForTimeout(320);
      return value;
    },

    async check(selector) {
      const { x, y } = await ui.moveTo(selector);
      await ui.highlight(selector);
      await page.evaluate(([px, py]) => window.__tut?.ripple(px, py), [x, y]);
      await page.locator(selector).first().check();
      await page.waitForTimeout(260);
    },
  };

  return ui;
}
