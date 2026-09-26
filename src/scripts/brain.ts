/** Brian's Brain — the same 3-state automaton as the Canopy TUI, rendered the
 *  way the terminal draws it: in Braille glyphs (U+2800–U+28FF). The automaton
 *  runs on a fine sub-grid and every 2×4 block of cells is packed into one
 *  Braille character, so the field reads as varied glyphs instead of uniform
 *  dots. Firing cells are drawn bright, dying cells faint.
 *
 *  The field is a machine at rest, not a screensaver: it starts nearly empty
 *  and the cursor is the real input, seeding small propagating clusters along
 *  its path. Two much quieter sources keep the last embers alive — a
 *  rate-limited revival, and, once the cursor has been still long enough, a
 *  single cluster every few seconds. Reduced motion never reaches here at all:
 *  ThemeBackground returns before importing this module.
 *  Split out of backgrounds.ts to keep that module within its size budget.
 */

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared
   locally (the same move spotlight.ts made) so the module needs no runtime
   dependency on backgrounds.ts — keep the field names in sync with it. */
interface BrainCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  w: number;
  h: number;
}

export function brain(ctx: BrainCtx): (t: number) => void {
  const { c } = ctx;
  // On-screen size of one Braille character; each packs 2×4 automaton cells.
  const charW = 14;
  const charH = 24;
  // Sub-cell → Braille dot bit, indexed [row 0..3][col 0..1].
  const DOT = [
    [0x01, 0x08],
    [0x02, 0x10],
    [0x04, 0x20],
    [0x40, 0x80],
  ];
  const glyph = (mask: number) => String.fromCharCode(0x2800 + mask);

  let cols = 0; // character columns
  let rows = 0; // character rows
  let gw = 0; // sub-grid width  (cols × 2)
  let gh = 0; // sub-grid height (rows × 4)
  let grid: Uint8Array;

  function init() {
    cols = Math.ceil(ctx.w / charW) + 1;
    rows = Math.ceil(ctx.h / charH) + 1;
    gw = cols * 2;
    gh = rows * 4;
    grid = new Uint8Array(gw * gh);
    // Start almost empty — the field is meant to read as an idle machine that
    // the cursor wakes up, not as noise. 0.3% of cells, and they're isolated
    // (no second firing neighbour), so they blink once and are gone.
    for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < 0.003 ? 1 : 0;
  }
  init();

  const idx = (x: number, y: number) => ((y + gh) % gh) * gw + ((x + gw) % gw);

  // A cluster of adjacent firing cells: neighbours then see exactly 2 firing
  // cells and ignite, so reseeding actually propagates instead of dying out.
  // The optional extras come from the same neighbourhood, giving 3–5 cells —
  // never a lone dot, which would die on the very next step.
  function seedAt(sx: number, sy: number) {
    grid[idx(sx, sy)] = 1;
    grid[idx(sx + 1, sy)] = 1;
    grid[idx(sx, sy + 1)] = 1;
    if (Math.random() < 0.5) grid[idx(sx + 1, sy + 1)] = 1;
    if (Math.random() < 0.5) grid[idx(sx, sy - 1)] = 1;
  }
  function seedCluster() {
    seedAt(Math.floor(Math.random() * gw), Math.floor(Math.random() * gh));
  }
  // Same cluster, planted under one character cell (which packs a 2×4 block
  // of sub-cells) and centred on it.
  const seedChar = (cx: number, cy: number) => seedAt(cx * 2, cy * 4);

  /* The cursor is the field's input. Seeding is rate-limited (an uncapped
     sweep would cost hundreds of clusters a second) and walks the path from
     the last point to this one, so the trail is a continuous line of cells
     rather than a dotted one. */
  const SEED_EVERY = 200;   // ms between pointer seeds
  const MAX_TRAIL = 14;     // character cells seeded per event, at most
  const IDLE_AFTER = 8000;  // ms of stillness before the field goes ultra-sparse
  const IDLE_EVERY = 3000;  // ms between the lone idle clusters
  const REVIVE_EVERY = 900; // ms between revival batches — a safety net, not a source
  // Touch has no cursor to seed with, so it stays quiet: revival only, and no
  // pointer listener attached at all.
  const isTouch = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

  let nowT = 0;
  let lastSeedT = -1e9;
  let lastMoveT = -1;   // −1 until the first frame lands
  let lastCellX = -1;
  let lastCellY = -1;
  let nextIdleSeedT = -1;
  let lastReviveT = -1;

  // pointermove is bound to the document, not the canvas: the canvas is fixed
  // and full-bleed, but coordinates are mapped through its rect anyway so the
  // two can never drift apart. The signal scopes the listener to this
  // canvas's lifetime, so an Astro view transition can't leave a ghost seeder
  // behind seeding the next page.
  const ac = new AbortController();
  const onPointerMove = (e: PointerEvent) => {
    if (nowT - lastSeedT < SEED_EVERY) return;
    lastSeedT = nowT;
    lastMoveT = nowT;
    nextIdleSeedT = -1;
    // clientX/Y are CSS pixels and the context is already scaled to CSS
    // pixels, so the mapping is a straight divide by the character size.
    const rect = ctx.canvas.getBoundingClientRect();
    const cx = Math.min(Math.max(Math.floor((e.clientX - rect.left) / charW), 0), cols - 1);
    const cy = Math.min(Math.max(Math.floor((e.clientY - rect.top) / charH), 0), rows - 1);
    if (lastCellX < 0) {
      seedChar(cx, cy);
    } else {
      const dx = cx - lastCellX;
      const dy = cy - lastCellY;
      const steps = Math.min(Math.max(Math.ceil(Math.hypot(dx, dy)), 1), MAX_TRAIL);
      for (let i = 1; i <= steps; i++) {
        const s = i / steps;
        seedChar(Math.round(lastCellX + dx * s), Math.round(lastCellY + dy * s));
      }
    }
    lastCellX = cx;
    lastCellY = cy;
  };
  if (!isTouch) {
    document.addEventListener('pointermove', onPointerMove, { passive: true, signal: ac.signal });
  }

  let acc = 0;
  let prev = 0;
  return (t) => {
    // The canvas is gone — we were navigated away. Stop drawing and drop the
    // listener rather than seeding into a detached grid forever.
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    nowT = t;
    if (lastMoveT < 0) lastMoveT = t;
    if (cols !== Math.ceil(ctx.w / charW) + 1) {
      init();
      // The grid was reallocated, so the recorded trail no longer lines up.
      lastCellX = -1;
      lastCellY = -1;
    }
    acc += prev ? t - prev : 0;
    prev = t;
    if (acc > 130) {
      acc = 0;
      const next = new Uint8Array(grid.length);
      let firing = 0;
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const s = grid[y * gw + x];
          if (s === 1) next[y * gw + x] = 2; // firing -> dying
          else if (s === 2) next[y * gw + x] = 0; // dying -> ready
          else {
            let n = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if ((dx || dy) && grid[idx(x + dx, y + dy)] === 1) n++;
            next[y * gw + x] = n === 2 ? 1 : 0;
            if (n === 2) firing++;
          }
        }
      }
      grid = next;
      // The cursor seeded the field above; these two only keep the machine
      // from going completely dark, and both are deliberately near-subliminal.
      if (!isTouch && t - lastMoveT > IDLE_AFTER) {
        // Ultra-sparse: stillness past the idle window costs the revival
        // net and leaves a single cluster every few seconds. Almost off on
        // purpose — the point is that the field is still there, not that it
        // performs. Touch never reaches this branch (it has no idle cursor).
        if (nextIdleSeedT < 0) nextIdleSeedT = t + IDLE_EVERY;
        else if (t >= nextIdleSeedT) {
          seedCluster();
          nextIdleSeedT = t + IDLE_EVERY;
        }
      } else {
        nextIdleSeedT = -1;
        // Revival: only once activity has collapsed, and only rarely. A dense
        // reseed on every step would just recreate the noise this field exists
        // to avoid, so the whole batch is rate-limited.
        const threshold = Math.max(5, Math.floor(grid.length * 0.0035));
        if (firing < threshold && t - lastReviveT > REVIVE_EVERY) {
          lastReviveT = t;
          const clusters = Math.max(1, Math.floor(grid.length * 0.0004));
          for (let i = 0; i < clusters; i++) seedCluster();
        }
      }
    }
    c.clearRect(0, 0, ctx.w, ctx.h);
    c.fillStyle = ctx.color;
    c.textBaseline = 'top';
    c.font = `${charH}px ui-monospace, "DejaVu Sans Mono", monospace`;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        let fire = 0;
        let dying = 0;
        for (let r = 0; r < 4; r++) {
          for (let col = 0; col < 2; col++) {
            const s = grid[(cy * 4 + r) * gw + (cx * 2 + col)];
            if (s === 1) fire |= DOT[r][col];
            else if (s === 2) dying |= DOT[r][col];
          }
        }
        if (!fire && !dying) continue;
        const px = cx * charW;
        const py = cy * charH;
        if (dying) {
          c.globalAlpha = 0.07;
          c.fillText(glyph(dying), px, py);
        }
        if (fire) {
          c.globalAlpha = 0.26;
          c.fillText(glyph(fire), px, py);
        }
      }
    }
    c.globalAlpha = 1;
  };
}
