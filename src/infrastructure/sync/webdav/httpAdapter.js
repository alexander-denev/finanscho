/**
 * HTTP adapter port used by WebDavClient. Implementations: FetchHttpAdapter (browser) and
 * NativeHttpAdapter (Capacitor native HTTP).
 *
 * `request` resolves with any HTTP status (including 4xx/5xx) and rejects only when no response
 * was received, with a `SyncError` whose reason is `offline`, `network`, or `unsupportedMethod`.
 */

/**
 * @typedef {object} HttpResponse
 * @property {number} status
 * @property {string} body response text ('' when empty)
 */

/**
 * @typedef {object} HttpAdapter
 * @property {(method: string, url: string, headers: Record<string, string>, body?: string) => Promise<HttpResponse>} request
 */

export {};
