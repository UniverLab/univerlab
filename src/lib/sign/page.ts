// Server-rendered signing states: the edge injects this HTML into the
// sign shell (`src/pages/sign-shell.astro`) at request time, so a signed or
// expired link shows its state with no client round trip. Pure string
// building; the interactivity (button enable, submit) is `client.ts`.

import { esc } from '../audit/escape';
import type { LinkState, SigningRequest } from './evidence';

/** The `sign` dictionary slice these renderers need (mirrors i18n dicts). */
export interface SignStrings {
  hashLabel: string;
  viewerLabel: string;
  zoomHint: string;
  readerLoading: string;
  readerError: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  pagePrev: string;
  pageNext: string;
  pageOf: string;
  downloadOrig: string;
  hashMismatch: string;
  formName: string;
  formNameError: string;
  formId: string;
  formIdError: string;
  acceptTemplate: string;
  formError: string;
  submit: string;
  submitting: string;
  identityTitle: string;
  identityLine: string;
  switchAccount: string;
  formAuthError: string;
  signedTitle: string;
  signedLine: string;
  signedHashLabel: string;
  downloadSigned: string;
  expiredTitle: string;
  expiredLine: string;
  revokedTitle: string;
  revokedLine: string;
}

/** The acceptance sentence names the document and its hash (FR5). */
export function acceptanceSentence(title: string, origHash: string, template: string): string {
  return template.replace('{title}', title).replace('{hash}', origHash);
}

function viewerHtml(req: SigningRequest, s: SignStrings): string {
  const fileUrl = `/api/sign-file?id=${esc(req.id)}`;
  return (
    `<div class="sign-viewer"><h2>${esc(s.viewerLabel)}</h2>` +
    `<div class="sign-reader" data-id="${esc(req.id)}" data-orig-hash="${esc(req.origHash)}" ` +
    `data-loading="${esc(s.readerLoading)}" data-error="${esc(s.readerError)}" ` +
    `data-zoom-in="${esc(s.zoomIn)}" data-zoom-out="${esc(s.zoomOut)}" data-zoom-fit="${esc(s.zoomFit)}" ` +
    `data-page-prev="${esc(s.pagePrev)}" data-page-next="${esc(s.pageNext)}" ` +
    `data-page-of="${esc(s.pageOf)}" data-hash-mismatch="${esc(s.hashMismatch)}">` +
    `<p class="sign-reader-status">${esc(s.readerLoading)}</p></div>` +
    `<p class="sign-actions"><a class="sign-download" href="${fileUrl}">${esc(s.downloadOrig)}</a></p>` +
    `<p class="sign-hint">${esc(s.zoomHint)}</p>` +
    `<noscript><p><a class="sign-download" href="${fileUrl}">${esc(s.downloadOrig)}</a></p></noscript></div>`
  );
}

/** The verified viewer of the page, when the edge knows it: the Access
 *  token email (null when no session) and the Access logout URL that lets
 *  the signer switch to the link's address. */
export interface SignViewer {
  email: string | null;
  logoutUrl: string | null;
}

/** Mask an address to its first character and domain (`m•••@example.com`),
 *  so the page names the link's address without exposing it in full. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}

function identityHtml(req: SigningRequest, s: SignStrings, viewer: SignViewer): string {
  const line = s.identityLine.replace('{email}', maskEmail(req.signerEmail));
  const switchLink = viewer.logoutUrl
    ? `<p><a class="sign-switch" href="${esc(viewer.logoutUrl)}">${esc(s.switchAccount)}</a></p>`
    : '';
  return `<p class="sign-state">${esc(s.identityTitle)}</p><p>${esc(line)}</p>` + switchLink;
}

function formHtml(req: SigningRequest, s: SignStrings): string {
  const accept = acceptanceSentence(req.title, req.origHash, s.acceptTemplate);
  return (
    `<form id="sign-form" data-id="${esc(req.id)}" data-hash="${esc(req.origHash)}" data-done="${esc(s.signedTitle)}" data-download="${esc(s.downloadSigned)}" data-hashlabel="${esc(s.signedHashLabel)}" data-err-form="${esc(s.formError)}" data-err-name="${esc(s.formNameError)}" data-err-id="${esc(s.formIdError)}" data-err-auth="${esc(s.formAuthError)}" data-submitting="${esc(s.submitting)}" method="post" action="/api/sign-complete">` +
    `<p class="sign-field"><label for="sign-name">${esc(s.formName)}</label>` +
    `<input id="sign-name" name="name" type="text" autocomplete="name" maxlength="120" required /></p>` +
    `<p class="sign-field"><label for="sign-idnum">${esc(s.formId)}</label>` +
    `<input id="sign-idnum" name="idNumber" type="text" autocomplete="off" maxlength="60" required /></p>` +
    `<p class="sign-accept"><label><input id="sign-accept" name="accept" type="checkbox" value="yes" required />` +
    `<span>${esc(accept)}</span></label></p>` +
    `<p class="sign-error" data-error hidden></p>` +
    `<p><button id="sign-submit" type="submit" disabled>${esc(s.submit)}</button></p>` +
    `</form>`
  );
}

/** The `#sign` container content for one request state. When the edge
 *  knows the verified viewer and it is not the request's signer (or there
 *  is no session), only the identity notice renders — no title, no viewer
 *  iframe, no form. */
export function signInnerHtml(req: SigningRequest, state: LinkState, s: SignStrings, viewer?: SignViewer): string {
  if (viewer && (viewer.email === null || viewer.email.toLowerCase() !== req.signerEmail.toLowerCase())) {
    return identityHtml(req, s, viewer);
  }
  const head =
    `<h1>${esc(req.title)}</h1>` +
    `<p class="sign-hash">${esc(s.hashLabel)} <code>${esc(req.origHash)}</code></p>`;
  if (state === 'signed') {
    return (
      head +
      `<p class="sign-state">${esc(s.signedTitle)}</p>` +
      `<p>${esc(s.signedLine)}</p>` +
      `<p><a class="sign-download" href="/api/sign-file?id=${esc(req.id)}&amp;signed=1">${esc(s.downloadSigned)}</a></p>`
    );
  }
  if (state === 'revoked') {
    return head + `<p class="sign-state">${esc(s.revokedTitle)}</p><p>${esc(s.revokedLine)}</p>`;
  }
  if (state === 'expired') {
    return head + `<p class="sign-state">${esc(s.expiredTitle)}</p><p>${esc(s.expiredLine)}</p>`;
  }
  return head + viewerHtml(req, s) + formHtml(req, s);
}
