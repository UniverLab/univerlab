// One failure per validator check: each test breaks exactly one rule of the
// contract and pins the JSON path the validator reports for it. The fixture
// audit must stay fully valid; the CLI exit codes live in audit-cli.test.ts.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateAuditDocument, validateAuditFolder } from '../lib/audit/validate.ts';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'audit-contract');

function validDoc(bytes: number, sha256: string): Record<string, unknown> {
  return {
    contract: 'univerlab.audit/1',
    meta: {
      title: 'T', client: { name: 'C' }, language: 'en', auditors: [{ name: 'A' }],
      auditPeriod: { start: '2026-01-05', end: '2026-01-09' },
      version: '1.0', status: 'draft', scope: 'S',
    },
    visibility: 'public',
    cover: { layout: { type: 'single' } },
    assets: [{ id: 'd1', path: 'assets/data.json', kind: 'data', title: 'D', bytes, sha256 }],
    deliverables: {},
    findings: [{
      id: 'F-01', title: 'T', severity: 'high', likelihood: 3, impact: 3, area: 'a',
      status: 'open', summary: 'S', evidence: [{ type: 'asset', id: 'd1' }],
      recommendation: 'R', effort: 'small',
    }],
    sources: [{ id: 's1', title: 'S' }],
    glossary: [{ term: 't1', definition: 'D' }],
    sections: [{
      id: 'sec', title: 'S', layout: { type: 'single' },
      blocks: [{ type: 'prose', markdown: 'See {{finding:F-01}}, {{source:s1}}, {{term:t1}}, {{asset:d1}}.' }],
    }],
  };
}

// Writes a folder with audit.json and its asset file; the mutator breaks one
// rule (and may touch files). Catalogue bytes/hash always start correct.
function setup(mut?: (doc: Record<string, unknown>, folder: string) => void): string {
  const folder = mkdtempSync(join(tmpdir(), 'audit-'));
  mkdirSync(join(folder, 'assets'));
  const content = '{"week":"W1"}\n';
  writeFileSync(join(folder, 'assets', 'data.json'), content);
  const bytes = Buffer.byteLength(content);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const doc = validDoc(bytes, sha256);
  mut?.(doc, folder);
  writeFileSync(join(folder, 'audit.json'), JSON.stringify(doc));
  return folder;
}

