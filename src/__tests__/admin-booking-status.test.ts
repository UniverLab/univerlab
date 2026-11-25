// The admin room booking line: it reads `${bookingApi}/health` and shows the
// up string only when the body answers exactly `ok`; a rejection, an HTTP
// error or any other body falls to the down string. Both states share the
// one `bookingLine` template, so both languages ride the same path.
import { initAdminPage } from '../lib/admin/panel-client';
import type { AdminClientStrings } from '../lib/admin/panel-client';

const BOOKING_API = 'https://booking.univerlab.org';

function strings(): AdminClientStrings {
  return {
    visibilityPublic: 'public',
    visibilityPrivate: 'private',
    findingsLine: '{open}/{total}',
    publish: 'Publish',
    unpublish: 'Unpublish',
    refused: 'refused {reason}',
    remove: 'Remove',
    confirmRemove: 'remove {slug}?',
    signCounts: '{pending}/{signed}',
    bookingOk: 'Agenda operativa',
    bookingDown: 'Agenda caida',
    bookingLine: 'Servicio de agenda: {status}',
    loadError: 'load error',
    auditsEmpty: 'empty',
    actionMissing: 'missing',
    actionNetwork: 'network',
    actionFailed: 'failed {status}',
  };
}

function mount(): HTMLElement {
  document.body.innerHTML =
    '<table><tbody id="admin-audits"></tbody></table>' +
    '<p id="admin-error" hidden></p>' +
    '<p id="admin-empty" hidden></p>' +
    '<p id="admin-sign-counts"></p>' +
    `<p id="admin-booking-status" data-booking-api="${BOOKING_API}"></p>`;
  return document.getElementById('admin-booking-status') as HTMLElement;
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function stubFetch(health: () => Promise<unknown>): jest.Mock {
  const fetchMock = jest.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.endsWith('/health')) return health();
    if (typeof url === 'string' && url.endsWith('/api/admin-audits')) {
      return Promise.resolve({ ok: true, json: async () => ({ audits: [] }) });
    }
    if (typeof url === 'string' && url.endsWith('/api/sign-request')) {
      return Promise.resolve({ ok: true, json: async () => ({ requests: [] }) });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
  (globalThis as Record<string, unknown>)['fetch'] = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  document.body.innerHTML = '';
  jest.restoreAllMocks();
});

describe('admin booking status line', () => {
  it('shows the up string when /health answers ok', async () => {
    const booking = mount();
    const fetchMock = stubFetch(() => Promise.resolve({ ok: true, text: async () => 'ok' }));
    initAdminPage(strings(), { bookingApi: BOOKING_API });
    await flush();
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(`${BOOKING_API}/health`);
    expect(booking.textContent).toBe('Servicio de agenda: Agenda operativa');
  });

  it('shows the down string when /health is unreachable', async () => {
    const booking = mount();
    stubFetch(() => Promise.reject(new Error('down')));
    initAdminPage(strings(), { bookingApi: BOOKING_API });
    await flush();
    await flush();
    expect(booking.textContent).toBe('Servicio de agenda: Agenda caida');
  });

  it('shows the down string when /health answers an HTTP error', async () => {
    const booking = mount();
    stubFetch(() => Promise.resolve({ ok: false, status: 500, text: async () => 'ok' }));
    initAdminPage(strings(), { bookingApi: BOOKING_API });
    await flush();
    await flush();
    expect(booking.textContent).toBe('Servicio de agenda: Agenda caida');
  });

  it('shows the down string when /health answers anything but ok', async () => {
    const booking = mount();
    stubFetch(() => Promise.resolve({ ok: true, text: async () => 'fine' }));
    initAdminPage(strings(), { bookingApi: BOOKING_API });
    await flush();
    await flush();
    expect(booking.textContent).toBe('Servicio de agenda: Agenda caida');
  });
});
