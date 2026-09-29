// Bubbles — GitKit's drifting commit graph: soft orbs rise like bubbles, each
// drawn as a commit node (filled core + ring), linked by gitgraph lane
// segments that re-link from live positions so the graph breathes.
//
// The cursor stages nearby commit nodes (ring fills to a solid pastel core,
// cluster trails ~30 px behind the pointer, max 6 staged, with a wobble) and
// a >=700 ms dwell commits the cluster into one labelled hash node linked to
// its parent below; a single staged bubble is just released. Idle upward
// float and lane re-linking unchanged; touch never stages.
// Extracted from backgrounds.ts.

/* The subset of backgrounds.ts `Ctx` that this runner reads, declared locally
   (the same move brain.ts and spotlight.ts made) so the module needs no
   runtime dependency on backgrounds.ts — keep the field names in sync. */
interface BubblesCtx {
  canvas: HTMLCanvasElement;
  c: CanvasRenderingContext2D;
  color: string;
  bg: string;
  w: number;
  h: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const STAGE_R = 90; // px — ambient bubble centre this near the pointer gets staged
const MAX_STAGED = 6; // spec cap
const TRAIL = 30; // px — spring anchor sits this far BEHIND the pointer
const DWELL = 700; // ms of pointer stillness that commits
const MERGE_MS = 400; // ms of coalescing
const R_CAP = 26; // px — merged radius cap
const LIFT_K = 0.12; // per-frame glow rise while staged
const GLOW_TAU = 600; // ms — frame-rate independent decay of the release settle

function hash7(): string {
  const digits = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 7; i++) s += digits[Math.floor(Math.random() * 16)];
  return s;
}

