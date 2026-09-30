import { Window } from 'happy-dom';

const window = new Window();

/**
 * DOMParser-backed XML parser for Node-environment tests (DOMParser is a browser API).
 * @param {string} text
 * @returns {Document}
 */
export function parseXml(text) {
  const parser = new window.DOMParser();
  return /** @type {Document} */ (
    /** @type {unknown} */ (parser.parseFromString(text, 'application/xml'))
  );
}
