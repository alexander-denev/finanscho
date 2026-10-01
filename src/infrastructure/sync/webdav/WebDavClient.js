import { SyncError } from '../../../core/errors.js';

/** @typedef {import('./httpAdapter.js').HttpAdapter} HttpAdapter */
/** @typedef {import('./httpAdapter.js').HttpResponse} HttpResponse */
/** @typedef {import('../../../core/ports/credentialStore.js').WebDavCredentials} WebDavCredentials */
/** @typedef {import('../../../core/ports/syncTransport.js').RemoteEntry} RemoteEntry */

const DAV_NS = 'DAV:';

/**
 * Parses XML text into a Document. Defaults to the browser's DOMParser; tests may inject one.
 * @typedef {(text: string) => Document} XmlParser
 */

/** @type {XmlParser} */
const defaultParseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');

/**
 * Descendant elements in the `DAV:` namespace with the given local name. Matches on
 * `namespaceURI`/`localName` instead of `getElementsByTagNameNS`, which some DOM
 * implementations handle incorrectly, and works with any prefix the server chooses.
 * @param {Document | Element} root
 * @param {string} localName
 * @returns {Element[]}
 */
function davElements(root, localName) {
  return Array.from(root.getElementsByTagName('*')).filter(
    (el) => el.localName === localName && el.namespaceURI === DAV_NS,
  );
}

/**
 * Encodes each segment of a relative path.
 * @param {string} path e.g. 'devices/abc/ops'
 * @returns {string[]}
 */
function segments(path) {
  return path
    .split('/')
    .filter((s) => s !== '')
    .map((s) => encodeURIComponent(s));
}

/**
 * Base64 of a UTF-8 string (for HTTP Basic auth with non-ASCII credentials).
 * @param {string} text
 * @returns {string}
 */
function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Maps an unexpected HTTP status to a SyncError.
 * @param {HttpResponse} response
 * @param {string} method
 * @param {string} url
 * @returns {SyncError}
 */
function statusError(response, method, url) {
  const { status } = response;
  const message = `${method} ${url} failed with HTTP ${status}`;
  if (status === 401 || status === 403) return new SyncError('auth', message, status);
  if (status === 404 || status === 409) return new SyncError('notFound', message, status);
  return new SyncError('server', message, status);
}

/**
 * Minimal WebDAV client (MKCOL, GET, PUT, PROPFIND, DELETE) with HTTP Basic auth. Implements the
 * `SyncTransport` port; paths are relative to `<url>/<vaultPath>/`.
 */
export class WebDavClient {
  #http;
  #baseUrl;
  #vaultSegments;
  #auth;
  #parseXml;

  /**
   * @param {{ http: HttpAdapter, credentials: WebDavCredentials, parseXml?: XmlParser }} deps
   */
  constructor({ http, credentials, parseXml = defaultParseXml }) {
    this.#http = http;
    this.#baseUrl = credentials.url.trim().replace(/\/+$/, '');
    this.#vaultSegments = segments(credentials.vaultPath.trim());
    this.#auth = `Basic ${base64Utf8(`${credentials.username}:${credentials.password}`)}`;
    this.#parseXml = parseXml;
  }

  /**
   * Absolute URL for a path inside the vault. Collections get a trailing slash.
   * @param {string} path
   * @param {boolean} [collection]
   * @returns {string}
   */
  urlFor(path, collection = false) {
    const all = [...this.#vaultSegments, ...segments(path)];
    const joined = all.length > 0 ? `${this.#baseUrl}/${all.join('/')}` : this.#baseUrl;
    return collection ? `${joined}/` : joined;
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {Record<string, string>} [headers]
   * @param {string} [body]
   * @returns {Promise<HttpResponse>}
   */
  async #send(method, url, headers = {}, body) {
    return this.#http.request(method, url, { Authorization: this.#auth, ...headers }, body);
  }

  /**
   * Creates the collection at `path` (and any missing ancestors inside the vault), tolerating
   * "already exists". An empty path means the vault root.
   * @param {string} path
   * @returns {Promise<void>}
   */
  async ensureCollection(path) {
    const all = [...this.#vaultSegments, ...segments(path)];
    for (let i = 1; i <= all.length; i += 1) {
      const url = `${this.#baseUrl}/${all.slice(0, i).join('/')}/`;
      const response = await this.#send('MKCOL', url);
      // 201 created; 405 already exists; 301 some servers redirect existing collections.
      if (response.status === 201 || response.status === 405 || response.status === 301) continue;
      throw statusError(response, 'MKCOL', url);
    }
  }

  /**
   * @param {string} path
   * @returns {Promise<string | null>} file text, or null when it does not exist
   */
  async get(path) {
    const url = this.urlFor(path);
    const response = await this.#send('GET', url, { 'Cache-Control': 'no-cache' });
    if (response.status === 404) return null;
    if (response.status >= 200 && response.status < 300) return response.body;
    throw statusError(response, 'GET', url);
  }

  /**
   * @param {string} path
   * @param {string} body
   * @returns {Promise<void>}
   */
  async put(path, body) {
    const url = this.urlFor(path);
    const response = await this.#send(
      'PUT',
      url,
      { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    );
    if (response.status >= 200 && response.status < 300) return;
    throw statusError(response, 'PUT', url);
  }

  /**
   * Deletes a file, or a collection with everything in it (RFC 4918 §9.6) when `path` ends with
   * `/`. A missing resource counts as deleted.
   * @param {string} path
   * @returns {Promise<void>}
   */
  async delete(path) {
    const url = this.urlFor(path, path.endsWith('/'));
    const response = await this.#send('DELETE', url);
    if (response.status === 404 || (response.status >= 200 && response.status < 300)) return;
    throw statusError(response, 'DELETE', url);
  }

  /**
   * Lists the direct children of a collection (PROPFIND, Depth: 1).
   * @param {string} path
   * @returns {Promise<RemoteEntry[]>}
   */
  async list(path) {
    const url = this.urlFor(path, true);
    const response = await this.#send(
      'PROPFIND',
      url,
      { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
    );
    if (response.status === 404) return [];
    if (response.status !== 207) throw statusError(response, 'PROPFIND', url);
    return this.#parseMultistatus(response.body, url);
  }

  /**
   * Checks that the server is reachable and the credentials work, without writing anything.
   * @returns {Promise<void>}
   */
  async checkAccess() {
    const url = `${this.#baseUrl}/`;
    const response = await this.#send('PROPFIND', url, { Depth: '0' });
    if (response.status === 207 || (response.status >= 200 && response.status < 300)) return;
    throw statusError(response, 'PROPFIND', url);
  }

  /**
   * @param {string} xml
   * @param {string} requestUrl
   * @returns {RemoteEntry[]}
   */
  #parseMultistatus(xml, requestUrl) {
    const doc = this.#parseXml(xml);
    if (doc.getElementsByTagName('parsererror').length > 0) {
      throw new SyncError('malformed', `Unparseable PROPFIND response from ${requestUrl}`);
    }
    const selfPath = decodeURIComponent(new URL(requestUrl).pathname).replace(/\/+$/, '');
    /** @type {RemoteEntry[]} */
    const entries = [];
    for (const response of davElements(doc, 'response')) {
      const href = davElements(response, 'href')[0]?.textContent?.trim();
      if (!href) continue;
      const path = decodeURIComponent(new URL(href, requestUrl).pathname).replace(/\/+$/, '');
      if (path === selfPath) continue;
      const name = path.slice(path.lastIndexOf('/') + 1);
      const isCollection = davElements(response, 'collection').length > 0;
      entries.push({ name, isCollection });
    }
    return entries;
  }
}
