// Structural schema rules: one broken rule per case, pinning the JSON path
// the validator reports. Covers the lines the suite otherwise never touches:
// bad/missing strings, pattern/date/email/uri formats, non-object nested
// records and arrays, unknown vs x- keys, bad/empty arrays, chart/code/table
// blocks, extensions, the root shape, and every top-level section.
import { validateAgainstSchema } from '../lib/audit/validate-schema.ts';

const SHA = 'a'.repeat(64);

function validDoc(): Record<string, unknown> {
  return {
    contract: 'univerlab.audit/1',
    meta: {
      title: 'T',
      client: { name: 'C', url: 'https://example.com' },
      language: 'en',
      auditors: [{ name: 'A', url: 'https://example.com/a' }],
      auditPeriod: { start: '2026-01-05', end: '2026-01-09' },
      version: '1.0',
      status: 'draft',
      scope: 'S',
    },
    visibility: 'public',
    cover: { layout: { type: 'single', ratio: '2-1', columns: 2 }, background: 'bg' },
    assets: [{ id: 'd1', path: 'assets/data.json', kind: 'data', title: 'D', alt: 'alt', bytes: 8, sha256: SHA }],
    annexes: [{ id: 'n1', title: 'N', description: 'D', instructions: 'I', assets: ['d1'], visibility: 'public' }],
    deliverables: {
      report: 'd1',
      bundle: 'd1',
      repository: 'https://example.com/r',
      repositoryPublic: true,
      signedDocId: 'a'.repeat(32),
    },
    findings: [{
      id: 'F-01', title: 'T', severity: 'high', likelihood: 3, impact: 3, area: 'a',
      status: 'open', summary: 'S', evidence: [{ type: 'asset', id: 'd1' }],
      recommendation: 'R', effort: 'small', cost: { amount: 10, currency: 'USD' }, fixedIn: '1.1',
    }],
    sources: [{ id: 's1', title: 'S', url: 'https://example.com/s', publisher: 'P', accessed: '2026-01-06' }],
    glossary: [{ term: 't1', definition: 'D' }],
    sections: [{
      id: 'sec', title: 'S', navLabel: 'N', layout: { type: 'single' },
      blocks: [{ type: 'prose', markdown: 'hello' }],
    }],
  };
}

function pathsOf(doc: unknown): string[] {
  return validateAgainstSchema(doc).map((i) => i.path);
}

function mutate(mut: (doc: Record<string, unknown>) => void): string[] {
  const doc = validDoc();
  mut(doc);
  return pathsOf(doc);
}

describe('validateAgainstSchema accepts the full valid document', () => {
  it('reports no issues', () => {
    expect(validateAgainstSchema(validDoc())).toEqual([]);
  });

  it('allows x- extension keys at the root, in meta and on blocks', () => {
    const doc = validDoc();
    (doc as Record<string, unknown>)['x-tool'] = 'agent';
    ((doc['meta'] as Record<string, unknown>)['x-note'] as unknown) = 1;
    const blocks = ((doc['sections'] as Record<string, unknown>[])[0]['blocks'] as Record<string, unknown>[]);
    blocks[0]['x-note'] = 1;
    expect(validateAgainstSchema(doc)).toEqual([]);
  });
});

describe('validateAgainstSchema root shape', () => {
  it('rejects a non-object root', () => {
    expect(pathsOf(null)).toContain('$');
    expect(pathsOf([1])).toContain('$');
    expect(pathsOf('doc')).toContain('$');
  });

  it('reports the unknown root key with its own path', () => {
    expect(mutate((d) => { d['bogus'] = 1; })).toContain('$.bogus');
  });

  it('rejects the wrong contract', () => {
    expect(mutate((d) => { d['contract'] = 'univerlab.audit/2'; })).toContain('$.contract');
  });

  it('rejects a missing required top-level property', () => {
    expect(mutate((d) => { delete d['meta']; })).toContain('$');
  });

  it('rejects a bad visibility enum', () => {
    expect(mutate((d) => { d['visibility'] = 'secret'; })).toContain('$.visibility');
  });

  it('rejects a bad accent enum', () => {
    expect(mutate((d) => { d['accent'] = 'nope'; })).toContain('$.accent');
  });
});

