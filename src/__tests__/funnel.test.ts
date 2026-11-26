/**
 * Cookieless funnel at the edge: landings skip assets, twins and scanner
 * probes and write one aggregate point with sanitized UTM; `POST
 * /api/event` enforces its schema and never throws without FUNNEL.
 * Every test asserts a write count or a status the gate depends on.
 *
 * @jest-environment node
 *
 * Node rather than jsdom: the edge modules run on `Request`/`Response`
 * and never touch the DOM.
 */

import { onRequestPost } from '../../functions/api/event';
import { recordLanding } from '../../functions/funnel-landing';

interface Point {
  indexes: string[];
  blobs: string[];
  doubles: number[];
}

function funnel() {
  const points: Point[] = [];
  const env = {
    FUNNEL: {
      writeDataPoint: jest.fn((p: Point) => {
        points.push(p);
      }),
    },
  };
  return { env, points };
}

function get(url: string, method = 'GET'): Request {
  return new Request(url, { method });
}

function post(body: unknown, raw?: string): Request {
  return new Request('https://univerlab.org/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });
}

describe('recordLanding', () => {
  it('writes once with sanitized UTM and a normalized path', () => {
    const { env, points } = funnel();
    recordLanding(
      get('https://univerlab.org/Canopy/?utm_source=X-News&utm_medium=a"><b&utm_campaign=launch'),
      env,
    );
    expect(points).toHaveLength(1);
    const [p] = points;
    expect(p.indexes).toEqual(['landing']);
    // Uppercase path lowercased, trailing slash stripped; the injection
    // in utm_medium dropped, the valid fields kept.
    expect(p.blobs).toEqual([
      'landing',
      '',
      '/canopy',
      'x-news',
      '',
      'launch',
      '',
      '',
    ]);
    expect(p.doubles).toEqual([1]);
  });

  it('carries the Cloudflare country and drops invalid UTM-only loads', () => {
    const { env, points } = funnel();
    const req = get('https://univerlab.org/?utm_source=x');
    (req as unknown as { cf: { country: string } }).cf = { country: 'CO' };
    recordLanding(req, env);
    expect(points).toHaveLength(1);
    expect(points[0].blobs[7]).toBe('CO');

    recordLanding(get('https://univerlab.org/?utm_source=a b'), env);
    recordLanding(get('https://univerlab.org/'), env);
    expect(points).toHaveLength(1);
  });

  it('skips assets, markdown twins and scanner probes', () => {
    const { env, points } = funnel();
    recordLanding(get('https://univerlab.org/_astro/chunk.js?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/canopy/index.md?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/feed.json?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/favicon.ico?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/wp-admin/?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/es/login/?utm_source=x'), env);
    expect(points).toHaveLength(0);
  });

  it('skips machine endpoints but keeps pages with similar slugs', () => {
    const { env, points } = funnel();
    recordLanding(get('https://univerlab.org/api/event?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/mcp?utm_source=x'), env);
    recordLanding(get('https://univerlab.org/mcp/server-card?utm_source=x'), env);
    expect(points).toHaveLength(0);
    // A page slug that merely starts with the same letters still records.
    recordLanding(get('https://univerlab.org/mcplay?utm_source=x'), env);
    expect(points).toHaveLength(1);
    expect(points[0].blobs[2]).toBe('/mcplay');
  });

  it('never throws and never writes without the binding', () => {
    expect(() =>
      recordLanding(get('https://univerlab.org/?utm_source=x'), {}),
    ).not.toThrow();
    const { env } = funnel();
    const malformed = { method: 'GET', url: '::not a url::' } as unknown as Request;
    expect(() => recordLanding(malformed, env)).not.toThrow();
  });
});

describe('POST /api/event', () => {
  it('400s on unknown events, oversized bodies, bad tools and bad JSON', async () => {
    const { env } = funnel();
    expect((await onRequestPost({ request: post({ event: 'nope' }), env })).status).toBe(400);
    expect(
      (await onRequestPost({ request: post({ event: 'copy_install' }), env })).status,
    ).toBe(400);
    expect(
      (await onRequestPost({ request: post({ event: 'copy_install', tool: 'A B' }), env }))
        .status,
    ).toBe(400);
    expect(
      (await onRequestPost({ request: post(null, 'x'.repeat(2049)), env })).status,
    ).toBe(400);
    expect((await onRequestPost({ request: post(null, '{oops'), env })).status).toBe(400);
  });

  it('400s on a body that is small in characters but large in bytes', async () => {
    const { env, points } = funnel();
    // 1 100 multibyte chars: ~1.1k chars but ~2.2k bytes — a char count
    // would let it through, the byte cap must reject it.
    const raw = `{"event":"workbench_visit","pad":"${'é'.repeat(1100)}"}`;
    expect(raw.length).toBeLessThan(2048);
    expect(new TextEncoder().encode(raw).length).toBeGreaterThan(2048);
    const res = await onRequestPost({ request: post(null, raw), env });
    expect(res.status).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('204s and writes one aggregate point on a valid action', async () => {
    const { env, points } = funnel();
    const req = post({
      event: 'copy_install',
      tool: 'canopy',
      path: '/Canopy/',
      utm_source: 'x',
      utm_medium: 'A"><B',
      gclid: 'abc',
    });
    (req as unknown as { cf: { country: string } }).cf = { country: 'CO' };
    const res = await onRequestPost({ request: req, env });
    expect(res.status).toBe(204);
    expect(points).toHaveLength(1);
    // Path normalized; the injection and the ad id never stored.
    expect(points[0]).toEqual({
      indexes: ['copy_install'],
      blobs: ['copy_install', 'canopy', '/canopy', 'x', '', '', '', 'CO'],
      doubles: [1],
    });
  });

  it('204s and writes one aggregate point on a valid page_view', async () => {
    const { env, points } = funnel();
    const req = post({
      event: 'page_view',
      path: '/Texforge/?ref=home#top',
      utm_source: 'x',
      utm_campaign: 'launch',
      gclid: 'abc',
    });
    const res = await onRequestPost({ request: req, env });
    expect(res.status).toBe(204);
    expect(points).toHaveLength(1);
    // Path normalized (query/hash stripped, lowercased); the ad id dropped.
    expect(points[0]).toEqual({
      indexes: ['page_view'],
      blobs: ['page_view', '', '/texforge', 'x', '', 'launch', '', ''],
      doubles: [1],
    });
  });

  it('400s a page_view with an invalid path, just like the other events', async () => {
    const { env, points } = funnel();
    expect(
      (await onRequestPost({ request: post({ event: 'page_view', path: 'no-slash' }), env }))
        .status,
    ).toBe(400);
    expect(
      (await onRequestPost({ request: post({ event: 'page_view', path: `/${'a'.repeat(256)}` }), env }))
        .status,
    ).toBe(400);
    expect(points).toHaveLength(0);
  });

  it('204s with no write when the FUNNEL binding is absent', async () => {
    const res = await onRequestPost({
      request: post({ event: 'workbench_visit', utm_source: 'x' }),
      env: {},
    });
    expect(res.status).toBe(204);
  });
});
