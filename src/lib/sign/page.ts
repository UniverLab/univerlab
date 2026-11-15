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
  formName: string;
  formNameError: string;
  formId: string;
  formIdError: string;
  acceptTemplate: string;
  formError: string;
  submit: string;
  submitting: string;
  signedTitle: string;
  signedLine: string;
  signedHashLabel: string;
  downloadSigned: string;
  expiredTitle: string;
  expiredLine: string;
}

/** The acceptance sentence names the document and its hash (FR5). */
export function acceptanceSentence(title: string, origHash: string, template: string): string {
  return template.replace('{title}', title).replace('{hash}', origHash);
}

function viewerHtml(req: SigningRequest, s: SignStrings): string {
  return (
    `<div class="sign-viewer"><h2>${esc(s.viewerLabel)}</h2>` +
    `<iframe src="/api/sign-file?id=${esc(req.id)}" title="${esc(req.title)}" loading="lazy"></iframe>` +
    `<p class="sign-hint">${esc(s.zoomHint)}</p></div>`
  );
}

function formHtml(req: SigningRequest, s: SignStrings): string {
  const accept = acceptanceSentence(req.title, req.origHash, s.acceptTemplate);
  return (
    `<form id="sign-form" data-id="${esc(req.id)}" data-hash="${esc(req.origHash)}" data-done="${esc(s.signedTitle)}" data-download="${esc(s.downloadSigned)}" data-hashlabel="${esc(s.signedHashLabel)}" data-err-form="${esc(s.formError)}" data-err-name="${esc(s.formNameError)}" data-err-id="${esc(s.formIdError)}" data-submitting="${esc(s.submitting)}" method="post" action="/api/sign-complete">` +
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

/** The `#sign` container content for one request state. */
export function signInnerHtml(req: SigningRequest, state: LinkState, s: SignStrings): string {
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
  if (state === 'expired') {
    return head + `<p class="sign-state">${esc(s.expiredTitle)}</p><p>${esc(s.expiredLine)}</p>`;
  }
  return head + viewerHtml(req, s) + formHtml(req, s);
}
