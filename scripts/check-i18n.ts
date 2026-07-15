// Verifies that en.ts and es.ts stay in sync on *inline markup*. The `type Dict
// = typeof en` constraint already forces both languages to share every key; what
// it can't see is the HTML inside a string. If a translator adds <strong> to one
// language and forgets the other (or a <a> link drifts), the build still passes
// but the pages diverge. This walks both dictionaries in lockstep and flags any
// string whose set of inline tags (<strong>, <em>, <code>, <a>, …) differs.
//
// Runs on plain Node (24+) via native type-stripping. Wired as `prebuild`, so a
// normal `npm run build` (and CI) fails on drift. Run on demand: `npm run check:i18n`.
import { en } from '../src/i18n/en.ts';
import { es } from '../src/i18n/es.ts';

// Every opening/closing tag, normalised to its name (attributes dropped) plus a
// leading `/` for closers — so `<a href="…">` and `</a>` compare as `a` / `/a`.
function tagsOf(s: string): string[] {
  const tags: string[] = [];
  for (const m of s.matchAll(/<(\/?)\s*([a-zA-Z][\w-]*)\b[^>]*>/g)) {
    tags.push(`${m[1] ? '/' : ''}${m[2].toLowerCase()}`);
  }
  return tags.sort();
}

const problems: string[] = [];

function walk(a: unknown, b: unknown, path: string): void {
  if (typeof a === 'string') {
    if (typeof b !== 'string') {
      problems.push(`${path}: present in en but missing/!string in es`);
      return;
    }
    const ta = tagsOf(a);
    const tb = tagsOf(b);
    if (ta.join(',') !== tb.join(',')) {
      problems.push(`${path}\n      en: [${ta.join(', ') || '—'}]\n      es: [${tb.join(', ') || '—'}]`);
    }
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) {
      problems.push(`${path}: en is array, es is not`);
      return;
    }
    if (a.length !== b.length) {
      problems.push(`${path}: array length differs (en ${a.length}, es ${b.length})`);
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`);
    return;
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') {
      problems.push(`${path}: en is object, es is not`);
      return;
    }
    for (const k of Object.keys(a as Record<string, unknown>)) {
      walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    }
  }
}

walk(en, es, '');

if (problems.length > 0) {
  console.error(`\n✗ i18n tag parity: ${problems.length} mismatch(es) between en.ts and es.ts\n`);
  for (const p of problems) console.error(`  • ${p}`);
  console.error('\n  Fix: make the inline tags (<strong>, <a>, <code>, …) match in both languages.\n');
  process.exit(1);
}

console.log('✓ i18n tag parity: en.ts and es.ts agree on inline tags in every string.');
