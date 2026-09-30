import { SyncError } from '../../../core/errors.js';

/** @typedef {import('./httpAdapter.js').HttpResponse} HttpResponse */

/**
 * Browser HTTP adapter based on `fetch`. The WebDAV server must send CORS headers for the app's
 * origin (see docs/SYNC_PROTOCOL.md §8). A CORS rejection surfaces as a network error.
 */
export class FetchHttpAdapter {
  #fetch;
  #isOnline;

  /**
   * @param {{ fetch?: typeof fetch, isOnline?: () => boolean }} [deps]
   */
  constructor(deps = {}) {
    this.#fetch = deps.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#isOnline = deps.isOnline ?? (() => globalThis.navigator?.onLine !== false);
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {string} [body]
   * @returns {Promise<HttpResponse>}
   */
  async request(method, url, headers, body) {
    if (!this.#isOnline()) throw new SyncError('offline', 'The device is offline');
    /** @type {Response} */
    let response;
    try {
      response = await this.#fetch(url, {
        method,
        headers,
        body,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
      });
    } catch (error) {
      const reason = this.#isOnline() ? 'network' : 'offline';
      throw new SyncError(reason, `${method} ${url}: ${String(error)}`);
    }
    return { status: response.status, body: await response.text() };
  }
}
