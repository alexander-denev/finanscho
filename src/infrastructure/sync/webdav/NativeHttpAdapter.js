import { CapacitorHttp } from '@capacitor/core';
import { SyncError } from '../../../core/errors.js';

/** @typedef {import('./httpAdapter.js').HttpResponse} HttpResponse */

/**
 * HTTP methods Android's `HttpURLConnection` (used by CapacitorHttp on Android) accepts. It throws
 * `ProtocolException` for WebDAV methods such as PROPFIND and MKCOL. See docs/DECISIONS.md.
 */
const ANDROID_METHODS = new Set(['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']);

/**
 * @typedef {object} NativeHttp
 * @property {(options: { method: string, url: string, headers: Record<string, string>, data?: string, responseType: 'text' }) => Promise<{ status: number, data: unknown }>} request
 */

/**
 * Native HTTP adapter (CapacitorHttp) for Android and iOS, which bypasses CORS. Methods the
 * platform cannot send are rejected with `unsupportedMethod` instead of silently falling back.
 */
export class NativeHttpAdapter {
  #platform;
  #http;

  /**
   * @param {{ platform: string, http?: NativeHttp }} deps
   */
  constructor({ platform, http = CapacitorHttp }) {
    this.#platform = platform;
    this.#http = http;
  }

  /**
   * Whether this platform's native HTTP stack can send the method.
   * @param {string} method
   * @returns {boolean}
   */
  supports(method) {
    return this.#platform !== 'android' || ANDROID_METHODS.has(method.toUpperCase());
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {Record<string, string>} headers
   * @param {string} [body]
   * @returns {Promise<HttpResponse>}
   */
  async request(method, url, headers, body) {
    if (!this.supports(method)) {
      throw new SyncError(
        'unsupportedMethod',
        `${method} is not supported by native HTTP on ${this.#platform}`,
      );
    }
    try {
      const response = await this.#http.request({
        method,
        url,
        headers,
        data: body,
        responseType: 'text',
      });
      const data = response.data;
      return {
        status: response.status,
        body:
          typeof data === 'string'
            ? data
            : data === null || data === undefined
              ? ''
              : JSON.stringify(data),
      };
    } catch (error) {
      throw new SyncError('network', `${method} ${url}: ${String(error)}`);
    }
  }
}
