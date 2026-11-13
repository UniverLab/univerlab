// Signing mail (FR2): when a Resend key is configured the signer gets the
// link by mail and later the signed copy; without the key everything works
// and nothing is emailed. Pure builders over dictionary strings plus one
// thin sender with injected fetch, so tests never touch the network.

/** The `sign` dictionary slice these builders need (mirrors i18n dicts). */
export interface SignMailStrings {
  mailInviteSubject: string;
  mailInviteBody: string;
  mailSignedSubject: string;
  mailSignedBody: string;
}

export interface InviteMail {
  to: string;
  subject: string;
  text: string;
}

export interface SignedCopyMail {
  to: string;
  subject: string;
  text: string;
  filename: string;
  /** Base64 of the signed PDF. */
  attachment: string;
}

const fill = (t: string, vars: Record<string, string>): string => {
  let out = t;
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, v);
  return out;
};

// `lang` selects which language dictionary the caller passes; the strings
// carry the language, so the builder itself needs no branch.
export function inviteMail(s: SignMailStrings, opts: { to: string; signerName: string; title: string; link: string; lang: 'en' | 'es' }): InviteMail {
  void opts.lang;
  return {
    to: opts.to,
    subject: fill(s.mailInviteSubject, { title: opts.title }),
    text: fill(s.mailInviteBody, { name: opts.signerName, title: opts.title, link: opts.link }),
  };
}

export function signedCopyMail(
  s: SignMailStrings,
  opts: { to: string; title: string; signedHash: string; lang: 'en' | 'es'; pdf: Uint8Array },
): SignedCopyMail {
  let binary = '';
  for (let i = 0; i < opts.pdf.length; i++) binary += String.fromCharCode(opts.pdf[i]);
  return {
    to: opts.to,
    subject: fill(s.mailSignedSubject, { title: opts.title }),
    text: fill(s.mailSignedBody, { title: opts.title, hash: opts.signedHash }),
    filename: opts.lang === 'es' ? 'documento-firmado.pdf' : 'signed-document.pdf',
    attachment: btoa(binary),
  };
}

/** Send through Resend from a univerlab.org address. No key, no mail:
//  resolves false and the flow continues without emailing anything. */
export async function sendMail(
  env: { RESEND_API_KEY?: string },
  mail: InviteMail | SignedCopyMail,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const key = env.RESEND_API_KEY;
  if (!key) return false;
  const payload: Record<string, unknown> = {
    from: 'UniverLab <firma@univerlab.org>',
    to: [mail.to],
    subject: mail.subject,
    text: mail.text,
  };
  if ('attachment' in mail) {
    payload['attachments'] = [{ filename: mail.filename, content: mail.attachment }];
  }
  let res: Response;
  try {
    res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return false;
  }
  return res.ok;
}
