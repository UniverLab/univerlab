// Scaffold — the cursor speaks the product's own language (ghScaff · R13):
// an orthogonal lattice the pointer *builds* instead of a drawing it lights up.
// Cells within 1.5 grid units of the pointer raise their members in sequence —
// the two uprights, then the ledger (horizontal), then the diagonal brace —
// each line growing from node to node over 220 ms at full brightness before
// settling to rest, held for one lift (6 s) and lowered in reverse order.
// Re-passing an already-raised cell never stacks a second frame of members on
// top: it plays one short "level" pulse (all four flash to 0.6 and back) and
// resets that cell's clock — idempotent re-levelling, the way a crew re-passes
// a lift rather than building a second one beside it. Idle / touch: one cell
// near the viewport centre raises and lowers by itself every ~4 s.
// Split out of backgrounds.ts like the other cursor runners, so the cell
// machine can be unit-tested (brain/orbit/takes/bg-bubbles/bg-spiral pattern).

import { createSpotlight } from './spotlight';
import { byId } from '../lib/experiments';

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   so the module needs no runtime dependency on backgrounds.ts — keep the field
   names in sync. */
interface ScaffoldCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
  /** Resolved surface, handed in by startBackground (argument first, page
   *  second). Read it here — never documentElement.dataset.surface, which is
   *  unset on the home page and would silently skip the re-tint. */
  surface?: string;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function scaffold(ctx: ScaffoldCtx): (t: number) => void {
  const { c } = ctx;
  // Midnight re-tint on the industrial surface: the runner paints the
  // registry ghscaff essence. c.strokeStyle keeps using ctx.color — the caller value is swapped
  // here, no second hue is introduced. The surface arrives through ctx (the
  // argument startBackground was given, else the page's own data-surface), so
  // the home card's window and the /ghscaff page take the same branch.
  if (ctx.surface === 'industrial') {
    ctx.color = byId('ghscaff').essenceHex;
  }

  const G = 84; // grid cell, px — fixed by the design (do not change)
  const REACH = 1.5 * G; // pointer reach: cells whose centre is within 1.5 cells
  const REACH2 = REACH * REACH;
  const GROW_MS = 220; // one member drawing itself in / out
  const SETTLE_MS = 200; // bright 0.55 → rest 0.25 after the grow
  const HOLD_MS = 6000; // how long a raised cell stays up (one lift)
  const LEVEL_MS = 300; // the idempotent "level" pulse
  const BRIGHT = 0.55;
  const REST = 0.25;
  const PULSE = 0.6;
  const GRID_REST = 0.16; // idle lattice (≈0.11 through the 0.68 canvas)
  const IDLE_EVERY = 4000; // autonomous centre raise cadence
  const POINTER_IDLE_MS = 1000; // pointer counts as idle after 1 s
  const MAX_CELLS = 64; // hard bound on live cells

  // Member order: [upright-left, upright-right, ledger, brace]. Raising runs
  // them in index order (both uprights together, then ledger, then brace);
  // lowering runs the same list backwards, so the lower offsets are mirrored.
  const MEMBERS = 4;
  const RAISE_AT = [0, 0, GROW_MS, 2 * GROW_MS];
  const LOWER_AT = [2 * GROW_MS, 2 * GROW_MS, GROW_MS, 0];

  let cols = 0;
  let rows = 0;
  const dims = () => {
    cols = Math.ceil(ctx.w / G) + 1;
    rows = Math.ceil(ctx.h / G) + 1;
  };
  dims();

  type State = 'raising' | 'raised' | 'lowering';
  type Cell = { gx: number; gy: number; bornAt: number; expiresAt: number; pulseStart: number; state: State };
  const cells = new Map<string, Cell>();
  const key = (gx: number, gy: number) => `${gx},${gy}`;

  // Bounded to the visible grid (a resize shrinks cols/rows) and to MAX_CELLS.
  const prune = () => {
    dims();
    for (const [k, cell] of cells) {
      if (cell.gx < 0 || cell.gy < 0 || cell.gx > cols - 1 || cell.gy > rows - 1) cells.delete(k);
    }
    while (cells.size > MAX_CELLS) {
      let oldest: string | null = null;
      let oldestAt = Infinity;
      for (const [k, cell] of cells) {
        if (cell.bornAt < oldestAt) {
          oldestAt = cell.bornAt;
          oldest = k;
        }
      }
      if (!oldest) break;
      cells.delete(oldest);
    }
  };

  const erect = (gx: number, gy: number, t: number) => {
    cells.set(key(gx, gy), { gx, gy, bornAt: t, expiresAt: 0, pulseStart: 0, state: 'raising' });
  };

  /** A re-pass over a live cell: never a second frame of members — a level
   *  pulse and a fresh 6 s clock instead. A cell that is still assembling is
   *  left alone (its raise continues; no duplicate, no restart). */
  const level = (cell: Cell, t: number) => {
    if (cell.state === 'raising') return;
    if (!cell.pulseStart || t - cell.pulseStart >= LEVEL_MS) cell.pulseStart = t;
    cell.expiresAt = t + HOLD_MS;
    if (cell.state === 'lowering') cell.state = 'raised';
  };

  /** Pointer reach: level everything already standing in reach, erect what is
   *  not. ~9 cells per pass at the centre of a cell, ≥4 at its corners. */
  const raise = (x: number, y: number, t: number) => {
    for (const cell of cells.values()) {
      const dx = cell.gx * G + G / 2 - x;
      const dy = cell.gy * G + G / 2 - y;
      if (dx * dx + dy * dy <= REACH2) level(cell, t);
    }
    const gx0 = Math.floor(x / G);
    const gy0 = Math.floor(y / G);
    for (let gx = gx0 - 2; gx <= gx0 + 2; gx++) {
      for (let gy = gy0 - 2; gy <= gy0 + 2; gy++) {
        if (gx < 0 || gy < 0 || gx > cols - 1 || gy > rows - 1) continue;
        if (cells.has(key(gx, gy))) continue;
        const dx = gx * G + G / 2 - x;
        const dy = gy * G + G / 2 - y;
        if (dx * dx + dy * dy > REACH2) continue;
        erect(gx, gy, t);
      }
    }
    prune();
  };

  // Cursor input — the house pattern (bg-bubbles.ts): document-level so an Astro
  // view transition cannot leave a ghost listener behind, touch input ignored
  // (the idle cadence is the touch fallback), pointerout with a null
  // relatedTarget clears "has pointer" so the idle gate reopens.
  let lastMove = -Infinity;
  let hasPointer = false;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  if (typeof document !== 'undefined') {
    document.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        const rect = ctx.canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(ctx.w, e.clientX - rect.left));
        const y = Math.max(0, Math.min(ctx.h, e.clientY - rect.top));
        const now = performance.now();
        hasPointer = true;
        lastMove = now;
        raise(x, y, now);
      },
      { passive: true, signal: ac?.signal }
    );
    document.addEventListener(
      'pointerout',
      (e: PointerEvent) => {
        if (!e.relatedTarget) hasPointer = false;
      },
      { passive: true, signal: ac?.signal }
    );
  }

  /** One autonomous lift near the viewport centre while the pointer rests —
   *  the background stays alive without input (R4/R5). */
  const idleRaise = (t: number) => {
    const gx = Math.max(0, Math.min(cols - 1, Math.floor(cols / 2) + Math.round(rand(-3, 3))));
    const gy = Math.max(0, Math.min(rows - 1, Math.floor(rows / 2) + Math.round(rand(-3, 3))));
    if (!cells.has(key(gx, gy))) erect(gx, gy, t);
    prune();
  };

  /** Advance every live cell: raising → raised (clock armed) → lowering → gone. */
  const advance = (t: number) => {
    for (const [k, cell] of cells) {
      if (cell.state === 'raising') {
        if (t - cell.bornAt >= RAISE_AT[MEMBERS - 1] + GROW_MS + SETTLE_MS) {
          cell.state = 'raised';
          cell.expiresAt = t + HOLD_MS;
        }
      } else if (cell.state === 'raised') {
        if (t >= cell.expiresAt) cell.state = 'lowering';
      } else if (t - cell.expiresAt >= LOWER_AT[0] + GROW_MS) {
        cells.delete(k); // brace, ledger and uprights are all back down
      }
    }
  };

  /** The level pulse: a triangle over LEVEL_MS, lifting the member toward 0.6. */
  const pulseAt = (cell: Cell, t: number) => {
    if (!cell.pulseStart) return 0;
    const k = (t - cell.pulseStart) / (LEVEL_MS / 2);
    if (k < 0 || k > 2) return 0;
    return k <= 1 ? k : 2 - k;
  };

  /** One cell: its four members, each growing from node to node. */
  const drawCell = (cell: Cell, t: number) => {
    const x = cell.gx * G;
    const y = cell.gy * G;
    const pulse = cell.state === 'lowering' ? 0 : pulseAt(cell, t);
    for (let i = 0; i < MEMBERS; i++) {
      let grow: number;
      let alpha: number;
      if (cell.state === 'lowering') {
        const age = t - cell.expiresAt - LOWER_AT[i];
        if (age >= GROW_MS) continue; // fully lowered
        grow = age <= 0 ? 1 : 1 - age / GROW_MS;
        alpha = REST;
      } else {
        const age = t - cell.bornAt - RAISE_AT[i];
        if (age < 0) continue; // not called yet
        if (age < GROW_MS) {
          grow = age / GROW_MS;
          alpha = BRIGHT;
        } else if (age < GROW_MS + SETTLE_MS) {
          grow = 1;
          alpha = BRIGHT + (REST - BRIGHT) * ((age - GROW_MS) / SETTLE_MS);
        } else {
          grow = 1;
          alpha = REST;
        }
        if (pulse > 0) alpha += (PULSE - alpha) * pulse;
      }
      if (grow <= 0) continue;
      // m0/m1 uprights (bottom → top), m2 ledger (left → right), m3 brace.
      let x0: number, y0: number, x1: number, y1: number;
      if (i === 0) {
        x0 = x; y0 = y + G; x1 = x; y1 = y;
      } else if (i === 1) {
        x0 = x + G; y0 = y + G; x1 = x + G; y1 = y;
      } else if (i === 2) {
        x0 = x; y0 = y; x1 = x + G; y1 = y;
      } else {
        x0 = x; y0 = y + G; x1 = x + G; y1 = y;
      }
      c.globalAlpha = alpha;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x0 + (x1 - x0) * grow, y0 + (y1 - y0) * grow);
      c.stroke();
    }
  };

  const spot = createSpotlight(ctx);
  let prevT = 0;
  let idleAcc = 0;

  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac?.abort();
      return;
    }
    const sp = spot.step();
    if (!sp) return;
    const dt = prevT ? Math.max(0, t - prevT) : 16;
    prevT = t;
    if (hasPointer && t - lastMove < POINTER_IDLE_MS) idleAcc = 0;
    else {
      idleAcc += dt;
      if (idleAcc > IDLE_EVERY) {
        idleAcc = 0;
        idleRaise(t);
      }
    }
    prune();
    advance(t);

    c.clearRect(0, 0, ctx.w, ctx.h);
    c.strokeStyle = ctx.color;
    c.lineWidth = 1;
    // The standing frame — the idle lattice, visible on the midnight surface.
    c.globalAlpha = GRID_REST;
    c.beginPath();
    for (let x = 0; x <= cols; x++) {
      c.moveTo(x * G, 0);
      c.lineTo(x * G, ctx.h);
    }
    for (let y = 0; y <= rows; y++) {
      c.moveTo(0, y * G);
      c.lineTo(ctx.w, y * G);
    }
    c.stroke();
    // Raised cells over it: the members are the motion, the grid is the rest.
    c.lineWidth = 1.5;
    for (const cell of cells.values()) drawCell(cell, t);
    // ONE cursor-anchored spotlight (half intensity for this page), additive,
    // over the lattice and under the content — the raising stays the protagonist.
    spot.paint(c, sp.x, sp.y);
    c.globalAlpha = 1;
  };
}
