// The mailbox at the end of the header rule and the ritual of opening a
// letter by hand: out of the slot address side up, turned over, the wax seal
// broken, the flap swung open and the text typed. The approved mockup sets
// look, copy, timings and behaviour (specs/redesign-reference/correo/index.
// html, view "Header y buzón"). A letter already opened today — and every
// letter under prefers-reduced-motion — opens straight onto the letter.

import { moonSVG, SUN_DISC_R, SUN_SRC } from '../lib/moon-svg';
import { ENVELOPE, FRONT, FLAP, postmarkSVG, spots, deckle, anim } from './mail-svg';
import {
  enqueue,
  readOpened,
  writeOpened,
  readLabSeen,
  writeLabSeen,
  isSeen,
  markSeen,
  labLetters,
  pastLetter,
  pastLetterParts,
  dailyFact,
  letterMode,
  boxLabel,
  type MailLetter,
  type LabLetter,
  type PastLetter,
  type Announcement,
  type ExperimentInfo,
} from '../lib/mail';
import {
  readOtdCache,
  fetchPool,
  letterPool,
  summaryText,
  type FilterLang,
  type Fact,
} from '../lib/science-filter';

const API = 'https://announcements.univerlab.org';
const SEAL = '/bench/identidad/sello-lacre.svg';
const MARK = '/bench/identidad/logo-grabado.svg';
const SUN = SUN_SRC;
const SYNODIC = 29.530588853;
const EPOCH = Date.UTC(2000, 0, 6, 18, 14);

/** The mailbox copy dictionary, shipped by Mailbox.astro. */
interface MailCopy {
  open: string;
  openOne: string;
  openNone: string;
  close: string;
  stage: string;
  hintFlip: string;
  hintFlipTouch: string;
  hintSeal: string;
  hintSealTouch: string;
  next: string;
  bandPast: string;
  bandLab: string;
  postmarkPast: string;
  postmarkLab: string;
  stampYears: string;
  addrNamePast: string;
  addrDatePast: string;
  addrNameLab: string;
  addrLab: string;
  headPast: string;
  onWay: string;
  today: string;
  readWikipedia: string;
  continuesWikipedia: string;
  allToday: string;
  readAnnouncement: string;
}

