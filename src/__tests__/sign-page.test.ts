/**
 * The signing page shell and its injected content: no leaked source
 * comments, styled injected nodes, and a wrapping hash.
 *
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { maskEmail, signInnerHtml, type SignStrings } from '../lib/sign/page';
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
  readerLoading: 'Loading…',
  readerError: 'Could not load.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to width',
  pagePrev: 'Previous page',
  pageNext: 'Next page',
  pageOf: 'Page {current} of {total}',
  pageGo: 'Go to page',
  pageDownload: 'Download PDF',
  downloadOrig: 'Download the original PDF',
  hashMismatch: 'Bytes do not match.',
  formName: 'Your full name',
  formNameError: 'Write the name.',
  formId: 'Your identification number',
  formIdError: 'Write the number.',
  acceptTemplate: 'I accept "{title}" with SHA-256 {hash}.',
  formError: 'Something is not right.',
  formAuthError: 'Sign in with the link address.',
  identityTitle: 'This link is for another address.',
  identityLine: 'It belongs to {email}. Sign in with that address.',
  switchAccount: 'Use another address',
  submit: 'Sign the document',
  submitting: 'Signing…',
  signedTitle: 'This document is already signed.',
  signedLine: 'This link is used up.',
  signedHashLabel: 'Signed SHA-256',
  downloadSigned: 'Download the signed PDF',
  expiredTitle: 'This link expired.',
  expiredLine: 'Ask the lab for a new one.',
  revokedTitle: 'This request was revoked.',
  revokedLine: 'The lab cancelled this request.',
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
  issuerName: 'UniverLab',
  issuerId: '901234567-8',
  issuerEmail: 'owner@univerlab.org',
  issuerSignedAt: '2026-11-13T19:00:00.000Z',
  lang: 'en',
  signerIp: '',
  signerUserAgent: '',
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
  it('pending renders the reader container, the download fallback and the form with an error slot', () => {
    const html = signInnerHtml(REQ, 'ready', STRINGS);
    expect(html).toContain('class="sign-viewer"');
    expect(html).toContain('class="sign-reader"');
    expect(html).toContain('data-id="req-1"');
    expect(html).toContain(`href="/api/sign-file?id=req-1"`);
    expect(html).toContain('Download the original PDF');
    expect(html).not.toContain('<iframe');
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

  it('revoked renders the revoked state with no form or reader', () => {
    const html = signInnerHtml(REQ, 'revoked', STRINGS);
    expect(html).toContain(STRINGS.revokedTitle);
    expect(html).toContain(STRINGS.revokedLine);
    expect(html).not.toContain('id="sign-form"');
    expect(html).not.toContain('sign-reader');
  });

  it('matching viewer renders the form, the reader and the auth error slot', () => {
    const html = signInnerHtml(REQ, 'ready', STRINGS, {
      email: 'MARIA@example.com',
      logoutUrl: 'https://team.cloudflareaccess.com/cdn-cgi/access/logout',
    });
    expect(html).toContain('class="sign-reader"');
    expect(html).toContain('id="sign-form"');
    expect(html).toContain('data-err-auth="Sign in with the link address."');
    expect(html).not.toContain('sign-switch');
  });

  it('wrong-address viewer shows the masked address and the switch link, no form or reader', () => {
    const html = signInnerHtml(REQ, 'ready', STRINGS, {
      email: 'owner@univerlab.org',
      logoutUrl: 'https://team.cloudflareaccess.com/cdn-cgi/access/logout',
    });
    expect(html).toContain(STRINGS.identityTitle);
    expect(html).toContain('m•••@example.com');
    expect(html).toContain('class="sign-switch"');
    expect(html).toContain('https://team.cloudflareaccess.com/cdn-cgi/access/logout');
    expect(html).not.toContain('id="sign-form"');
    expect(html).not.toContain('sign-reader');
    expect(html).not.toContain('Service order 7');
  });

  it('missing session shows the notice without a switch link', () => {
    const html = signInnerHtml(REQ, 'ready', STRINGS, { email: null, logoutUrl: null });
    expect(html).toContain(STRINGS.identityTitle);
    expect(html).toContain('m•••@example.com');
    expect(html).not.toContain('sign-switch');
    expect(html).not.toContain('id="sign-form"');
    expect(html).not.toContain('sign-reader');
  });
});

describe('maskEmail', () => {
  it('keeps the first character and the domain', () => {
    expect(maskEmail('maria@example.com')).toBe('m•••@example.com');
  });

  it('answers ••• when there is no domain', () => {
    expect(maskEmail('not-an-address')).toBe('•••');
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

  it('renders paper sheets with a full-width canvas and no iframe', () => {
    expect(css).not.toContain('.sign-viewer iframe');
    expect(css).toMatch(/\.sign-sheet canvas[^}]*width:\s*100%/);
    expect(css).toMatch(/max-width:\s*40rem/);
  });

  it('keeps the text layer selectable over the sheet', () => {
    expect(css).toMatch(/\.sign-text-layer span[^}]*user-select:\s*text/);
  });

  it('lays the owner console side by side on desktop and stacked below', () => {
    expect(css).toMatch(/\.sign-owner-grid[^}]*display:\s*grid/);
    expect(css).toMatch(/min-width:\s*64rem[\s\S]*?\.sign-owner-grid[^}]*grid-template-columns:\s*28rem minmax\(0,\s*1fr\)/);
  });

  it('clips horizontal overflow inside the signing column', () => {
    expect(css).toMatch(/\.sign[^}]*overflow-x:\s*clip/);
  });

  it('styles the checkbox and the error state', () => {
    expect(css).toContain('.sign-accept input');
    expect(css).toContain('.sign-error');
  });
});
