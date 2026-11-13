/** @jest-environment node */
import {
  DEFAULT_PROOF_MODEL,
  EXPECTED_COP,
  EXPECTED_USD,
  forwardUnread,
  isProofMedia,
  parseProof,
  PROOF_RECEIVED,
  proofConfig,
  readProof,
  type ProofMedia,
} from '../src/proof';

const CFG = { model: 'proof-model', options: {} };

function bytes(): Uint8Array {
  return new TextEncoder().encode('fake-receipt-bytes');
}

function downloadOk(body: Uint8Array = bytes()): Response {
  return {
    ok: true,
    arrayBuffer: async () => body.buffer as ArrayBuffer,
  } as Response;
}

function jsonOf(payload: unknown, ok = true): Response {
  return {
    ok,
    json: async () => payload,
    arrayBuffer: async () => new Uint8Array().buffer as ArrayBuffer,
  } as Response;
}

function envOf(aiRun: jest.Mock) {
  return {
    WA_ACCESS_TOKEN: 'token',
    WA_PHONE_NUMBER_ID: 'phone-id',
    OPERATOR_PHONE: '+57 300 999 8888',
    AI: { run: aiRun },
  };
}

function held() {
  return {
    service: 'consultation' as const,
    lang: 'es' as const,
    offered: [] as string[],
    phase: 'held' as const,
    createdAt: 1767225600000,
    phone: '573001112222',
    name: 'Ana',
    brief: [] as string[],
    start: '2026-11-18T20:00:00.000Z',
  };
}

const MEDIA: ProofMedia = { id: 'media-9', kind: 'image', mime: 'image/jpeg' };

function stubFetch(responses: Response[]): jest.Mock {
  return jest.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next;
  });
}

test('proofConfig falls back to the vision default with no options', () => {
  expect(proofConfig({})).toEqual({ model: DEFAULT_PROOF_MODEL, options: {} });
  expect(DEFAULT_PROOF_MODEL).toBe('@cf/meta/llama-3.2-11b-vision-instruct');
});

test('proofConfig reads the deploy variables, ignoring malformed values', () => {
  expect(
    proofConfig({ PROOF_MODEL: '  custom-model  ', PROOF_MODEL_OPTIONS: '{"foo":1}' })
  ).toEqual({ model: 'custom-model', options: { foo: 1 } });
  expect(proofConfig({ PROOF_MODEL_OPTIONS: 'not-json' })).toEqual({
    model: DEFAULT_PROOF_MODEL,
    options: {},
  });
});

test('isProofMedia accepts images and PDF documents only', () => {
  expect(isProofMedia('image', 'image/jpeg')).toBe(true);
  expect(isProofMedia('image')).toBe(true);
  expect(isProofMedia('document', 'application/pdf')).toBe(true);
  expect(isProofMedia('document', 'application/msword')).toBe(false);
  expect(isProofMedia('audio', 'audio/ogg')).toBe(false);
  expect(isProofMedia('text')).toBe(false);
});

test('the client copy never says the payment is valid', () => {
  expect(PROOF_RECEIVED.es).toContain('una persona');
  expect(PROOF_RECEIVED.en).toContain('lab');
  for (const text of Object.values(PROOF_RECEIVED)) {
    expect(text.toLowerCase()).not.toContain('valid');
    expect(text.toLowerCase()).not.toContain('válido');
    expect(text.toLowerCase()).not.toContain('valido');
  }
});

test('parseProof flags the expected COP amount as clean', () => {
  const proof = parseProof(
    { response: JSON.stringify({ amount: EXPECTED_COP, currency: 'COP', date: '2026-11-10', method: 'Bre-B', reference: '1', payee: 'Lab' }) },
    'Lab'
  );
  expect(proof).toMatchObject({ readable: true, amount: EXPECTED_COP, currency: 'COP', flag: '' });
});

test('parseProof flags a wrong amount and an unreadable model answer', () => {
  expect(
    parseProof({ response: JSON.stringify({ amount: 100, currency: 'COP' }) }, '').flag
  ).toBe('amount-mismatch');
  expect(parseProof({ response: 'not json at all' }, '').flag).toBe('unreadable');
  expect(parseProof({ choices: [{ message: { content: '[]' } }] }, '').flag).toBe('unreadable');
});

test('parseProof flags a missing amount, a bad currency and a payee mismatch', () => {
  expect(parseProof({ response: '{}' }, '').flag).toBe('no-amount');
  expect(parseProof({ response: JSON.stringify({ amount: 45, currency: 'EUR' }) }, '').flag).toBe(
    'bad-currency'
  );
  expect(
    parseProof(
      { response: JSON.stringify({ amount: EXPECTED_COP, currency: 'COP', payee: 'Otro' }) },
      'Lab'
    ).flag
  ).toBe('payee-mismatch');
});

