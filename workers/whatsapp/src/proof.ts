import { serviceLabel, type BookingState, type PaymentProof } from './booking';
import { GRAPH, sendMedia } from './meta';
import { formatSlot } from './schedule';
import type { Lang } from './lang';

/** Used when the deploy sets no PROOF_MODEL. The model is configuration,
 *  like the text model in brain.ts: the production environment's
 *  WA_PROOF_MODEL / WA_PROOF_MODEL_OPTIONS variables reach the Worker as
 *  PROOF_MODEL / PROOF_MODEL_OPTIONS (see README). */
export const DEFAULT_PROOF_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

/** Expected consultation price, matched against the receipt's amount. */
export const EXPECTED_COP = 150000;
export const EXPECTED_USD = 45;

export interface ProofConfig {
  model: string;
  /** Extra request fields for this model, merged into the AI.run input. */
  options: Record<string, unknown>;
}

/** The vision model is deploy configuration with this default as fallback,
 *  following the TEXT_MODEL pattern in brain.ts. */
export function proofConfig(env: { PROOF_MODEL?: string; PROOF_MODEL_OPTIONS?: string }): ProofConfig {
  const model = env.PROOF_MODEL?.trim() || DEFAULT_PROOF_MODEL;
  let options: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(env.PROOF_MODEL_OPTIONS?.trim() || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      options = parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed value falls back to no options rather than breaking replies.
  }
  return { model, options };
}

/** Only images and PDF documents can carry a payment receipt. */
export function isProofMedia(type: string, mime?: string): boolean {
  return type === 'image' || mime === 'application/pdf';
}

/** Told to the client when their receipt arrives. A person checks the
 *  payment: the agent never says the payment is valid. */
export const PROOF_RECEIVED: Record<Lang, string> = {
  es: 'Recibí tu comprobante y se lo pasé a una persona del laboratorio para que lo revise: tu espacio sigue apartado y te confirmo por aquí en cuanto esté revisado.',
  en: 'I received your receipt and passed it to someone at the lab to check it: your slot stays held and I will confirm here as soon as it is checked.',
};

interface ProofEnv {
  AI: { run(model: string, input: unknown): Promise<unknown> };
  WA_ACCESS_TOKEN: string;
  WA_PHONE_NUMBER_ID: string;
  OPERATOR_PHONE: string;
}

export interface ProofMedia {
  id: string;
  kind: string;
  mime?: string;
}

const PROMPT =
  'Read this payment receipt (Bre-B or PayPal) and reply with JSON only, ' +
  'no other text: {"amount": number or null, "currency": "COP" or "USD" or "", ' +
  '"date": "", "method": "", "reference": "", "payee": ""}. ' +
  'Use null for the amount and "" for any field you cannot read.';

function extractRaw(res: unknown): string {
  const r = res as {
    choices?: Array<{ message?: { content?: string } }>;
    response?: string;
  };
  if (typeof r?.choices?.[0]?.message?.content === 'string') {
    return r.choices[0].message.content;
  }
  if (typeof r?.response === 'string') return r.response;
  return '';
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function unreadable(): PaymentProof {
  return { readable: false, amount: null, currency: '', date: '', method: '', reference: '', payee: '', flag: 'unreadable' };
}

/** The extraction flag: '' when the receipt matches the expected price and
 *  payee, else what the operator must double-check. */
function flagOf(
  proof: Omit<PaymentProof, 'flag'>,
  payee: string
): string {
  if (!proof.readable) return 'unreadable';
  if (proof.amount === null || !Number.isFinite(proof.amount)) return 'no-amount';
  const currency = proof.currency.toUpperCase();
  if (currency !== 'COP' && currency !== 'USD') return 'bad-currency';
  const expected = currency === 'COP' ? EXPECTED_COP : EXPECTED_USD;
  if (Math.abs(proof.amount - expected) > 1) return 'amount-mismatch';
  if (payee.trim() && proof.payee && proof.payee.toLowerCase() !== payee.trim().toLowerCase()) {
    return 'payee-mismatch';
  }
  return '';
}

export function parseProof(res: unknown, payee: string): PaymentProof {
  try {
    const raw = extractRaw(res);
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end < 0 || end <= start) return unreadable();
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return unreadable();
    const amount =
      typeof parsed['amount'] === 'number' && Number.isFinite(parsed['amount'])
        ? (parsed['amount'] as number)
        : null;
    const base = {
      readable: true,
      amount,
      currency: textOf(parsed['currency']).toUpperCase().slice(0, 8),
      date: textOf(parsed['date']),
      method: textOf(parsed['method']),
      reference: textOf(parsed['reference']),
      payee: textOf(parsed['payee']),
    };
    return { ...base, flag: flagOf(base, payee) };
  } catch {
    return unreadable();
  }
}

