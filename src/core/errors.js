/**
 * Typed errors thrown by core services. Every error carries a stable `code` that the UI maps to an
 * i18n key; raw `message` text is for developers only and never shown to users.
 */

/** Base class for all expected (non-bug) application errors. */
export class AppError extends Error {
  /** @type {string} */
  code;

  /**
   * @param {string} code stable machine-readable code, also used as i18n key suffix
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message ?? code);
    this.name = new.target.name;
    this.code = code;
  }
}

/**
 * Map from input field name to an i18n key describing what is wrong with it.
 * @typedef {Record<string, string>} FieldErrors
 */

/** Input failed validation. `fields` maps each invalid field to an i18n error key. */
export class ValidationError extends AppError {
  /** @type {FieldErrors} */
  fields;

  /** @param {FieldErrors} fields */
  constructor(fields) {
    super('validation', `Invalid fields: ${Object.keys(fields).join(', ')}`);
    this.fields = fields;
  }
}

/** A referenced entity does not exist (or is deleted). */
export class NotFoundError extends AppError {
  /** @type {string} */
  entity;
  /** @type {string} */
  id;

  /**
   * @param {string} entity
   * @param {string} id
   */
  constructor(entity, id) {
    super('notFound', `${entity} ${id} not found`);
    this.entity = entity;
    this.id = id;
  }
}

/** A backup file could not be read or has an unsupported format. */
export class BackupError extends AppError {
  /** @param {'invalidFile' | 'formatTooNew'} code */
  constructor(code) {
    super(code === 'invalidFile' ? 'backupInvalid' : 'backupFormatTooNew');
  }
}

/**
 * Reasons a sync cycle can fail. The UI maps each to a message telling the user how to fix it.
 * @typedef {'notConfigured' | 'offline' | 'network' | 'auth' | 'notFound' | 'server'
 *   | 'vaultTooNew' | 'malformed' | 'unsupportedMethod' | 'unknown'} SyncFailureReason
 */

/** A sync operation failed for a known reason. */
export class SyncError extends AppError {
  /** @type {SyncFailureReason} */
  reason;
  /** @type {number | undefined} */
  status;

  /**
   * @param {SyncFailureReason} reason
   * @param {string} [message]
   * @param {number} [status] HTTP status when relevant
   */
  constructor(reason, message, status) {
    super(`sync.${reason}`, message ?? reason);
    this.reason = reason;
    this.status = status;
  }

  /** @returns {boolean} whether retrying later may succeed */
  get isTransient() {
    return this.reason === 'offline' || this.reason === 'network' || this.reason === 'server';
  }
}
