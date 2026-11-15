/**
 * @jest-environment node
 */
import worker from './index';

const makeEnv = () => ({ INSTALLS: { writeDataPoint: jest.fn() } });

const fetchPath = (path: string, env: { INSTALLS: { writeDataPoint: jest.Mock } }) =>
  (worker.fetch as (req: Request, env: unknown) => Response)(
    new Request(`https://get.univerlab.org${path}`),
    env,
  );

describe('get worker scanner probe filter', () => {
  const implausible = ['/.env', '/.env.local', '/.git/config', '/robots.txt', '/wp-json/batch/v1'];
  const blocked = ['/wp', '/wordpress', '/blog', '/admin', '/login', '/wp-admin', '/xmlrpc'];

  it.each([...implausible, ...blocked])('%s answers 404 and records nothing', (path) => {
    const env = makeEnv();
    const res = fetchPath(path, env);
    expect(res.status).toBe(404);
    expect(env.INSTALLS.writeDataPoint).not.toHaveBeenCalled();
  });

  it.each(['/quorum', '/astro-denoise'])('%s records unknown-tool', (path) => {
    const env = makeEnv();
    const res = fetchPath(path, env);
    expect(res.status).toBe(404);
    expect(env.INSTALLS.writeDataPoint).toHaveBeenCalledTimes(1);
    expect(env.INSTALLS.writeDataPoint.mock.calls[0][0].blobs[5]).toBe('unknown-tool');
  });

  it('canopy redirects to install.sh and records redirect', () => {
    const env = makeEnv();
    const res = fetchPath('/canopy', env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('install.sh');
    expect(env.INSTALLS.writeDataPoint.mock.calls[0][0].blobs[5]).toBe('redirect');
  });

  it('canopy.ps1 is 404 no-windows and recorded', () => {
    const env = makeEnv();
    const res = fetchPath('/canopy.ps1', env);
    expect(res.status).toBe(404);
    expect(env.INSTALLS.writeDataPoint.mock.calls[0][0].blobs[5]).toBe('no-windows');
  });

  it('texforge.ps1 redirects to install.ps1', () => {
    const env = makeEnv();
    const res = fetchPath('/texforge.ps1', env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('install.ps1');
  });

  it.each(['/', '/index.html'])('%s redirects to experiments and records root', (path) => {
    const env = makeEnv();
    const res = fetchPath(path, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('#experiments');
    expect(env.INSTALLS.writeDataPoint.mock.calls[0][0].blobs[5]).toBe('root');
  });
});