/** Fetch the receipt's bytes. The media endpoint answers with the bytes, or
 *  with a JSON document carrying the download url, which is followed once. */
async function downloadProof(
  env: ProofEnv,
  mediaId: string,
  fetchFn: typeof fetch
): Promise<Uint8Array | null> {
  const headers = { Authorization: `Bearer ${env.WA_ACCESS_TOKEN}` };
  const meta = await fetchFn(`${GRAPH}/${mediaId}`, { headers });
  if (!meta.ok) return null;
  const buf = new Uint8Array(await meta.arrayBuffer());
  if (buf.length === 0) return null;
  let url: string | null = null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(buf)) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const u = (parsed as Record<string, unknown>)['url'];
      if (typeof u === 'string' && u !== '') url = u;
    }
  } catch {
    /* not JSON: the body is the receipt itself */
  }
  const raw = url ? await fetchFn(url, { headers }) : null;
  if (url) {
    if (!raw || !raw.ok) return null;
    const bytes = new Uint8Array(await raw.arrayBuffer());
    return bytes.length > 0 ? bytes : null;
  }
  return buf;
}

const FLAG_TEXT: Record<Lang, Record<string, string>> = {
  es: {
    unreadable: 'no pude leer el comprobante',
    'no-amount': 'no se ve el monto',
    'bad-currency': 'moneda distinta de COP/USD',
    'amount-mismatch': 'monto distinto al esperado',
    'payee-mismatch': 'beneficiario distinto al esperado',
  },
  en: {
    unreadable: 'the receipt could not be read',
    'no-amount': 'no amount visible',
    'bad-currency': 'currency other than COP/USD',
    'amount-mismatch': 'amount differs from expected',
    'payee-mismatch': 'payee differs from expected',
  },
};

function operatorText(
  lang: Lang,
  code: string,
  st: BookingState,
  proof: PaymentProof
): string {
  const amount =
    proof.amount !== null && proof.currency
      ? proof.amount + ' ' + proof.currency
      : lang === 'es'
        ? 'monto no legible'
        : 'amount unreadable';
  const flag = proof.flag ? ' ⚠ ' + (FLAG_TEXT[lang][proof.flag] ?? proof.flag) + '.' : '';
  const who = st.name ? st.name + ' +' + st.phone : '+' + st.phone;
  const head =
    lang === 'es'
      ? 'comprobante de ' + who
      : 'receipt from ' + who;
  const confirm = lang === 'es' ? 'Confirma con: confirmar ' : 'Confirm with: confirmar ';
  return (
    'UniverLab [' + code + '] · ' + head + ': ' +
    serviceLabel(lang, st.service) + ' ' + formatSlot(st.start ?? '', lang) +
    ' — ' + amount + ', ' + (proof.date || '—') + ', ' + (proof.method || '—') +
    ', ref ' + (proof.reference || '—') + ', ' +
    (lang === 'es' ? 'beneficiario ' : 'payee ') + (proof.payee || '—') + '.' +
    flag + ' ' + confirm + code
  ).slice(0, 900);
}

/** Read a held booking's receipt with the vision model and forward the file
 *  to the operator next to the extraction summary. The proof image is not
 *  stored after it is forwarded; the extraction returns with the result so
 *  the caller keeps it on the booking. Resolves to null when the receipt
 *  could not be downloaded or read, so the caller keeps today's handoff. */
export async function readProof(
  env: ProofEnv,
  st: BookingState,
  media: ProofMedia,
  cfg: ProofConfig,
  payee: string,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<{ operatorText: string; clientText: string; proof: PaymentProof } | null> {
  try {
    const bytes = await downloadProof(env, media.id, fetchFn);
    if (bytes === null) return null;
    const res = await env.AI.run(cfg.model, {
      ...cfg.options,
      image: [...bytes],
      prompt: PROMPT,
    });
    const proof = parseProof(res, payee);
    const operator = env.OPERATOR_PHONE.replace(/\D/g, '');
    const kind = media.kind === 'image' ? 'image' : 'document';
    try {
      await sendMedia(
        env,
        operator,
        kind,
        bytes,
        media.mime ?? (kind === 'image' ? 'image/jpeg' : 'application/pdf'),
        kind === 'image' ? 'comprobante.jpg' : 'comprobante.pdf',
        fetchFn
      );
    } catch {
      /* the summary still goes out even when the forward fails */
    }
    return { operatorText: operatorText(st.lang, code, st, proof), clientText: PROOF_RECEIVED[st.lang], proof };
  } catch {
    return null;
  }
}
