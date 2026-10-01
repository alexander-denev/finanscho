import { SyncError } from '../../src/core/errors.js';

/**
 * @typedef {object} Failure
 * @property {string} method
 * @property {string} pathIncludes
 * @property {number} [status] respond with this status
 * @property {SyncError} [error] reject with this error (no response received)
 * @property {number} times remaining uses
 */

/**
 * Fake WebDAV server implementing the HttpAdapter port for tests. Behaves like a real server:
 * Basic auth, MKCOL (405 when existing, 409 when the parent is missing), PUT (409 without a parent
 * collection), GET (404), PROPFIND Depth 1 with a DAV: multistatus body, and DELETE (recursive for
 * collections, 404 when missing).
 */
export class InMemoryWebDav {
  /** @type {Map<string, string>} */
  files = new Map();
  /** @type {Set<string>} */
  collections = new Set();
  /** @type {Array<{ method: string, path: string }>} */
  log = [];
  /** @type {Failure[]} */
  #failures = [];
  #auth;
  #origin;

  /**
   * @param {{ origin?: string, root?: string, username?: string, password?: string }} [options]
   */
  constructor(options = {}) {
    this.#origin = options.origin ?? 'https://dav.test';
    this.root = options.root ?? 'remote/dav';
    this.#auth = `Basic ${btoa(`${options.username ?? 'user'}:${options.password ?? 'secret'}`)}`;
    // The server's own base folders exist.
    const parts = this.root.split('/');
    for (let i = 1; i <= parts.length; i += 1) this.collections.add(parts.slice(0, i).join('/'));
  }

  /**
   * Credentials that work against this server.
   * @param {string} [vaultPath]
   */
  credentials(vaultPath = 'finanscho') {
    return { url: `${this.#origin}/${this.root}`, vaultPath, username: 'user', password: 'secret' };
  }

  /**
   * Makes the next matching request(s) fail.
   * @param {Omit<Failure, 'times'> & { times?: number }} failure
   */
  failNext(failure) {
    this.#failures.push({ times: 1, ...failure });
  }

  /** Drops failures that were injected but not triggered. */
  clearFailures() {
    this.#failures = [];
  }

  /**
   * Path inside the vault → server path.
   * @param {string} relative
   * @param {string} [vaultPath]
   */
  vaultPath(relative, vaultPath = 'finanscho') {
    return [this.root, vaultPath, relative].filter(Boolean).join('/');
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {string} [body]
   * @returns {Promise<import('../../src/infrastructure/sync/webdav/httpAdapter.js').HttpResponse>}
   */
  async request(method, url, headers, body) {
    const path = decodeURIComponent(new URL(url).pathname).replace(/^\/+|\/+$/g, '');
    this.log.push({ method, path });
    const failure = this.#failures.find(
      (f) => f.method === method && path.includes(f.pathIncludes) && f.times > 0,
    );
    if (failure) {
      failure.times -= 1;
      if (failure.error) throw failure.error;
      return { status: failure.status ?? 500, body: '' };
    }
    if (headers.Authorization !== this.#auth) return { status: 401, body: '' };
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('/')));
    switch (method) {
      case 'MKCOL':
        if (this.collections.has(path) || this.files.has(path)) return { status: 405, body: '' };
        if (!this.collections.has(parent)) return { status: 409, body: '' };
        this.collections.add(path);
        return { status: 201, body: '' };
      case 'PUT':
        if (!this.collections.has(parent)) return { status: 409, body: '' };
        if (this.collections.has(path)) return { status: 405, body: '' };
        this.files.set(path, body ?? '');
        return { status: 201, body: '' };
      case 'GET':
        if (this.files.has(path)) return { status: 200, body: this.files.get(path) ?? '' };
        return { status: 404, body: '' };
      case 'PROPFIND':
        return this.#propfind(path, headers.Depth ?? 'infinity');
      case 'DELETE':
        return this.#delete(path);
      default:
        return { status: 405, body: '' };
    }
  }

  /**
   * Deletes a file, or a collection recursively.
   * @param {string} path
   */
  #delete(path) {
    if (this.files.delete(path)) return { status: 204, body: '' };
    if (!this.collections.has(path)) return { status: 404, body: '' };
    for (const c of [...this.collections]) {
      if (c === path || c.startsWith(`${path}/`)) this.collections.delete(c);
    }
    for (const f of [...this.files.keys()]) if (f.startsWith(`${path}/`)) this.files.delete(f);
    return { status: 204, body: '' };
  }

  /**
   * @param {string} path
   * @param {string} depth
   */
  #propfind(path, depth) {
    if (!this.collections.has(path) && !this.files.has(path)) return { status: 404, body: '' };
    /**
     * @param {string} p
     * @param {boolean} isCollection
     */
    const response = (p, isCollection) =>
      `<D:response><D:href>/${encodeURI(p)}${isCollection ? '/' : ''}</D:href><D:propstat><D:prop>` +
      `<D:resourcetype>${isCollection ? '<D:collection/>' : ''}</D:resourcetype>` +
      `</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;
    const parts = [response(path, this.collections.has(path))];
    if (depth === '1' && this.collections.has(path)) {
      const isChild = (/** @type {string} */ p) =>
        p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/');
      for (const c of this.collections) if (isChild(c)) parts.push(response(c, true));
      for (const f of this.files.keys()) if (isChild(f)) parts.push(response(f, false));
    }
    return {
      status: 207,
      body: `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${parts.join('')}</D:multistatus>`,
    };
  }

  /**
   * Parsed JSON content of a vault file, or undefined.
   * @param {string} relative
   */
  readJson(relative) {
    const text = this.files.get(this.vaultPath(relative));
    return text === undefined ? undefined : JSON.parse(text);
  }
}

/** A network error as adapters report it. */
export const networkError = () => new SyncError('network', 'simulated network failure');