describe('validateAgainstSchema strings, patterns and formats', () => {
  it.each([
    ['empty title', (d: Record<string, unknown>) => { ((d['meta'] as Record<string, unknown>)['title']) = ''; }, '$.meta.title'],
    ['missing title', (d: Record<string, unknown>) => { delete (d['meta'] as Record<string, unknown>)['title']; }, '$.meta'],
    ['bad language', (d: Record<string, unknown>) => { ((d['meta'] as Record<string, unknown>)['language']) = 'fr'; }, '$.meta.language'],
    ['bad status', (d: Record<string, unknown>) => { ((d['meta'] as Record<string, unknown>)['status']) = 'wip'; }, '$.meta.status'],
    ['bad client url', (d: Record<string, unknown>) => { (((d['meta'] as Record<string, unknown>)['client']) as Record<string, unknown>)['url'] = 'not a url'; }, '$.meta.client.url'],
    ['bad auditor url', (d: Record<string, unknown>) => { (((d['meta'] as Record<string, unknown>)['auditors']) as Record<string, unknown>[])[0]['url'] = 'ftp-no-scheme?'; }, '$.meta.auditors[0].url'],
    ['bad period start', (d: Record<string, unknown>) => { (((d['meta'] as Record<string, unknown>)['auditPeriod']) as Record<string, unknown>)['start'] = '05/01/2026'; }, '$.meta.auditPeriod.start'],
    ['bad period end', (d: Record<string, unknown>) => { (((d['meta'] as Record<string, unknown>)['auditPeriod']) as Record<string, unknown>)['end'] = ''; }, '$.meta.auditPeriod.end'],
    ['bad asset id', (d: Record<string, unknown>) => { ((d['assets'] as Record<string, unknown>[])[0])['id'] = 'no spaces!'; }, '$.assets[0].id'],
    ['bad asset sha', (d: Record<string, unknown>) => { ((d['assets'] as Record<string, unknown>[])[0])['sha256'] = 'xyz'; }, '$.assets[0].sha256'],
    ['bad source url', (d: Record<string, unknown>) => { ((d['sources'] as Record<string, unknown>[])[0])['url'] = 'notaurl'; }, '$.sources[0].url'],
    ['bad source date', (d: Record<string, unknown>) => { ((d['sources'] as Record<string, unknown>[])[0])['accessed'] = 'yesterday'; }, '$.sources[0].accessed'],
  ])('reports %s at %s', (_name, mut, path) => {
    expect(mutate(mut)).toContain(path);
  });

  it('rejects a non-string where a string belongs', () => {
    expect(mutate((d) => { ((d['meta'] as Record<string, unknown>)['title']) = 42; })).toContain('$.meta.title');
  });

  it('rejects a bad currency and a non-number cost amount', () => {
    const p1 = mutate((d) => {
      ((((d['findings'] as Record<string, unknown>[])[0])['cost']) as Record<string, unknown>)['currency'] = 'usd';
    });
    expect(p1).toContain('$.findings[0].cost.currency');
    const p2 = mutate((d) => {
      ((((d['findings'] as Record<string, unknown>[])[0])['cost']) as Record<string, unknown>)['amount'] = 'ten';
    });
    expect(p2).toContain('$.findings[0].cost.amount');
  });
});

