/** @jest-environment node */
jest.mock(
  'cloudflare:workers',
  () => ({
    DurableObject: class {
      ctx: unknown;
      env: unknown;
      constructor(ctx: unknown, env: unknown) {
        this.ctx = ctx;
        this.env = env;
      }
    },
  }),
  { virtual: true }
);

jest.mock('../src/daybook', () => ({ runAgenda: jest.fn(async () => undefined) }));

import worker from '../src/index';
import { runAgenda } from '../src/daybook';

test('the Cron Trigger hands every scheduled wake to the agenda run', async () => {
  const waits: Array<Promise<unknown>> = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) } as unknown as ExecutionContext;
  const env = {};
  const at = Date.UTC(2026, 10, 9, 11, 30);

  await worker.scheduled({ scheduledTime: at }, env as never, ctx);
  await Promise.all(waits);

  expect(runAgenda).toHaveBeenCalledTimes(1);
  expect(runAgenda).toHaveBeenCalledWith(env, at);
});