test('readProof returns the operator summary and client copy for a COP receipt', async () => {
  const aiRun = jest.fn(async () => ({
    response: JSON.stringify({
      amount: EXPECTED_COP,
      currency: 'COP',
      date: '2026-11-10',
      method: 'Bre-B',
      reference: 'ABC123',
      payee: 'Laboratorio UniverLab',
    }),
  }));
  const fetchFn = stubFetch([downloadOk(), jsonOf({ id: 'mid-1' }), jsonOf({})]);
  const res = await readProof(envOf(aiRun), held(), MEDIA, CFG, 'Laboratorio UniverLab', 'ab12', fetchFn as never);
  expect(res).not.toBeNull();
  expect(res!.proof).toMatchObject({ readable: true, amount: EXPECTED_COP, currency: 'COP', flag: '' });
  expect(res!.operatorText).not.toContain('UniverLab [');
  expect(res!.operatorText).toContain('comprobante');
  expect(res!.operatorText).toContain('/confirm ab12');
  expect(res!.operatorText).not.toContain('⚠');
  expect(res!.clientText).toBe(PROOF_RECEIVED.es);
  // The forward uploaded the bytes and sent the returned media id.
  const urls = (fetchFn as jest.Mock).mock.calls.map((call) => String(call[0]));
  expect(urls[0]).toBe('https://graph.facebook.com/v25.0/media-9');
  expect(urls[1]).toBe('https://graph.facebook.com/v25.0/phone-id/media');
  const sent = JSON.parse(String((fetchFn as jest.Mock).mock.calls[2][1].body));
  expect(sent).toMatchObject({ to: '573009998888', type: 'image', image: { id: 'mid-1' } });
  // The vision model got the receipt bytes inline.
  expect(aiRun).toHaveBeenCalledWith('proof-model', expect.objectContaining({ image: expect.any(Array) }));
});

test('readProof accepts the USD price over PayPal', async () => {
  const aiRun = jest.fn(async () => ({
    response: JSON.stringify({ amount: EXPECTED_USD, currency: 'USD', method: 'PayPal' }),
  }));
  const fetchFn = stubFetch([downloadOk(), jsonOf({ id: 'mid-2' }), jsonOf({})]);
  const res = await readProof(envOf(aiRun), held(), MEDIA, CFG, '', 'ab12', fetchFn as never);
  expect(res!.proof.flag).toBe('');
  expect(res!.operatorText).not.toContain('⚠');
});

test('readProof flags a wrong amount instead of confirming anything', async () => {
  const aiRun = jest.fn(async () => ({
    response: JSON.stringify({ amount: 1, currency: 'COP', method: 'Bre-B' }),
  }));
  const fetchFn = stubFetch([downloadOk(), jsonOf({ id: 'mid-3' }), jsonOf({})]);
  const res = await readProof(envOf(aiRun), held(), MEDIA, CFG, '', 'ab12', fetchFn as never);
  expect(res!.proof.flag).toBe('amount-mismatch');
  expect(res!.operatorText).toContain('⚠');
  expect(res!.operatorText).toContain('/confirm ab12');
  expect(res!.clientText).toBe(PROOF_RECEIVED.es);
});

test('readProof still briefs the operator when nothing could be read', async () => {
  const aiRun = jest.fn(async () => ({ response: 'no numbers here' }));
  const fetchFn = stubFetch([downloadOk(), jsonOf({ id: 'mid-4' }), jsonOf({})]);
  const res = await readProof(envOf(aiRun), held(), MEDIA, CFG, '', 'ab12', fetchFn as never);
  expect(res!.proof.flag).toBe('unreadable');
  expect(res!.operatorText).toContain('⚠');
  expect(res!.clientText).toBe(PROOF_RECEIVED.es);
});

test('readProof resolves to null when the download fails', async () => {
  const aiRun = jest.fn(async () => ({ response: '{}' }));
  const fetchFn = stubFetch([{ ok: false } as Response]);
  await expect(
    readProof(envOf(aiRun), held(), MEDIA, CFG, '', 'ab12', fetchFn as never)
  ).resolves.toBeNull();
  expect(aiRun).not.toHaveBeenCalled();
});

function guardDeniedEnv(aiRun: jest.Mock) {
  const base = envOf(aiRun);
  return {
    ...base,
    REGISTRY: {
      idFromName: (n: string) => n,
      get: () => ({
        fetch: jest.fn(async () => new Response(JSON.stringify({ send: false, firstOver: false, waiting: 5 }), { status: 200 })),
      }),
    },
  };
}

test('readProof drops the receipt file past the hourly operator cap but keeps the summary', async () => {
  const aiRun = jest.fn(async () => ({
    response: JSON.stringify({ amount: EXPECTED_COP, currency: 'COP' }),
  }));
  const fetchFn = stubFetch([downloadOk(), jsonOf({ id: 'mid-1' }), jsonOf({})]);
  const res = await readProof(guardDeniedEnv(aiRun), held(), MEDIA, CFG, '', 'ab12', fetchFn as never);
  expect(res).not.toBeNull();
  expect(res!.operatorText).not.toContain('UniverLab [');
  // Only the download ran: no media upload/messages send past the cap.
  expect((fetchFn as jest.Mock).mock.calls).toHaveLength(1);
  expect(aiRun).toHaveBeenCalledTimes(1);
});

test('forwardUnread drops the receipt file past the hourly operator cap but keeps the summary', async () => {
  const fetchFn = stubFetch([downloadOk(), jsonOf({ id: 'mid-9' }), jsonOf({})]);
  const res = await forwardUnread(guardDeniedEnv(jest.fn()) as never, held(), MEDIA, 'ab12', fetchFn as never);
  expect(res).not.toBeNull();
  expect(res!.operatorText).not.toContain('UniverLab [');
  expect((fetchFn as jest.Mock).mock.calls).toHaveLength(1);
});