function errorsOf(folder: string): { path: string; message: string }[] {
  try {
    return validateAuditFolder(folder).errors;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

describe('valid documents', () => {
  it('accepts the contract fixture with no errors and no warnings', () => {
    const { errors, warnings } = validateAuditFolder(FIXTURE_DIR);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('uses every layout type and every block type in the fixture', async () => {
    const { LAYOUT_TYPES, KNOWN_BLOCK_TYPES } = await import('../lib/audit/types.ts');
    const doc = JSON.parse(readFileSync(join(FIXTURE_DIR, 'audit.json'), 'utf8')) as {
      cover: { layout: { type: string } };
      sections: { layout: { type: string }; blocks: { type: string }[] }[];
    };
    const layouts = new Set([doc.cover.layout.type, ...doc.sections.map((s) => s.layout.type)]);
    expect(layouts).toEqual(new Set(LAYOUT_TYPES));
    const blocks = new Set(doc.sections.flatMap((s) => s.blocks.map((b) => b.type)));
    expect(blocks).toEqual(new Set(KNOWN_BLOCK_TYPES));
  });

  it('accepts x- extension properties and the delivered fixture report', () => {
    const folder = setup((doc) => {
      (doc['meta'] as Record<string, unknown>)['x-tool'] = 'agent';
      const sections = doc['sections'] as Record<string, unknown>[];
      ((sections[0]['blocks'] as unknown[])[0] as Record<string, unknown>)['x-note'] = 1;
    });
    expect(errorsOf(folder)).toEqual([]);
  });
});

describe('schema failures', () => {
  it('rejects the wrong contract version', () => {
    const folder = setup((doc) => { doc['contract'] = 'univerlab.audit/2'; });
    expect(errorsOf(folder)).toEqual([{ path: '$.contract', message: expect.stringContaining('univerlab.audit/1') }]);
  });

  it('rejects a missing required property', () => {
    const folder = setup((doc) => { delete (doc['meta'] as Record<string, unknown>)['title']; });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.meta');
    expect(errors[0].message).toContain("'title'");
  });

  it('rejects an unknown severity', () => {
    const folder = setup((doc) => {
      ((doc['findings'] as Record<string, unknown>[])[0])['severity'] = 'catastrophic';
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.findings[0].severity');
  });

  it('rejects likelihood outside 1-5', () => {
    const folder = setup((doc) => {
      ((doc['findings'] as Record<string, unknown>[])[0])['likelihood'] = 9;
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.findings[0].likelihood');
  });

  it('rejects unknown non-x- properties', () => {
    const folder = setup((doc) => { doc['surprise'] = true; });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.surprise');
  });

  it('rejects a chart with neither spec nor dataAsset', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'chart' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0]');
    expect(errors[0].message).toContain('spec or dataAsset');
  });

  it('rejects a code block with neither source nor sourceAsset', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'code', language: 'python' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('source or sourceAsset');
  });

  it('rejects a grid span above 4', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as Record<string, unknown>[]) = [{ type: 'divider', span: 5 }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0].span');
  });
});

describe('cross-reference failures', () => {
  it('rejects duplicate asset ids', () => {
    const folder = setup((doc) => {
      (doc['assets'] as unknown[]).push({ id: 'd1', path: 'assets/data.json', kind: 'data', title: 'Dup', bytes: 1, sha256: '0'.repeat(64) });
    });
    const errors = errorsOf(folder);
    expect(errors.map((e) => e.path)).toContain('$.assets[1]');
    expect(errors.find((e) => e.path === '$.assets[1]')?.message).toContain("duplicate asset id 'd1'");
  });

  it('rejects a finding card pointing at a missing finding', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'finding', findingId: 'F-99' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0].findingId');
  });

  it('rejects a quote pointing at a missing source', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'quote', text: 'Q', sourceId: 'nope' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0].sourceId');
  });

  it('rejects a figure pointing at a missing asset', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'figure', asset: 'ghost' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0].asset');
  });

  it('rejects evidence pointing at a missing source', () => {
    const folder = setup((doc) => {
      (((doc['findings'] as unknown[])[0] as Record<string, unknown>)['evidence'] as unknown[]) = [{ type: 'source', id: 'ghost' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.findings[0].evidence[0].id');
  });

  it('rejects prose referencing a missing finding', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as Record<string, unknown>[]) = [{ type: 'prose', markdown: 'See {{finding:F-99}}.' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("unknown finding 'F-99'");
  });

  it('rejects prose referencing a missing glossary term', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as Record<string, unknown>[]) = [{ type: 'prose', markdown: 'See {{term:ghost}}.' }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("unknown glossary term 'ghost'");
  });

  it('rejects a sources block listing a missing source', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'sources', ids: ['ghost'] }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0].ids[0]');
  });

  it('rejects a table row wider than its header', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]) = [{ type: 'table', columns: ['A'], rows: [['a', 'b']] }];
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.sections[0].blocks[0].rows[0]');
  });

  it('rejects a media asset without alt text', () => {
    const folder = setup((doc, f) => {
      writeFileSync(join(f, 'assets', 'pic.svg'), '<svg></svg>');
      (doc['assets'] as unknown[]).push({ id: 'pic', path: 'assets/pic.svg', kind: 'image', title: 'P', bytes: 11, sha256: createHash('sha256').update('<svg></svg>').digest('hex') });
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.assets[1].alt');
  });

  it('rejects a private audit with no access emails', () => {
    const folder = setup((doc) => {
      doc['visibility'] = 'private';
      doc['access'] = { emails: [] };
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.access.emails');
  });

  it('rejects a delivered audit with no PDF report', () => {
    const folder = setup((doc) => {
      ((doc['meta'] as Record<string, unknown>)['status'] as string) = 'delivered';
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.deliverables.report');
  });

  it('rejects a report deliverable that is not a pdf asset', () => {
    const folder = setup((doc) => {
      ((doc['meta'] as Record<string, unknown>)['status'] as string) = 'final';
      (doc['deliverables'] as Record<string, unknown>)['report'] = 'd1';
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.deliverables.report');
    expect(errors[0].message).toContain('pdf');
  });

  it('warns on unknown block types instead of failing', () => {
    const folder = setup((doc) => {
      (((doc['sections'] as unknown[])[0] as Record<string, unknown>)['blocks'] as unknown[]).push({ type: 'x-poll', question: 'Q?' });
    });
    const result = validateAuditFolder(folder);
    rmSync(folder, { recursive: true, force: true });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].path).toBe('$.sections[0].blocks[1]');
    expect(result.warnings[0].message).toContain('x-poll');
  });

  it('accepts a private audit whose access list names a reader', () => {
    const folder = setup((doc) => {
      doc['visibility'] = 'private';
      doc['access'] = { emails: ['reader@example.com'] };
    });
    expect(errorsOf(folder)).toEqual([]);
  });
});

describe('folder failures', () => {
  it('rejects a missing audit.json', () => {
    const folder = mkdtempSync(join(tmpdir(), 'audit-'));
    try {
      const { errors } = validateAuditFolder(folder);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('audit.json not found');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rejects invalid JSON', () => {
    const folder = mkdtempSync(join(tmpdir(), 'audit-'));
    try {
      writeFileSync(join(folder, 'audit.json'), '{oops');
      const { errors } = validateAuditFolder(folder);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('not valid JSON');
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it('rejects a missing asset file', () => {
    const folder = setup((_doc, f) => {
      rmSync(join(f, 'assets', 'data.json'));
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.assets[0].path');
    expect(errors[0].message).toContain('missing');
  });

  it('rejects an asset path that points at a directory instead of a file', () => {
    const folder = setup((doc) => {
      ((doc['assets'] as Record<string, unknown>[])[0])['path'] = '.';
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.assets[0].path');
    expect(errors[0].message).toContain('not a file');
  });

  it('rejects an asset file with the wrong byte size', () => {
    const folder = setup((doc) => {
      ((doc['assets'] as Record<string, unknown>[])[0])['bytes'] = 1;
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.assets[0].bytes');
  });

  it('rejects an asset file with the wrong hash', () => {
    const folder = setup((doc) => {
      ((doc['assets'] as Record<string, unknown>[])[0])['sha256'] = 'f'.repeat(64);
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.assets[0].sha256');
  });

  it('rejects an asset path escaping the audit folder', () => {
    const folder = setup((doc) => {
      ((doc['assets'] as Record<string, unknown>[])[0])['path'] = '../outside.json';
    });
    const errors = errorsOf(folder);
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('$.assets[0].path');
    expect(errors[0].message).toContain('escapes');
  });
});