describe('validateAgainstSchema nested records and arrays', () => {
  it('rejects a non-object meta, client, period, cost, layout and block', () => {
    expect(mutate((d) => { d['meta'] = 'nope'; })).toContain('$.meta');
    expect(mutate((d) => { ((d['meta'] as Record<string, unknown>)['client']) = 7; })).toContain('$.meta.client');
    expect(mutate((d) => { ((d['meta'] as Record<string, unknown>)['auditPeriod']) = []; })).toContain('$.meta.auditPeriod');
    expect(mutate((d) => { (((d['findings'] as Record<string, unknown>[])[0])['cost']) = 'cheap'; })).toContain('$.findings[0].cost');
    expect(mutate((d) => { ((d['cover'] as Record<string, unknown>)['layout']) = 'wide'; })).toContain('$.cover.layout');
    expect(mutate((d) => {
      ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as unknown[])[0] = 'prose?';
    })).toContain('$.sections[0].blocks[0]');
  });

  it('flags unknown nested keys with their own path', () => {
    expect(mutate((d) => { ((d['meta'] as Record<string, unknown>)['zzz']) = 1; })).toContain('$.meta.zzz');
    expect(mutate((d) => { ((d['cover'] as Record<string, unknown>)['zzz']) = 1; })).toContain('$.cover.zzz');
    expect(mutate((d) => {
      const b = ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as Record<string, unknown>[])[0];
      b['zzz'] = 1;
    })).toContain('$.sections[0].blocks[0].zzz');
  });

  it('rejects a non-array assets/findings/sources/glossary/sections', () => {
    expect(mutate((d) => { d['assets'] = {}; })).toContain('$.assets');
    expect(mutate((d) => { d['findings'] = {}; })).toContain('$.findings');
    expect(mutate((d) => { d['sources'] = {}; })).toContain('$.sources');
    expect(mutate((d) => { d['glossary'] = 1; })).toContain('$.glossary');
  });

  it('rejects empty sections and empty section blocks', () => {
    expect(mutate((d) => { d['sections'] = []; })).toContain('$.sections');
    expect(mutate((d) => { ((d['sections'] as Record<string, unknown>[])[0]['blocks']) = []; })).toContain('$.sections[0].blocks');
    expect(mutate((d) => { ((d['sections'] as Record<string, unknown>[])[0]['blocks']) = 'x'; })).toContain('$.sections[0].blocks');
  });

  it('rejects empty auditors, empty annex assets and empty evidence', () => {
    expect(mutate((d) => { ((d['meta'] as Record<string, unknown>)['auditors']) = []; })).toContain('$.meta.auditors');
    expect(mutate((d) => { ((d['meta'] as Record<string, unknown>)['auditors']) = 'Ann'; })).toContain('$.meta.auditors');
    expect(mutate((d) => { ((d['annexes'] as Record<string, unknown>[])[0])['assets'] = []; })).toContain('$.annexes[0].assets');
    expect(mutate((d) => { (((d['findings'] as Record<string, unknown>[])[0])['evidence']) = []; })).toContain('$.findings[0].evidence');
  });

  it('rejects empty stats items, sources ids, timeline and stepper steps', () => {
    const withBlock = (block: Record<string, unknown>): string[] => mutate((d) => {
      ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as unknown[]) = [block];
    });
    expect(withBlock({ type: 'stats', items: [] })).toContain('$.sections[0].blocks[0].items');
    expect(withBlock({ type: 'sources', ids: [] })).toContain('$.sections[0].blocks[0].ids');
    expect(withBlock({ type: 'sources', ids: 's1' })).toContain('$.sections[0].blocks[0].ids');
    expect(withBlock({ type: 'timeline', steps: [] })).toContain('$.sections[0].blocks[0].steps');
    expect(withBlock({ type: 'stepper', steps: [] })).toContain('$.sections[0].blocks[0].steps');
    expect(withBlock({ type: 'table', columns: [], rows: [] })).toContain('$.sections[0].blocks[0].columns');
    expect(withBlock({ type: 'table', columns: ['a'], rows: 'x' })).toContain('$.sections[0].blocks[0].rows');
  });
});

