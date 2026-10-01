/**
 * WebDAV connection settings and credentials.
 * @typedef {object} WebDavCredentials
 * @property {string} url server base URL, e.g. https://dav.example.com/remote.php/dav/files/me
 * @property {string} vaultPath folder inside the server for this vault, e.g. finanscho
 * @property {string} username
 * @property {string} password
 */

/**
 * Credential store port. Credentials are kept in IndexedDB, the only durable storage a PWA has
 * (see docs/DECISIONS.md, D35).
 * @typedef {object} CredentialStore
 * @property {() => Promise<WebDavCredentials | null>} load
 * @property {(credentials: WebDavCredentials) => Promise<void>} save
 * @property {() => Promise<void>} clear
 */

export {};
