// @vitest-environment happy-dom
// PROPFIND parsing uses the browser DOMParser, so this file runs in the DOM environment.
import { describe, expect, it } from 'vitest';
import { WebDavClient } from '../../../../src/infrastructure/sync/webdav/WebDavClient.js';
import { SyncError } from '../../../../src/core/errors.js';
import { InMemoryWebDav } from '../../../helpers/InMemoryWebDav.js';

/**
 * @param {InMemoryWebDav} server
 * @param {Partial<import('../../../../src/core/ports/credentialStore.js').WebDavCredentials>} [over]
 */
const clientFor = (server, over = {}) =>
  new WebDavClient({ http: server, credentials: { ...server.credentials(), ...over } });

describe('WebDavClient', () => {
  it('builds encoded URLs inside the vault', () => {
    const client = new WebDavClient({
      http: new InMemoryWebDav(),
      credentials: { url: 'https://h/dav/', vaultPath: '/My Money/', username: 'u', password: 'p' },
    });
    expect(client.urlFor('devices/a b/head.json')).toBe(
      'https://h/dav/My%20Money/devices/a%20b/head.json',
    );
    expect(client.urlFor('', true)).toBe('https://h/dav/My%20Money/');
  });

  it('creates nested collections, tolerating existing ones', async () => {
    const server = new InMemoryWebDav();
    const client = clientFor(server, { vaultPath: 'apps/finanscho' });
    await client.ensureCollection('devices/d1/ops');
    await client.ensureCollection('devices/d1/ops');
    expect(server.collections.has('remote/dav/apps/finanscho/devices/d1/ops')).toBe(true);
  });

  it('puts, gets, and reports missing files as null', async () => {
    const server = new InMemoryWebDav();
    const client = clientFor(server);
    await client.ensureCollection('');
    expect(await client.get('vault.json')).toBeNull();
    await client.put('vault.json', '{"format":1}');
    expect(await client.get('vault.json')).toBe('{"format":1}');
  });

  it('lists children with PROPFIND, skipping the folder itself', async () => {
    const server = new InMemoryWebDav();
    const client = clientFor(server);
    await client.ensureCollection('devices/dev one');
    await client.ensureCollection('devices/dev-2');
    await client.put('devices/readme.txt', 'x');
    const entries = await client.list('devices');
    expect(entries.sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: 'dev one', isCollection: true },
      { name: 'dev-2', isCollection: true },
      { name: 'readme.txt', isCollection: false },
    ]);
    expect(await client.list('missing')).toEqual([]);
  });

  it('parses multistatus responses with other prefixes and absolute hrefs', async () => {
    const xml = `<?xml version="1.0"?><a:multistatus xmlns:a="DAV:">
      <a:response><a:href>https://h/dav/v/devices/</a:href><a:propstat><a:prop><a:resourcetype><a:collection/></a:resourcetype></a:prop></a:propstat></a:response>
      <a:response><a:href>https://h/dav/v/devices/x%20y/</a:href><a:propstat><a:prop><a:resourcetype><a:collection/></a:resourcetype></a:prop></a:propstat></a:response>
    </a:multistatus>`;
    const client = new WebDavClient({
      http: { request: async () => ({ status: 207, body: xml }) },
      credentials: { url: 'https://h/dav', vaultPath: 'v', username: 'u', password: 'p' },
    });
    expect(await client.list('devices')).toEqual([{ name: 'x y', isCollection: true }]);
  });

  it('maps HTTP failures to typed sync errors', async () => {
    const server = new InMemoryWebDav();
    const wrong = clientFor(server, { password: 'nope' });
    await expect(wrong.get('vault.json')).rejects.toMatchObject({ reason: 'auth', status: 401 });
    const client = clientFor(server);
    await expect(client.put('no/parent.json', 'x')).rejects.toMatchObject({ reason: 'notFound' });
    server.failNext({ method: 'GET', pathIncludes: 'vault.json', status: 503 });
    const error = await client.get('vault.json').catch((e) => e);
    expect(error).toBeInstanceOf(SyncError);
    expect(error.reason).toBe('server');
    expect(error.isTransient).toBe(true);
    const garbage = new WebDavClient({
      http: { request: async () => ({ status: 207, body: '<not xml' }) },
      credentials: server.credentials(),
    });
    await expect(garbage.list('')).rejects.toMatchObject({ reason: 'malformed' });
  });

  it('sends UTF-8 Basic auth and checks access without writing', async () => {
    /** @type {Record<string, string>} */
    let seen = {};
    const client = new WebDavClient({
      http: {
        request: async (_m, _u, headers) => {
          seen = headers;
          return { status: 207, body: '' };
        },
      },
      credentials: { url: 'https://h', vaultPath: 'v', username: 'jürgen', password: 'pä' },
    });
    await client.checkAccess();
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(seen.Authorization.slice(6)), (c) => c.charCodeAt(0)),
    );
    expect(decoded).toBe('jürgen:pä');
  });
});
