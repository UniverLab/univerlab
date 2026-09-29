/**
 * The visible "Last updated …" line.
 *
 * Four things decide whether it appears: the file must belong to one of the
 * sibling docs folders, git must have produced a date, the document must not
 * already carry a line, and it must be inserted under the `<h1>` — once. The
 * date itself is mocked (`docLastModified` is exercised in its own suite) so
 * these assertions are about placement and the no-date branch, which is the
 * branch CI's shallow checkouts actually take.
 */
jest.mock('../lib/doc-last-modified', () => ({ docLastModified: jest.fn() }));

import docsLastUpdated from '../plugins/docs-last-updated';
import { docLastModified } from '../lib/doc-last-modified';
import { formatMissionDate } from '../lib/mission-time';

const mockedDate = docLastModified as jest.MockedFunction<typeof docLastModified>;

type Node = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

const el = (tagName: string, props: Record<string, unknown> = {}, children: Node[] = []): Node => ({
  type: 'element',
  tagName,
  properties: props,
  children,
});
const h1 = (text = 'Quick Start'): Node => el('h1', {}, [{ type: 'text', value: text }]);
const text = (value: string): Node => ({ type: 'text', value });

/** Drive the visitor the way the compiler does: `parent()` is the document
 *  root, `insertAfter` splices into it, so the guard's own scan is exercised. */
function drive(fileURL: string, children: Node[]): Node[] {
  const root = { type: 'root', children };
  const ctx = {
    fileURL: new URL(fileURL),
    data: {},
    parent: () => root,
    indexOf: (n: Node) => children.indexOf(n),
    insertAfter: (node: Node, content: Node) => {
      const at = children.indexOf(node);
      if (at !== -1) children.splice(at + 1, 0, content);
    },
  };
  const element = docsLastUpdated.element!;
  const visitors = Array.isArray(element) ? element : [element];
  for (const node of [...children]) {
    for (const visitor of visitors) {
      if (node.tagName && visitor.filter.includes(node.tagName)) visitor.visit(node as never, ctx as never);
    }
  }
  return children;
}

/** Text of the inserted line, or null when nothing was inserted. */
function line(children: Node[]): Node | null {
  return children.find((c) => c.tagName === 'p' && Array.isArray(c.properties?.className) &&
    (c.properties!.className as unknown[]).includes('doc-updated')) ?? null;
}

const ISO = '2026-08-12T08:08:07-05:00';

describe('docs-last-updated plugin', () => {
  beforeEach(() => mockedDate.mockReset());

  it('inserts the line right after the <h1> when there is a date', () => {
    mockedDate.mockReturnValue(ISO);
    const children = drive('file:///srv/gitkit/docs/quickstart.md', [h1(), el('p', {}, [text('body')])]);

    expect(children[0].tagName).toBe('h1');
    const p = line(children);
    expect(p).not.toBeNull();
    expect(children.indexOf(p!)).toBe(1);
    expect(children[2].tagName).toBe('p'); // the body paragraph is pushed down
  });

  it('renders the date as a <time> holding the raw %cI and the site’s own label', () => {
    mockedDate.mockReturnValue(ISO);
    const p = line(drive('file:///srv/gitkit/docs/quickstart.md', [h1()]))!;
    const time = p.children!.find((c) => c.tagName === 'time')!;
    expect(time.properties!.dateTime).toBe(ISO);
    expect(time.children![0].value).toBe(formatMissionDate(ISO));
    expect(p.children![0].value).toBe('Last updated ');
  });

  it('adds nothing when the checkout has no trustworthy date', () => {
    // The shallow-clone / no-history / no-git branch: no line rather than a
    // line claiming the page changed today.
    mockedDate.mockReturnValue(null);
    const children = drive('file:///srv/gitkit/docs/quickstart.md', [h1()]);
    expect(line(children)).toBeNull();
    expect(children).toHaveLength(1);
  });

  it('leaves markdown that is not a sibling docs collection alone', () => {
    mockedDate.mockReturnValue(ISO);
    expect(drive('file:///srv/univerlab/README.md', [h1()])).toHaveLength(1);
    expect(drive('file:///srv/not-gitkit/docs/x.md', [h1()])).toHaveLength(1);
    expect(mockedDate).not.toHaveBeenCalled();
  });

  it('leaves a document with no <h1> alone', () => {
    mockedDate.mockReturnValue(ISO);
    expect(drive('file:///srv/gitkit/docs/quickstart.md', [el('p', {}, [text('x')])])).toHaveLength(1);
    expect(mockedDate).not.toHaveBeenCalled();
  });

  it('never inserts a second line into a document that already has one', () => {
    mockedDate.mockReturnValue(ISO);
    const first = h1();
    const already = el('p', { className: ['doc-updated'] }, [text('Last updated')]);
    const children = drive('file:///srv/gitkit/docs/quickstart.md', [first, already, h1('Second heading')]);
    expect(children.filter((c) => c.tagName === 'p' && c.children?.[0]?.value === 'Last updated').length).toBe(1);
  });

  it('asks git once for the document, with its own path', () => {
    mockedDate.mockReturnValue(ISO);
    drive('file:///srv/gitkit/docs/quickstart.md', [h1()]);
    expect(mockedDate).toHaveBeenCalledWith('/srv/gitkit/docs/quickstart.md');
  });
});
