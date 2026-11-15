/**
 * The signing page shell and its injected content: no leaked source
 * comments, styled injected nodes, and a wrapping hash.
 *
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { signInnerHtml, type SignStrings } from '../lib/sign/page';
import type { SigningRequest } from '../lib/sign/evidence';

const SRC = resolve(__dirname, '..');

function readShell(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8');
}

/** Lines after the second `---` (the rendered body), not the frontmatter. */
function bodyLines(source: string): string[] {
  const lines = source.split('\n');
  let fences = 0;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      fences++;
      if (fences === 2) {
        start = i + 1;
        break;
      }
    }
  }
  return lines.slice(start);
}

const STRINGS: SignStrings = {
  hashLabel: 'SHA-256',
  viewerLabel: 'The document',
  zoomHint: 'Every page is here.',
  formName: 'Your full name',
  formNameError: 'Write the name.',
  formId: 'Your identification number',
  formIdError: 'Write the number.',
  acceptTemplate: 'I accept "{title}" with SHA-256 {hash}.',
  formError: 'Something is not right.',
  submit: 'Sign the document',
  submitting: 'Signing…',
  signedTitle: 'This document is already signed.',
  signedLine: 'This link is used up.',
  signedHashLabel: 'Signed SHA-256',
  downloadSigned: 'Download the signed PDF',
  expiredTitle: 'This link expired.',
  expiredLine: 'Ask the lab for a new one.',
};

const REQ: SigningRequest = {
  id: 'req-1',
  title: 'Service order 7',
  signerName: 'Maria Perez',
  signerEmail: 'maria@example.com',
  auditSlug: null,
  origHash: 'ab'.repeat(32),
  createdAt: '2026-11-13T19:00:00.000Z',
  labAcceptedAt: '2026-11-13T19:00:00.000Z',
  status: 'pending',
  signedAt: null,
  signedHash: null,
};

describe.each([
  ['pages/sign-shell.astro'],
  ['pages/es/sign-shell.astro'],
])('sign shell %s', (rel) => {
  it('has no source-comment text outside the frontmatter', () => {
    for (const line of bodyLines(readShell(rel))) {
      expect(line.trimStart().startsWith('//')).toBe(false);
    }
  });

  it('loads the global signing stylesheet instead of a scoped style block', () => {
    const source = readShell(rel);
    expect(source).not.toMatch(/<style[\s>]/);
    expect(source).toMatch(/styles\/sign\.css/);
  });
});

describe('signInnerHtml', () => {
  it('pending renders the viewer, the form and the disabled submit with an error slot', () => {
    const html = signInnerHtml(REQ, 'ready', STRINGS);
    expect(html).toContain('class="sign-viewer"');
    expect(html).toContain('<iframe');
    expect(html).toContain('id="sign-form"');
    expect(html).toMatch(/id="sign-submit"[^>]*disabled/);
    expect(html).toContain('data-error');
  });

  it('signed renders the download fallback', () => {
    const html = signInnerHtml(REQ, 'signed', STRINGS);
    expect(html).toContain('class="sign-download"');
  });

  it('expired renders the expired state', () => {
    const html = signInnerHtml(REQ, 'expired', STRINGS);
    expect(html).toContain(STRINGS.expiredTitle);
  });
});

describe('sign.css', () => {
  const css = readFileSync(resolve(SRC, 'styles', 'sign.css'), 'utf8');

  it('wraps the hash anywhere', () => {
    expect(css).toMatch(/\.sign-hash[^{]*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  it('styles the disabled submit state', () => {
    expect(css).toContain('#sign-submit:disabled');
  });

  it('sizes the viewer iframe for phone and desktop', () => {
    expect(css).toMatch(/\.sign-viewer iframe[^}]*height:\s*70vh/);
    expect(css).toMatch(/max-width:\s*40rem/);
  });

  it('clips horizontal overflow inside the signing column', () => {
    expect(css).toMatch(/\.sign[^}]*overflow-x:\s*clip/);
  });

  it('styles the checkbox and the error state', () => {
    expect(css).toContain('.sign-accept input');
    expect(css).toContain('.sign-error');
  });
});