describe('validateAgainstSchema enums, ints and filters', () => {
  it('rejects a bad layout type, ratio and out-of-range columns', () => {
    expect(mutate((d) => { ((d['cover'] as Record<string, unknown>)['layout'] as Record<string, unknown>)['type'] = 'masonry'; })).toContain('$.cover.layout.type');
    expect(mutate((d) => { ((d['cover'] as Record<string, unknown>)['layout'] as Record<string, unknown>)['ratio'] = '1-1'; })).toContain('$.cover.layout.ratio');
    expect(mutate((d) => { ((d['cover'] as Record<string, unknown>)['layout'] as Record<string, unknown>)['columns'] = 9; })).toContain('$.cover.layout.columns');
    expect(mutate((d) => { ((d['cover'] as Record<string, unknown>)['layout'] as Record<string, unknown>)['columns'] = 2.5; })).toContain('$.cover.layout.columns');
  });

  it('rejects a bad block span', () => {
    expect(mutate((d) => {
      const b = ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as Record<string, unknown>[])[0];
      b['span'] = 9;
    })).toContain('$.sections[0].blocks[0].span');
  });

  it('rejects bad severity/status filters on findingsTable', () => {
    const withBlock = (block: Record<string, unknown>): string[] => mutate((d) => {
      ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as unknown[]) = [block];
    });
    expect(withBlock({ type: 'findingsTable', severity: ['mild'] })).toContain('$.sections[0].blocks[0].severity[0]');
    expect(withBlock({ type: 'findingsTable', status: 'done' })).toContain('$.sections[0].blocks[0].status');
    expect(withBlock({ type: 'findingsTable', severity: 'high' })).toContain('$.sections[0].blocks[0].severity');
  });

  it('rejects a bad callout tone, timeline effort and missing finding fields', () => {
    const withBlock = (block: Record<string, unknown>): string[] => mutate((d) => {
      ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as unknown[]) = [block];
    });
    expect(withBlock({ type: 'callout', tone: 'loud', markdown: 'x' })).toContain('$.sections[0].blocks[0].tone');
    expect(withBlock({ type: 'timeline', steps: [{ title: 's', effort: 'huge' }] })).toContain('$.sections[0].blocks[0].steps[0].effort');
    expect(pathsOf({ sections: [{ id: 's', title: 't', layout: { type: 'single' }, blocks: [{ level: 1, text: 'x' }] }] })).toContain('$.sections[0].blocks[0]');
    expect(pathsOf({ sections: [{ id: 's', title: 't', layout: { type: 'single' }, blocks: [{ type: '' }] }] })).toContain('$.sections[0].blocks[0].type');
  });
});

describe('validateAgainstSchema chart, code and table blocks', () => {
  const withBlock = (block: Record<string, unknown>): string[] => mutate((d) => {
    ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as unknown[]) = [block];
  });

  it('needs a chart spec or dataAsset, and the spec must be an object', () => {
    expect(withBlock({ type: 'chart' })).toContain('$.sections[0].blocks[0]');
    expect(withBlock({ type: 'chart', spec: 'x' })).toContain('$.sections[0].blocks[0].spec');
    expect(withBlock({ type: 'chart', spec: { mark: 'bar' } })).not.toContain('$.sections[0].blocks[0].spec');
    expect(withBlock({ type: 'chart', dataAsset: 'd1' })).not.toContain('$.sections[0].blocks[0]');
  });

  it('needs a code source or sourceAsset, and the highlight must be line numbers', () => {
    expect(withBlock({ type: 'code', language: 'ts' })).toContain('$.sections[0].blocks[0]');
    expect(withBlock({ type: 'code', language: 'ts', source: 'x', highlight: 'two' })).toContain('$.sections[0].blocks[0].highlight');
    expect(withBlock({ type: 'code', language: 'ts', source: 'x', highlight: [0, 'a' as unknown, 3] })).toContain('$.sections[0].blocks[0].highlight[0]');
    expect(withBlock({ type: 'code', language: 'ts', source: 'x', highlight: [2] })).not.toContain('$.sections[0].blocks[0].highlight[0]');
  });

  it('checks table columns, rows and cells', () => {
    expect(withBlock({ type: 'table', columns: ['a', 1 as unknown], rows: [] })).toContain('$.sections[0].blocks[0].columns[1]');
    expect(withBlock({ type: 'table', columns: ['a'], rows: ['nope' as unknown] })).toContain('$.sections[0].blocks[0].rows[0]');
    expect(withBlock({ type: 'table', columns: ['a'], rows: [[{} as unknown]] })).toContain('$.sections[0].blocks[0].rows[0][0]');
    expect(withBlock({ type: 'table', columns: ['a'], rows: [['x', 1]] })).not.toContain('$.sections[0].blocks[0].rows[0][0]');
  });

  it('checks heading, quote, divider and annex details', () => {
    expect(withBlock({ type: 'heading', level: 9, text: 'x' })).toContain('$.sections[0].blocks[0].level');
    expect(withBlock({ type: 'quote', text: '' })).toContain('$.sections[0].blocks[0].text');
    expect(pathsOf({})).toContain('$');
    expect(mutate((d) => { ((d['annexes'] as Record<string, unknown>[])[0])['assets'] = [1]; })).toContain('$.annexes[0].assets[0]');
    expect(mutate((d) => { ((d['annexes'] as Record<string, unknown>[])[0])['visibility'] = 'secret'; })).toContain('$.annexes[0].visibility');
  });
});

