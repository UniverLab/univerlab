/** @jest-environment node */
import { markRead, parseInbound, verifySignature } from '../src/meta';

const SEND_ENV = { WA_ACCESS_TOKEN: 'token', WA_PHONE_NUMBER_ID: 'phone-id' };

async function sign(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return 'sha256=' + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

test('accepts a body signed with the app secret', async () => {
  const body = '{"object":"whatsapp_business_account"}';
  await expect(verifySignature(body, await sign(body, 'topsecret'), 'topsecret')).resolves.toBe(true);
});

test('rejects a wrong, missing or malformed signature', async () => {
  const body = '{"object":"whatsapp_business_account"}';
  await expect(verifySignature(body, await sign('{"other":1}', 'topsecret'), 'topsecret')).resolves.toBe(
    false
  );
  await expect(verifySignature(body, null, 'topsecret')).resolves.toBe(false);
  await expect(verifySignature(body, 'md5=abc', 'topsecret')).resolves.toBe(false);
});

test('parses text, media and contact names', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: '15551234567', profile: { name: 'Ada' } }],
              messages: [
                { id: 'wamid.1', from: '15551234567', timestamp: '1700000001', type: 'text', text: { body: 'Hola' } },
                {
                  id: 'wamid.2',
                  from: '15551234567',
                  timestamp: '1700000002',
                  type: 'image',
                  image: { id: 'media-9', mime_type: 'image/jpeg' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const inbound = parseInbound(payload);
  expect(inbound).toHaveLength(2);
  expect(inbound[0]).toMatchObject({ id: 'wamid.1', from: '15551234567', type: 'text', text: 'Hola', name: 'Ada' });
  expect(inbound[0].timestamp).toBe(1700000001);
  expect(inbound[1]).toMatchObject({
    id: 'wamid.2',
    from: '15551234567',
    type: 'image',
    mediaId: 'media-9',
    mime: 'image/jpeg',
    name: 'Ada',
  });
});

test('markRead rides the typing indicator on the read receipt', async () => {
  const bodies: unknown[] = [];
  global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
    bodies.push(JSON.parse(String((init as { body: string }).body)));
    return { ok: true };
  }) as never;

  await expect(markRead(SEND_ENV, 'wamid.1')).resolves.toBe(true);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    status: 'read',
    message_id: 'wamid.1',
    typing_indicator: { type: 'text' },
  });
});

test('markRead retries the plain receipt when the API rejects the typing field', async () => {
  const bodies: unknown[] = [];
  global.fetch = jest.fn(async (_url: unknown, init: unknown) => {
    const body = JSON.parse(String((init as { body: string }).body));
    bodies.push(body);
    return { ok: !('typing_indicator' in (body as Record<string, unknown>)) };
  }) as never;

  await expect(markRead(SEND_ENV, 'wamid.2')).resolves.toBe(true);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toMatchObject({ status: 'read', message_id: 'wamid.2' });
  expect(bodies[1]).not.toHaveProperty('typing_indicator');
});

test('markRead reports failure when the network does', async () => {
  global.fetch = jest.fn(async () => {
    throw new Error('down');
  }) as never;

  await expect(markRead(SEND_ENV, 'wamid.3')).resolves.toBe(false);
});

test('ignores status updates and malformed payloads', () => {
  const statuses = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.3' }] } }] }] };
  expect(parseInbound(statuses)).toEqual([]);
  for (const bad of [{}, null, 'x', 42, []]) {
    expect(parseInbound(bad)).toEqual([]);
  }
});
