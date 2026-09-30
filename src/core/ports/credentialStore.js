/**
 * WebDAV connection settings and credentials.
 * @typedef {object} WebDavCredentials
 * @property {string} url server base URL, e.g. https://dav.example.com/remote.php/dav/files/me
 * @property {string} vaultPath folder inside the server for this vault, e.g. finanscho
 * @property {string} username
 * @property {string} password
 */

/**
 * Credential store port. v1 stores credentials in IndexedDB; a Keychain/Keystore-backed
 * implementation should replace it on native (see docs/DECISIONS.md).
 * @typedef {object} CredentialStore
 * @property {() => Promise<WebDavCredentials | null>} load
 * @property {(credentials: WebDavCredentials) => Promise<void>} save
 * @property {() => Promise<void>} clear
 */

export {};