describe('validateAgainstSchema extension, access, badge, deposit and deliverables', () => {
  it('accepts unknown block types as extensions', () => {
    expect(mutate((d) => {
      ((d['sections'] as Record<string, unknown>[])[0]['blocks'] as unknown[]) = [{ type: 'hologram', volume: 11 }];
    })).toEqual([]);
  });

  it('rejects bad access emails', () => {
    expect(mutate((d) => { d['access'] = { emails: 'a@b.co' }; })).toContain('$.access.emails');
    expect(mutate((d) => { d['access'] = { emails: ['nope'] }; })).toContain('$.access.emails[0]');
    expect(mutate((d) => { d['access'] = 'all'; })).toContain('$.access');
    expect(mutate((d) => { d['access'] = { emails: [] }; })).not.toContain('$.access.emails[0]');
  });

  it('rejects bad badge dates and previous slugs', () => {
    expect(mutate((d) => { d['badge'] = { issued: 'soon', scope: 's' }; })).toContain('$.badge.issued');
    expect(mutate((d) => { d['badge'] = { issued: '2026-01-05', scope: 's', previous: 'bad slug!' }; })).toContain('$.badge.previous');
    expect(mutate((d) => { d['badge'] = { issued: '2026-01-05', scope: 's', validUntil: 'last year' }; })).toContain('$.badge.validUntil');
    expect(mutate((d) => { d['badge'] = 'gold'; })).toContain('$.badge');
  });

  it('rejects bad deposit DOIs, draft ids and consent', () => {
    expect(mutate((d) => { d['deposit'] = { versionDoi: 'nope' }; })).toContain('$.deposit.versionDoi');
    expect(mutate((d) => { d['deposit'] = { conceptDoi: 'nope' }; })).toContain('$.deposit.conceptDoi');
    expect(mutate((d) => { d['deposit'] = { draftDoi: 'nope' }; })).toContain('$.deposit.draftDoi');
    expect(mutate((d) => { d['deposit'] = { depositedAt: 'someday' }; })).toContain('$.deposit.depositedAt');
    expect(mutate((d) => { d['deposit'] = { draftDepositionId: 0 }; })).toContain('$.deposit.draftDepositionId');
    expect(mutate((d) => { d['deposit'] = { consent: false }; })).toContain('$.deposit.consent');
    expect(mutate((d) => { d['deposit'] = { wrong: 1 }; })).toContain('$.deposit.wrong');
  });

  it('rejects bad cover, deliverable and finding references', () => {
    expect(mutate((d) => { d['cover'] = {}; })).toContain('$.cover');
    expect(mutate((d) => { d['deliverables'] = { repository: 'example.com' }; })).toContain('$.deliverables.repository');
    expect(mutate((d) => { d['deliverables'] = { repositoryPublic: false }; })).toContain('$.deliverables.repositoryPublic');
    expect(mutate((d) => { d['deliverables'] = { signedDocId: 'short' }; })).toContain('$.deliverables.signedDocId');
    expect(mutate((d) => { (((d['findings'] as Record<string, unknown>[])[0])['evidence'] as Record<string, unknown>[])[0]['type'] = 'tablet'; })).toContain('$.findings[0].evidence[0].type');
    expect(mutate((d) => { ((d['findings'] as Record<string, unknown>[])[0])['likelihood'] = 'high'; })).toContain('$.findings[0].likelihood');
    expect(mutate((d) => { ((d['findings'] as Record<string, unknown>[])[0])['impact'] = 0; })).toContain('$.findings[0].impact');
    expect(mutate((d) => { ((d['glossary'] as Record<string, unknown>[])[0])['term'] = ''; })).toContain('$.glossary[0].term');
  });
});