function fmt(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tonight's real phase — the same computation the header's moon uses. */
function synodicPhase(): number {
  let ph = (((Date.now() - EPOCH) / 86400000) % SYNODIC) / SYNODIC;
  if (ph < 0) ph += 1;
  return ph;
}

function isNight(): boolean {
  return document.documentElement.dataset.celestial === 'moon';
}

function reduced(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function coarse(): boolean {
  return matchMedia('(pointer: coarse)').matches;
}

/** Today's sky body on the stamp: the engraved sun by day, tonight's moon. */
function stampArt(): string {
  return isNight() ? moonSVG(synodicPhase(), 'stamp', SUN_DISC_R) : `<img src="${SUN}" alt="">`;
}

function monthName(now: Date, lang: FilterLang, style: 'long' | 'short'): string {
  const m = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', { month: style }).format(now);
  return style === 'short' ? m.replace(/\./g, '') : m;
}

/** The day of the postmark and the address: "October 21" / "21 de octubre". */
function stampDay(now: Date, lang: FilterLang): string {
  return lang === 'es'
    ? `${now.getDate()} de ${monthName(now, lang, 'long')}`
    : `${monthName(now, lang, 'long')} ${now.getDate()}`;
}

/** One step of the ritual, done by the reader: resolves on a click/tap on
 *  `el`, on the mouse coming onto it when `hover` is set, or on Enter/Space
 *  while `keyTarget` (default `el`) has focus. */
function step(
  el: HTMLElement,
  opts: { hover?: boolean; keyTarget?: HTMLElement } = {},
): Promise<void> {
  return new Promise((ok) => {
    const keyTarget = opts.keyTarget || el;
    const done = (e?: Event) => {
      if (e) e.stopPropagation();
      el.removeEventListener('click', done);
      el.removeEventListener('pointerenter', near as EventListener);
      keyTarget.removeEventListener('keydown', key);
      ok();
    };
    const near = (e: Event) => {
      if ((e as PointerEvent).pointerType === 'mouse') done();
    };
    const key = (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        (e as KeyboardEvent).preventDefault();
        done();
      }
    };
    el.addEventListener('click', done);
    if (opts.hover) el.addEventListener('pointerenter', near as EventListener);
    keyTarget.addEventListener('keydown', key);
  });
}

const wait = (n: number) => new Promise((ok) => setTimeout(ok, n));

function startMailbox(): void {
  const box = document.querySelector<HTMLButtonElement>('.mailbox');
  if (!box) return;
  const badge = box.querySelector<HTMLElement>('.badge');
  const celestial = document.querySelector<HTMLButtonElement>('.celestial-btn');

  let copy: MailCopy;
  let lang: FilterLang;
  let exps: ExperimentInfo[];
  try {
    copy = JSON.parse(box.dataset.copy || '{}') as MailCopy;
    lang = box.dataset.lang === 'es' ? 'es' : 'en';
    exps = JSON.parse(box.dataset.exps || '[]') as ExperimentInfo[];
  } catch (e) {
    return;
  }

  let queue: MailLetter[] = [];
  let past: PastLetter | null = null;
  // Today's opened ids plus every lab letter ever opened here: the lab list
  // outlives the day, so a release letter is delivered once, not daily.
  let opened: string[] = readOpened().concat(readLabSeen());
  let pop: HTMLElement | null = null;
  let opener: HTMLElement | null = null;

  const bodyOf = (m: MailLetter) => {
    if (m.kind === 'lab') return m.body;
    if (m.summary) return summaryText(m);
    return m.text;
  };

  function syncBox(): void {
    const n = queue.length;
    box.dataset.mail = n ? '1' : '0';
    if (badge) {
      badge.hidden = !n;
      badge.textContent = String(n);
    }
    box.setAttribute('aria-label', boxLabel(copy, n));
  }

  /* ── The address side and the letter ─────────────────────────────────── */
  function build(m: MailLetter): HTMLElement {
    const lab = m.kind === 'lab';
    // A letter from the past reads in italic; lab letters stay upright.
    const letterCls = lab ? 'letter' : 'letter past';
    const now = new Date();
    const w = Math.min(320, innerWidth - 32);
    const stageH = (w * 186) / 300;
    const flapH = stageH * 0.565;
    const day = stampDay(now, lang);
    const years = Math.max(0, now.getFullYear() - (parseInt(m.kind === 'past' ? m.year : '', 10) || now.getFullYear()));
    // A lab letter is postmarked the day it was posted, not the day it is
    // read; a letter from the past carries today's day and its own year.
    const posted = lab ? new Date(m.date) : now;
    const sent = Number.isFinite(posted.getTime()) ? posted : now;
    const sentToday = sent.toDateString() === now.toDateString();
    const mark = `${sent.getDate()} ${monthName(sent, lang, 'short').toUpperCase()}`;
    const todayHref = lang === 'es' ? '/es/today/' : '/today/';

    const el = document.createElement('div');
    el.className = 'mail-pop';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'mail-title');
    el.style.setProperty('--w', w + 'px');
    el.style.setProperty('--flap-room', Math.round(flapH - 6) + 'px');

    const meta = lab
      ? `<span>${esc(
          m.exp ? `${m.exp.number} · ${m.exp.name} · ${m.type}` : m.type,
        )}</span><span>${esc(sentToday ? copy.today : stampDay(sent, lang))}</span>`
      : `<span id="mail-title">${esc(fmt(copy.headPast, { day, year: (m as { year: string }).year }))}</span><span>${esc(
          fmt(copy.onWay, { years }),
        )}</span>`;
    // A lab letter has a title of its own; a letter from the past is titled
    // by its head ("Letter of …"), which carries the dialog's label — unless
    // it carries a summary, whose headline is the event's own line.
    const parts = !lab && m.kind === 'past' ? pastLetterParts(m, copy) : null;
    const heading = lab
      ? `<h2 id="mail-title">${esc(m.title)}</h2>`
      : parts && parts.headline
        ? `<h2>${esc(parts.headline)}</h2>`
        : '';

    const links = lab
      ? `<a href="${
          m.exp ? `/status/?topic=${encodeURIComponent(m.exp.id)}` : '/status/'
        }">${esc(copy.readAnnouncement)}</a>`
      : `<a href="${esc(m.link)}" target="_blank" rel="noopener noreferrer">${esc(
          parts ? parts.linkLabel : copy.readWikipedia,
        )}</a><a href="${todayHref}">${esc(copy.allToday)}</a>`;

    let face: string;
    if (lab) {
      const accent = m.exp ? m.exp.essenceHex : 'var(--mail-garnet)';
      const stamp = m.exp
        ? `<div class="stamp lab"><div class="art"><img src="${MARK}" alt=""></div><span class="val">${esc(m.exp.number)}</span></div>`
        : `<div class="stamp"><div class="art" style="background:#f3ead6"><img src="${MARK}" alt=""></div></div>`;
      const addr = m.exp
        ? `<span>${esc(copy.addrNameLab)}</span><span>${esc(fmt(copy.addrLab, { name: m.exp.name, exp: m.exp.number }))}</span><span>univerlab.org</span>`
        : `<span>${esc(copy.addrNameLab)}</span><span>univerlab.org</span>`;
      face = `<div class="face lab" aria-hidden="true" style="--accent: ${accent}">
          <span class="via">${esc(copy.bandLab)}</span>
          <div class="postmark">${postmarkSVG(copy.postmarkLab, mark, String(sent.getFullYear()), 'lab')}</div>
          ${stamp}
          <div class="grime"></div>
          <div class="addr">${addr}</div>
        </div>`;
    } else {
      face = `<div class="face" aria-hidden="true">
          <span class="via">${esc(copy.bandPast)}</span>
          <div class="postmark">${postmarkSVG(copy.postmarkPast, mark, (m as { year: string }).year, 'past')}</div>
          <div class="stamp"><div class="art">${stampArt()}</div><span class="val">${esc(
            fmt(copy.stampYears, { years }),
          )}</span></div>
          <div class="grime"></div>
          <div class="addr"><span>${esc(copy.addrNamePast)}</span><span>${esc(
            fmt(copy.addrDatePast, { day, year: now.getFullYear() }),
          )}</span><span>univerlab.org</span></div>
        </div>`;
    }

    el.innerHTML = `
      <div class="stage" tabindex="0" role="button" aria-label="${esc(copy.stage)}">
        <div class="shadow"></div>
        <div class="env-back">${ENVELOPE}</div>
        <div class="holder"><article class="${letterCls}">
          <div class="letter-shadow"></div><div class="grime"></div>
          <button type="button" class="close" aria-label="${esc(copy.close)}">×</button>
          <div class="meta">${meta}</div>
          ${heading}
          <p aria-live="polite"><span class="typed"></span><span class="caret"></span></p>
          <div class="links">${links}</div>
          <button type="button" class="next" hidden></button>
        </article></div>
        <div class="env-front">${FRONT}<div class="grime"></div></div>
        <div class="flap">${FLAP}<div class="grime"></div></div>
        <div class="seal"><img class="l" src="${SEAL}" alt=""><img class="r" src="${SEAL}" alt=""></div>
        ${face}
      </div>
      <p class="hint-step" aria-live="polite"></p>`;

    const r = box.getBoundingClientRect();
    // Centred on the screen at every width, as on a phone: horizontally in the
    // viewport, vertically in the space under the header (never above it, so
    // the opened flap never covers the bar). The letter still flies out of the
    // mailbox's slot: `from` below is measured from wherever the popover sits.
    const left = Math.round((innerWidth - w) / 2);
    const below = r.bottom + 22;
    const height = flapH + stageH;
    const top = Math.max(below, Math.round(below + (innerHeight - below - height) / 2));
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.dataset.from = String(r.left + r.width / 2 - left); // the slot, in the popover's x
    return el;
  }

  /* ── Opening ─────────────────────────────────────────────────────────── */
  function openLetter(from?: HTMLElement | null): void {
    if (pop) return;
    const now = new Date();
    const letter: MailLetter | null = queue.length ? (queue.shift() as MailLetter) : past;
    if (!letter) return;
    syncBox();
    opener = from || box;
    box.setAttribute('aria-expanded', 'true');

    const me = build(letter);
    pop = me;
    document.body.appendChild(me);
    const $ = (s: string) => me.querySelector(s) as HTMLElement;
    const stage = $('.stage'), flap = $('.flap'), holder = $('.holder');
    const sheet = $('.letter'), seal = $('.seal'), face = $('.face');
    const typed = $('.typed'), links = $('.links'), x = $('.close');
    const shadow = $('.shadow'), lshadow = $('.letter-shadow'), hint = $('.hint-step');
    deckle(sheet);
    me.querySelectorAll<HTMLElement>('.grime').forEach((g) =>
      g.style.setProperty('--spots', spots()),
    );
    x.addEventListener('click', () => closeLetter(false));
    const stageH = stage.offsetHeight;
    const letterTop = sheet.offsetTop;
    const up = -(letterTop + sheet.offsetHeight * 0.62);
    const front = Math.round(stageH * 0.4) - letterTop;
    const text = bodyOf(letter);

    // Remembered per day: a reload does not raise the flag again. The mode
    // is decided with the ids as they were *before* this open marked it.
    const mode = letterMode(letter, opened, reduced());
    opened = markSeen(letter.id, opened);
    writeOpened(opened);
    if (letter.kind === 'lab') writeLabSeen(markSeen(letter.id, readLabSeen()));

    function offerNext(): void {
      if (!queue.length) return;
      nb.hidden = false;
      nb.textContent = fmt(copy.next, { n: queue.length });
      nb.addEventListener('click', () => {
        closeLetter(true);
        openLetter(box);
      });
    }
    const nb = $('.next');

    // A letter already opened today, and every letter under reduced motion,
    // skips the ritual: it opens straight onto the letter.
    if (mode === 'straight') {
      if (!reduced() && typeof me.animate === 'function') {
        me.animate(
          [{ opacity: 0, transform: 'translateY(-10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 220, easing: 'ease-out' },
        );
      }
      flap.classList.add('open');
      flap.style.transform = 'rotateX(180deg)';
      seal.remove();
      face.remove();
      holder.classList.add('free');
      sheet.style.transform = `translateY(${front}px) rotate(-1.2deg)`;
      lshadow.style.opacity = '1';
      typed.textContent = text;
      me.querySelector('.caret')?.remove();
      links.classList.add('on');
      offerNext();
      x.classList.add('on');
      x.focus({ preventScroll: true });
      return;
    }

    void ritual();

    /* 1. The slot's lid lifts and the letter comes out, address side up. */
    async function ritual(): Promise<void> {
      box.classList.add('opening');
      stage.style.transformOrigin = `${Number(me.dataset.from)}px 0`;
      void anim(shadow, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 120 });
      await anim(
        stage,
        [
          { transform: `translateY(-${Math.round(stageH * 0.9)}px) scale(.14)`, opacity: 0 },
          { transform: `translateY(-${Math.round(stageH * 0.62)}px) scale(.3)`, opacity: 1, offset: 0.25 },
          { transform: 'translateY(3px) rotate(-2deg) scale(1)', opacity: 1, offset: 0.8 },
          { transform: 'translateY(0) rotate(-1.6deg) scale(1)', opacity: 1 },
        ],
        { duration: 340, easing: 'cubic-bezier(.3,.6,.35,1)' },
      );
      box.classList.remove('opening');
      stage.style.transformOrigin = '';
      stage.focus({ preventScroll: true });
      if (pop !== me) return;

      /* 2. It waits until the reader turns it over: the cursor coming near,
       *    a tap, or Enter on the focused letter. */
      hint.textContent = coarse() ? copy.hintFlipTouch : copy.hintFlip;
      await step(stage, { hover: true });
      if (pop !== me) return;
      hint.textContent = '';
      await anim(
        stage,
        [{ transform: 'rotate(-1.6deg) scaleX(1)' }, { transform: 'rotate(-1.6deg) scaleX(0)' }],
        { duration: 120, easing: 'ease-in' },
      );
      face.remove();
      await anim(
        stage,
        [{ transform: 'rotate(-1.6deg) scaleX(0)' }, { transform: 'rotate(-1.6deg) scaleX(1)' }],
        { duration: 120, easing: 'ease-out' },
      );
      stage.classList.add('flipped');
      if (pop !== me) return;

      /* 2b. The reader breaks the seal: a click or tap on it, or Enter. */
      hint.textContent = coarse() ? copy.hintSealTouch : copy.hintSeal;
      await step(seal, { keyTarget: stage });
      if (pop !== me) return;
      hint.textContent = '';
      stage.classList.add('opened');

      /* 3. The seal trembles, splits along its crack and falls in two halves
       *    with crumbs of wax. */
      await anim(
        seal,
        [
          { transform: 'rotate(0)' },
          { transform: 'rotate(-5deg)' },
          { transform: 'rotate(4deg)' },
          { transform: 'rotate(0)' },
        ],
        { duration: 110 },
      );
      const [l, rr] = seal.querySelectorAll('img');
      for (let i = 0; i < 7; i++) {
        const c = document.createElement('span');
        c.className = 'crumb';
        seal.appendChild(c);
        const a = Math.random() * 1.6 - 0.8 + (i % 2 ? Math.PI : 0);
        const d = 18 + Math.random() * 26;
        void anim(
          c,
          [
            { opacity: 1, transform: 'translate(-50%,-50%)' },
            {
              opacity: 0,
              transform: `translate(${(Math.cos(a) * d).toFixed(1)}px, ${(Math.abs(Math.sin(a)) * d + 24).toFixed(1)}px) rotate(${Math.round(Math.random() * 360)}deg)`,
            },
          ],
          { duration: 440, easing: 'cubic-bezier(.2,.6,.5,1)' },
        );
      }
      void anim(
        l,
        [{ transform: 'none', opacity: 1 }, { transform: 'translate(-14px, 40px) rotate(-32deg)', opacity: 0 }],
        { duration: 420, easing: 'cubic-bezier(.4,0,.8,.6)' },
      );
      void anim(
        rr,
        [{ transform: 'none', opacity: 1 }, { transform: 'translate(16px, 46px) rotate(26deg)', opacity: 0 }],
        { duration: 460, easing: 'cubic-bezier(.4,0,.8,.6)' },
      );
      await wait(70);
      if (pop !== me) return;

      /* 4. The flap swings open, showing its engraved lining. */
      await anim(
        flap,
        [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(180deg)' }],
        { duration: 230, easing: 'cubic-bezier(.45,.05,.3,1)' },
      );
      flap.classList.add('open');
      seal.remove();
      if (pop !== me) return;

      /* 5. The letter rises out and is laid in front of the envelope with
       *    its shadow. */
      await anim(
        sheet,
        [{ transform: 'translateY(0)' }, { transform: `translateY(${up}px)` }],
        { duration: 220, easing: 'cubic-bezier(.3,.6,.3,1)' },
      );
      holder.classList.add('free');
      void anim(lshadow, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
      void anim(
        stage,
        [{ transform: 'translateY(0) rotate(-1.6deg)' }, { transform: 'translateY(-6px) rotate(-1.6deg)' }],
        { duration: 260, easing: 'ease-out' },
      );
      await anim(
        sheet,
        [
          { transform: `translateY(${up}px) rotate(0deg) scale(1)` },
          { transform: `translateY(${Math.round(up * 0.4 + front * 0.6)}px) rotate(-2deg) scale(1.03)`, offset: 0.55 },
          { transform: `translateY(${front}px) rotate(1.2deg) scale(1)` },
        ],
        { duration: 280, easing: 'cubic-bezier(.3,.6,.25,1)' },
      );
      if (pop !== me) return;

      /* 6. The fact is typed onto the letter, 7 ms a character, 40 after a
       *    comma or a full stop. */
      x.classList.add('on');
      for (let i = 1; i <= text.length; i++) {
        if (pop !== me) return;
        typed.textContent = text.slice(0, i);
        await wait(text[i - 1] === ',' || text[i - 1] === '.' ? 40 : 7);
      }
      me.querySelector('.caret')?.remove();
      links.classList.add('on');
      offerNext();
      x.focus({ preventScroll: true });
    }
  }

  function closeLetter(instant: boolean): void {
    if (!pop) return;
    const me = pop;
    pop = null;
    box.setAttribute('aria-expanded', 'false');
    if (instant || reduced() || typeof me.animate !== 'function') me.remove();
    else {
      void me
        .animate(
          [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-18px)' }],
          { duration: 220, easing: 'ease-in', fill: 'forwards' },
        )
        .finished.then(() => me.remove())
        .catch(() => me.remove());
    }
    if (opener && !instant) opener.focus({ preventScroll: true });
  }

  /* ── What arrives ────────────────────────────────────────────────────── */
  function arrive(letter: LabLetter): void {
    const finish = () => {
      queue = enqueue(queue, letter);
      syncBox();
    };
    if (reduced() || typeof box.animate !== 'function') {
      finish();
      return;
    }
    const r = box.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'mail-drop';
    document.body.appendChild(d);
    void d
      .animate(
        [
          { left: r.left + 10 + 'px', top: r.top - 70 + 'px', transform: 'rotate(-14deg)', opacity: 0 },
          { left: r.left + 10 + 'px', top: r.top - 30 + 'px', transform: 'rotate(-6deg)', opacity: 1, offset: 0.5 },
          { left: r.left + 10 + 'px', top: r.top + 17 + 'px', transform: 'rotate(0deg) scaleY(.2)', opacity: 1 },
        ],
        { duration: 520, easing: 'ease-in', fill: 'forwards' },
      )
      .finished.then(() => {
        d.remove();
        finish();
        void box.animate(
          [
            { transform: 'rotate(0)' },
            { transform: 'rotate(-4deg)' },
            { transform: 'rotate(3deg)' },
            { transform: 'rotate(0)' },
          ],
          { duration: 260 },
        );
      })
      .catch(() => {
        d.remove();
        finish();
      });
  }

  async function loadLabMail(): Promise<void> {
    try {
      const res = await fetch(`${API}/?limit=5`);
      if (!res.ok) return;
      const data = await res.json();
      const entries: Announcement[] = Array.isArray(data?.entries) ? data.entries : [];
      const fresh = labLetters(entries, opened, new Date(), exps);
      // The newest unopened entry of the last 7 days is today's lab mail; it
      // waited in the API already, so it joins the queue without the drop.
      if (fresh.length) {
        queue = enqueue(queue, fresh[0]);
        syncBox();
      }
    } catch (e) {}
  }

  async function loadPast(): Promise<void> {
    let pool = readOtdCache(lang);
    if (!pool || !pool.length) {
      try {
        pool = await fetchPool(fetch, lang);
      } catch (e) {
        pool = null;
      }
    }
    if (!pool || !pool.length) return;
    // The cache holds the whole day; the letter is events only — births
    // and deaths stay in the newspaper's Nacimientos/Defunciones columns.
    const fact = dailyFact<Fact>(letterPool(pool), new Date());
    if (!fact) return;
    const letter = pastLetter(fact, new Date());
    past = letter;
    // The past letter waits at the back of the queue — unless it is already
    // opened today, which must not raise the flag again.
    if (!isSeen(letter.id, opened) && !queue.some((l) => l.id === letter.id)) {
      queue = queue.concat(letter);
      syncBox();
    }
  }

  function wireEvents(): void {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(`${API}/events`);
    source.addEventListener('entry', (e: MessageEvent) => {
      try {
        const entry = JSON.parse(e.data) as Announcement;
        if (!entry || !entry.id || isSeen(entry.id, opened)) return;
        const letter = labLetters([entry], opened, new Date(), exps)[0];
        if (letter) arrive(letter);
      } catch (err) {}
    });
    source.onerror = () => {};
  }

  /* ── Wiring ──────────────────────────────────────────────────────────── */
  box.addEventListener('click', () => (pop ? closeLetter(false) : openLetter(box)));
  (window as unknown as Record<string, unknown>).univerlabOpenMail = (
    from?: HTMLElement,
  ) => {
    if (pop) closeLetter(false);
    else openLetter(from || box);
  };
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && pop) closeLetter(false);
  });
  addEventListener('pointerdown', (e: PointerEvent) => {
    if (!pop) return;
    const t = e.target as Node | null;
    if (!t) return;
    if (!pop.contains(t) && !box.contains(t) && !(celestial && celestial.contains(t))) {
      closeLetter(false);
    }
  });
  addEventListener('resize', () => closeLetter(true));

  syncBox();
  void loadLabMail();
  void loadPast();
  wireEvents();
}

if (typeof document !== 'undefined') {
  // Warm today's filtered science pool once, in the background, so the first
  // letter arrives with no network wait. High timeout keeps it off FCP/LCP.
  // (This warm-up moved here from the header, which no longer opens letters.)
  const warmLang: FilterLang = document.documentElement.lang === 'es' ? 'es' : 'en';
  if (!readOtdCache(warmLang)) {
    const warm = () => {
      fetchPool(fetch, warmLang).catch(() => {});
    };
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 5000 });
    else setTimeout(warm, 4000);
  }
  if (document.readyState === 'complete') startMailbox();
  else {
    addEventListener('load', () => startMailbox(), { once: true });
  }
}