export function bubbles(ctx: BubblesCtx): (t: number) => void {
  const { c } = ctx;
  const A = ctx.color.length === 7 ? ctx.color : '#e8a4c8';
  const hex = ctx.bg.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const dark = lum < 0.4;
  // The pastel canvas is capped at 0.12 element opacity (§1.2). The
  // largest legal lift is internal alpha → 1.0 plus a stroke mixed 45 %
  // toward black (same hue, no new colour token). On the dark branch the
  // ring/core stays white, so shadeA degenerates to #ffffff and no helper
  // work is wasted.
  const shadeA = (() => {
    if (dark) return '#ffffff';
    const ar = parseInt(A.substring(1, 3), 16);
    const ag = parseInt(A.substring(3, 5), 16);
    const ab = parseInt(A.substring(5, 7), 16);
    const mix = (v: number) => Math.round(v + (0 - v) * 0.45);
    const hx = (v: number) => v.toString(16).padStart(2, '0');
    return '#' + hx(mix(ar)) + hx(mix(ag)) + hx(mix(ab));
  })();
  const N = Math.min(35, Math.floor((ctx.w * ctx.h) / 35000));
  type Bubble = {
    x: number; y: number; r: number; vy: number; vy0: number; vx: number; ph: number; amb: number; glow: number;
    stg: boolean; svx: number; svy: number; ao: number;
    merging: { t0: number; surv: Bubble; r0: number } | null;
    commit: string | null; mergeR: number; parent: Bubble | null;
  };
  const mk = (x: number, y: number, rr: number, vy: number, vx: number, ph: number, amb: number): Bubble => ({
    x, y, r: rr, vy, vy0: vy, vx, ph, amb, glow: 0,
    stg: false, svx: 0, svy: 0, ao: 0, merging: null, commit: null, mergeR: 0, parent: null,
  });
  const bubbles: Bubble[] = Array.from({ length: N }, () => {
    const vy = rand(0.25, 0.7);
    return mk(rand(0, ctx.w), rand(0, ctx.h), rand(12, 35), vy, rand(-0.3, 0.3), rand(0, Math.PI * 2), rand(dark ? 0.06 : 0.3, dark ? 0.15 : 0.55));
  });
  // Pointer bookkeeping — handlers record state only; all timing happens
  // against the tick's `t` (single clock). Touch returns before touching
  // tx/ty/moved. pointerout releases staged (non-merging) members.
  let tx = 0;
  let ty = 0;
  let px = 0;
  let py = 0;
  let hasPointer = false;
  let moved = false;
  let ux = 0;
  let uy = 1;
  let lastMoveT = -Infinity;
  let mergeCx = 0;
  let mergeCy = 0;
  let mergeParent: Bubble | null = null;
  const releaseStaged = () => {
    for (const bb of bubbles) {
      if (bb.stg && !bb.merging) {
        bb.stg = false;
        bb.vy = bb.vy0;
        bb.vx = 0;
      }
    }
  };
  const ac = new AbortController();
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const rect = ctx.canvas.getBoundingClientRect();
      tx = Math.max(0, Math.min(ctx.w, e.clientX - rect.left));
      ty = Math.max(0, Math.min(ctx.h, e.clientY - rect.top));
      moved = true;
      hasPointer = true;
    },
    { passive: true, signal: ac.signal }
  );
  document.addEventListener(
    'pointerout',
    (e: PointerEvent) => {
      if (!e.relatedTarget) {
        hasPointer = false;
        releaseStaged();
      }
    },
    { passive: true, signal: ac.signal }
  );
  // Lerp helpers used only by the glow-lifted draws; glow === 0 ⇒ the
  // original hex byte / number is returned exactly, so ambient is unchanged.
  const lerpStop = (from: string, to: string, k: number) => {
    const a = parseInt(from, 16);
    const bb = parseInt(to, 16);
    return Math.round(a + (bb - a) * k).toString(16).padStart(2, '0');
  };
  const lerpNum = (a: number, b: number, k: number) => a + (b - a) * k;

  let prevT = 0;
  return (t) => {
    if (!ctx.canvas.isConnected) {
      ac.abort();
      return;
    }
    const dt = prevT ? t - prevT : 16;
    prevT = t;
    // 1. Glow decay for settled bubbles (release/settle path). Staged and
    // merging members are re-driven by the lift below.
    const glowDecay = Math.exp(-dt / GLOW_TAU);
    for (const bb of bubbles) {
      if (bb.stg || bb.merging) continue;
      bb.glow *= glowDecay;
      if (bb.glow < 0.004) bb.glow = 0;
    }
    // 2. Travel direction from the fresh move (single clock: stamp tick t).
    if (moved) {
      if (lastMoveT === -Infinity) {
        px = tx;
        py = ty;
      } else {
        const dx = tx - px;
        const dy = ty - py;
        const h = Math.hypot(dx, dy);
        if (h > 1.5) {
          const sx = dx / h;
          const sy = dy / h;
          let nx = 0.55 * ux + 0.45 * sx;
          let ny = 0.55 * uy + 0.45 * sy;
          const n = Math.hypot(nx, ny) || 1;
          nx /= n;
          ny /= n;
          ux = nx;
          uy = ny;
        }
        px = tx;
        py = ty;
      }
      lastMoveT = t;
      moved = false;
    }
    // 3. Trail anchor ~30 px behind the pointer.
    const ax0 = tx - ux * TRAIL;
    const ay0 = ty - uy * TRAIL;
    // 4. STAGE scan — only on frames that consumed a fresh move.
    // (moved was just cleared; lastMoveT === t marks the fresh frame.)
    if (hasPointer && lastMoveT === t) {
      const cand: Array<{ bb: Bubble; d: number }> = [];
      for (const bb of bubbles) {
        if (bb.stg || bb.commit) continue;
        const d = Math.hypot(bb.x - tx, bb.y - ty);
        if (d <= STAGE_R) cand.push({ bb, d });
      }
      cand.sort((p, q) => p.d - q.d); // stable: ties keep creation order
      let stagedCount = 0;
      for (const bb of bubbles) if (bb.stg) stagedCount++;
      for (const { bb } of cand) {
        if (stagedCount >= MAX_STAGED) break;
        if (bb.stg) continue;
        bb.stg = true;
        bb.svx = 0;
        bb.svy = 0;
        bb.ao = Math.hypot(bb.x - ax0, bb.y - ay0) > 2
          ? Math.atan2(bb.y - ay0, bb.x - ax0)
          : stagedCount * 2.39996; // golden angle when coincident (pinned-rand)
        stagedCount++;
      }
    }
    // 5. Physics pass.
    for (const bb of bubbles) {
      if (bb.merging) {
        const m = bb.merging;
        const k = Math.min(1, (t - m.t0) / MERGE_MS);
        const e = 1 - Math.pow(1 - k, 3);
        if (bb !== m.surv) {
          bb.x += (m.surv.x - bb.x) * 0.22;
          bb.y += (m.surv.y - bb.y) * 0.22;
          bb.r = Math.max(0.001, m.r0 * (1 - e));
        } else {
          bb.x += (mergeCx - bb.x) * 0.04;
          bb.y += (mergeCy - bb.y) * 0.04;
          bb.r = m.r0 + (bb.mergeR - m.r0) * e;
        }
        bb.glow += (1 - bb.glow) * LIFT_K;
        continue;
      }
      if (bb.stg) {
        const w = Math.sin(t * 0.004 + bb.ph) * 3; // the wobble
        const d = 10 + bb.r * 0.45 + w;
        const gx = ax0 + Math.cos(bb.ao) * d;
        const gy = ay0 + Math.sin(bb.ao) * d;
        bb.svx = (bb.svx + (gx - bb.x) * 0.02) * 0.86;
        bb.svy = (bb.svy + (gy - bb.y) * 0.02) * 0.86;
        bb.x += bb.svx;
        bb.y += bb.svy;
        bb.glow += (1 - bb.glow) * LIFT_K; // ring fills
        continue;
      }
      bb.y -= bb.vy;
      bb.x += Math.sin(t * 0.0008 + bb.ph) * 0.5 + bb.vx;
      bb.vy += (bb.vy0 - bb.vy) * 0.02;
      bb.vx *= 0.985;
      if (bb.y < -bb.r * 2) {
        bb.y = ctx.h + bb.r * 2;
        bb.x = rand(0, ctx.w);
        if (bb.commit) {
          bb.commit = null;
          bb.parent = null;
        }
      }
    }
    // 6. Merge completion (before the draw pass so no r<=0 arc is drawn)
    // and the dwell trigger.
    const anyMerging = bubbles.some((bb) => bb.merging);
    if (anyMerging) {
      const m0 = bubbles.find((bb) => bb.merging)!.merging!;
      if (t - m0.t0 >= MERGE_MS) {
        const surv = m0.surv;
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const bb = bubbles[i];
          if (bb.merging && bb !== surv) bubbles.splice(i, 1);
        }
        surv.stg = false;
        surv.merging = null;
        surv.r = surv.mergeR;
        surv.commit = hash7();
        surv.parent = mergeParent;
        surv.glow = 1;
        surv.vy = surv.vy0;
        surv.vx = 0;
      }
    } else if (hasPointer) {
      let staged: Bubble[] = [];
      for (const bb of bubbles) if (bb.stg) staged.push(bb);
      if (staged.length === 1 && t - lastMoveT >= DWELL) {
        const bb = staged[0];
        bb.stg = false;
        bb.merging = null;
        bb.vy = bb.vy0;
        bb.vx = 0;
      } else if (staged.length >= 2 && t - lastMoveT >= DWELL) {
        let cx = 0;
        let cy = 0;
        for (const bb of staged) {
          cx += bb.x;
          cy += bb.y;
        }
        cx /= staged.length;
        cy /= staged.length;
        let sum = 0;
        let surv: Bubble = staged[0];
        for (const bb of staged) {
          sum += bb.r * bb.r;
          if (bb.r > surv.r) surv = bb;
        }
        const Rr = Math.min(R_CAP, Math.sqrt(sum)); // area sum
        let parent: Bubble | null = null;
        let best = Infinity;
        for (const bb of bubbles) {
          if (bb.stg || bb.commit) continue;
          if (bb.y <= cy) continue;
          const d2 = (bb.x - cx) * (bb.x - cx) + (bb.y - cy) * (bb.y - cy);
          if (d2 < best) {
            best = d2;
            parent = bb;
          }
        }
        mergeCx = cx;
        mergeCy = cy;
        mergeParent = parent;
        surv.mergeR = Rr;
        for (const bb of staged) bb.merging = { t0: t, surv, r0: bb.r };
      }
    }

    c.clearRect(0, 0, ctx.w, ctx.h);
    // Lanes: ambient chain only — commit nodes are excluded so their causal
    // edge is the explicit parent link. Same 260 px bezier math.
    const sorted = [...bubbles].filter((bb) => !bb.commit).sort((p, q) => p.y - q.y);
    c.strokeStyle = ctx.color;
    c.lineWidth = 1;
    c.globalAlpha = 0.14;
    for (let i = 0; i + 1 < sorted.length; i++) {
      const p = sorted[i];
      const q = sorted[i + 1];
      if (q.y - p.y > 260) continue;
      const my = (p.y + q.y) / 2;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.bezierCurveTo(p.x, my, q.x, my, q.x, q.y);
      c.stroke();
    }
    // Parent links for live commit nodes (slightly stronger edge).
    for (const bb of bubbles) {
      if (!bb.commit || !bb.parent) continue;
      const p = bb.parent;
      const fade = Math.max(0, Math.min(1, bb.y / (0.14 * ctx.h)));
      const my = (bb.y + p.y) / 2;
      c.strokeStyle = ctx.color;
      c.lineWidth = 1;
      c.globalAlpha = 0.22 * fade;
      c.beginPath();
      if (bb.y <= p.y) {
        c.moveTo(bb.x, bb.y);
        c.bezierCurveTo(bb.x, my, p.x, my, p.x, p.y);
      } else {
        c.moveTo(p.x, p.y);
        c.bezierCurveTo(p.x, my, bb.x, my, bb.x, bb.y);
      }
      c.stroke();
    }
    // Nodes over the lanes: the halo wash, then the commit core + ring.
    // ambient (glow = 0) ⇒ every expression collapses to today's bytes:
    //   opacity = amb, halos use '80'/'50' (light) or '20'/'10' (dark),
    //   core fill = (dark ? '#ffffff' : A), line width = 1.
    for (const bb of bubbles) {
      const opacity = bb.amb + (1 - bb.amb) * bb.glow;
      const fade = bb.commit ? Math.max(0, Math.min(1, bb.y / (0.14 * ctx.h))) : 1;
      const g = c.createRadialGradient(bb.x, bb.y, 0, bb.x, bb.y, bb.r);
      g.addColorStop(0, A + lerpStop(dark ? '20' : '80', 'ff', bb.glow));
      g.addColorStop(0.5, A + lerpStop(dark ? '10' : '50', '66', bb.glow));
      g.addColorStop(1, A + '00');
      c.globalAlpha = opacity * fade;
      c.fillStyle = g;
      c.beginPath();
      c.arc(bb.x, bb.y, bb.r, 0, Math.PI * 2);
      c.fill();
      // Ring/core: darker same-hue stroke while glowing; at glow→1 the core
      // fills the ring (0.32→0.52). The dark branch keeps white.
      const ringA = bb.glow > 0 ? shadeA : (dark ? '#ffffff' : A);
      c.globalAlpha = opacity * lerpNum(dark ? 0.3 : 0.8, 1, bb.glow) * fade;
      c.fillStyle = ringA;
      c.beginPath();
      c.arc(bb.x, bb.y, bb.r * (0.32 + 0.2 * bb.glow), 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = opacity * fade;
      c.strokeStyle = ringA;
      c.lineWidth = 1 + bb.glow;
      c.beginPath();
      c.arc(bb.x, bb.y, bb.r * 0.52, 0, Math.PI * 2);
      c.stroke();
      if (bb.commit) {
        c.font = '9px ui-monospace, "DejaVu Sans Mono", monospace';
        c.textAlign = 'center';
        c.globalAlpha = opacity * fade;
        c.fillStyle = dark ? '#ffffff' : shadeA;
        c.fillText(bb.commit, bb.x, bb.y + bb.r * 0.52 + 10);
      }
    }
    c.globalAlpha = 1;
  };
}
