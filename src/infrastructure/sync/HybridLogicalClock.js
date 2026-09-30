/**
 * Hybrid logical clock (physical ms + logical counter + deviceId), serialized as a fixed-width
 * string so that string comparison equals clock comparison. See docs/SYNC_PROTOCOL.md §1.2.
 */

const WALL_WIDTH = 15;
const COUNTER_WIDTH = 6;
const MAX_COUNTER = 999_999;
const HLC_PATTERN = /^(\d{15})-(\d{6})-(.+)$/;

/**
 * Persisted clock state.
 * @typedef {{ wallMs: number, counter: number }} HlcState
 */

/**
 * Parsed clock.
 * @typedef {{ wallMs: number, counter: number, deviceId: string }} HlcParts
 */

/** The minimum clock, used for seeded records so any real edit wins. */
export const SEED_HLC = `${'0'.repeat(WALL_WIDTH)}-${'0'.repeat(COUNTER_WIDTH)}-00000000-0000-0000-0000-000000000000`;

/** Tracks and advances a device's hybrid logical clock. */
export class HybridLogicalClock {
  #deviceId;
  #wallMs;
  #counter;

  /**
   * @param {string} deviceId
   * @param {HlcState} [state] previously persisted state
   */
  constructor(deviceId, state = { wallMs: 0, counter: 0 }) {
    this.#deviceId = deviceId;
    this.#wallMs = state.wallMs;
    this.#counter = state.counter;
  }

  /**
   * Formats clock parts as a sortable string.
   * @param {HlcParts} parts
   * @returns {string}
   */
  static format({ wallMs, counter, deviceId }) {
    return `${String(wallMs).padStart(WALL_WIDTH, '0')}-${String(counter).padStart(COUNTER_WIDTH, '0')}-${deviceId}`;
  }

  /**
   * Parses a clock string, or returns null when malformed.
   * @param {unknown} hlc
   * @returns {HlcParts | null}
   */
  static parse(hlc) {
    if (typeof hlc !== 'string') return null;
    const match = HLC_PATTERN.exec(hlc);
    if (!match) return null;
    return { wallMs: Number(match[1]), counter: Number(match[2]), deviceId: match[3] };
  }

  /**
   * Whether a value is a well-formed clock string.
   * @param {unknown} hlc
   * @returns {hlc is string}
   */
  static isValid(hlc) {
    return HybridLogicalClock.parse(hlc) !== null;
  }

  /** @returns {HlcState} state to persist */
  get state() {
    return { wallMs: this.#wallMs, counter: this.#counter };
  }

  /**
   * Advances the clock for a local event and returns the new clock string.
   * @param {number} nowMs current physical time
   * @returns {string}
   */
  tick(nowMs) {
    if (nowMs > this.#wallMs) {
      this.#wallMs = nowMs;
      this.#counter = 0;
    } else {
      this.#bumpCounter(this.#counter + 1);
    }
    return this.#current();
  }

  /**
   * Merges a remote clock so that later local ticks are greater than it.
   * @param {string} remoteHlc
   * @param {number} nowMs current physical time
   * @returns {void}
   */
  receive(remoteHlc, nowMs) {
    const remote = HybridLogicalClock.parse(remoteHlc);
    if (remote === null) return;
    const wall = Math.max(this.#wallMs, remote.wallMs, nowMs);
    if (wall === this.#wallMs && wall === remote.wallMs) {
      this.#bumpCounter(Math.max(this.#counter, remote.counter) + 1);
    } else if (wall === this.#wallMs) {
      this.#bumpCounter(this.#counter + 1);
    } else if (wall === remote.wallMs) {
      this.#wallMs = wall;
      this.#bumpCounter(remote.counter + 1);
    } else {
      this.#wallMs = wall;
      this.#counter = 0;
    }
  }

  /**
   * Sets the counter, rolling over into the wall clock to keep the fixed width.
   * @param {number} counter
   * @returns {void}
   */
  #bumpCounter(counter) {
    if (counter > MAX_COUNTER) {
      this.#wallMs += 1;
      this.#counter = 0;
    } else {
      this.#counter = counter;
    }
  }

  /** @returns {string} */
  #current() {
    return HybridLogicalClock.format({
      wallMs: this.#wallMs,
      counter: this.#counter,
      deviceId: this.#deviceId,
    });
  }
}
