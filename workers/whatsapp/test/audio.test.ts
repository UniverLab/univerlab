/** @jest-environment node */
import {
  DEFAULT_VOICE_MAX_SECONDS,
  DEFAULT_VOICE_MODEL,
  transcribe,
  voiceConfig,
  VOICE_HANDOFF,
} from '../src/audio';

const CFG = { model: 'voice-model', options: {}, maxSeconds: 180 };

function audioBytes(): Uint8Array {
  return new TextEncoder().encode('fake-audio-bytes');
}

function response(body: Uint8Array, ok = true): Response {
  return {
    ok,
    arrayBuffer: async () => body.buffer as ArrayBuffer,
  } as Response;
}

function stubFetch(res: Response): jest.Mock {
  return jest.fn(async () => res);
}

function env(aiRun: jest.Mock) {
  return { WA_ACCESS_TOKEN: 'token', AI: { run: aiRun } };
}

test('voiceConfig falls back to the whisper default and 180 seconds', () => {
  expect(voiceConfig({})).toEqual({ model: DEFAULT_VOICE_MODEL, options: {}, maxSeconds: 180 });
  expect(DEFAULT_VOICE_MODEL).toBe('@cf/openai/whisper');
  expect(DEFAULT_VOICE_MAX_SECONDS).toBe(180);
});

test('voiceConfig reads the deploy variables, ignoring malformed values', () => {
  expect(
    voiceConfig({
      VOICE_MODEL: '  @cf/openai/whisper-large-v3-turbo  ',
      VOICE_MODEL_OPTIONS: '{"foo":1}',
      VOICE_MAX_SECONDS: '60',
    })
  ).toEqual({ model: '@cf/openai/whisper-large-v3-turbo', options: { foo: 1 }, maxSeconds: 60 });
  expect(voiceConfig({ VOICE_MODEL_OPTIONS: 'not-json', VOICE_MAX_SECONDS: 'soon' })).toEqual({
    model: DEFAULT_VOICE_MODEL,
    options: {},
    maxSeconds: 180,
  });
});

test('the handoff copy tells the client a person will listen', () => {
  expect(VOICE_HANDOFF.es).toContain('Una persona del laboratorio la escuchará');
  expect(VOICE_HANDOFF.en).toContain('Someone at the lab will listen');
});

test('transcribe returns the trimmed transcript and never the audio', async () => {
  const aiRun = jest.fn(async () => ({ text: ' hola ' }));
  const fetchFn = stubFetch(response(audioBytes()));
  await expect(transcribe(env(aiRun), CFG, 'media-1', fetchFn as never)).resolves.toEqual({
    ok: true,
    text: 'hola',
  });
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(fetchFn.mock.calls[0][0]).toBe('https://graph.facebook.com/v25.0/media-1');
  const sent = aiRun.mock.calls[0][1] as { audio: unknown };
  expect(sent.audio).toBeInstanceOf(Uint8Array);
  expect(aiRun).toHaveBeenCalledWith('voice-model', { audio: sent.audio });
});

test('transcribe merges the configured model options into the request', async () => {
  const aiRun = jest.fn(async () => ({ text: 'hola' }));
  await transcribe(env(aiRun), { ...CFG, options: { foo: 1 } }, 'media-1', stubFetch(
    response(audioBytes())
  ) as never);
  expect(aiRun).toHaveBeenCalledWith('voice-model', { foo: 1, audio: expect.any(Uint8Array) });
});

test('transcribe follows the media document url once', async () => {
  const audio = audioBytes();
  const meta = new TextEncoder().encode(JSON.stringify({ url: 'https://cdn.example/audio.ogg' }));
  const aiRun = jest.fn(async () => ({ text: 'hola' }));
  const fetchFn = jest.fn(async (url: string) =>
    String(url).startsWith('https://cdn.example') ? response(audio) : response(meta)
  );
  await expect(transcribe(env(aiRun), CFG, 'media-1', fetchFn as never)).resolves.toEqual({
    ok: true,
    text: 'hola',
  });
  expect(fetchFn).toHaveBeenCalledTimes(2);
});

test('transcribe fails closed on download and transcription failures', async () => {
  const ok = stubFetch(response(audioBytes()));
  // The endpoint refuses.
  await expect(
    transcribe(env(jest.fn()), CFG, 'media-1', stubFetch(response(audioBytes(), false)) as never)
  ).resolves.toEqual({ ok: false });
  // The endpoint answers with no body.
  await expect(
    transcribe(
      env(jest.fn()),
      CFG,
      'media-1',
      stubFetch(response(new Uint8Array(0))) as never
    )
  ).resolves.toEqual({ ok: false });
  // The download throws.
  const throwing = jest.fn(async () => {
    throw new Error('down');
  });
  await expect(transcribe(env(jest.fn()), CFG, 'media-1', throwing as never)).resolves.toEqual({
    ok: false,
  });
  // The model throws, answers nothing, or answers blank.
  await expect(
    transcribe(
      env(
        jest.fn(async () => {
          throw new Error('stt');
        })
      ),
      CFG,
      'media-1',
      ok as never
    )
  ).resolves.toEqual({ ok: false });
  await expect(
    transcribe(env(jest.fn(async () => ({}))), CFG, 'media-1', ok as never)
  ).resolves.toEqual({ ok: false });
  await expect(
    transcribe(env(jest.fn(async () => ({ text: '   ' }))), CFG, 'media-1', ok as never)
  ).resolves.toEqual({ ok: false });
});
