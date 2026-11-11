/** @jest-environment node */
import { parseInbound, verifySignature } from '../src/meta';

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

test('ignores status updates and malformed payloads', () => {
  const statuses = { entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.3' }] } }] }] };
  expect(parseInbound(statuses)).toEqual([]);
  for (const bad of [{}, null, 'x', 42, []]) {
    expect(parseInbound(bad)).toEqual([]);
  }
});
