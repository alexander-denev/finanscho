/**
 * Install environment port: whether the app runs as an installed PWA, whether the browser can
 * show its own install prompt, and how well local storage is protected from eviction. Implemented
 * by `BrowserInstallEnvironment`; observed by `InstallStore`.
 */

/** @typedef {'ios' | 'android' | 'desktop'} PlatformOs */
/** @typedef {'safari' | 'chromium' | 'firefox' | 'other'} PlatformBrowser */

/**
 * Operating system and browser family. Used only for install instructions and default names,
 * never to switch features.
 * @typedef {object} Platform
 * @property {PlatformOs} os
 * @property {PlatformBrowser} browser
 */

/** @typedef {'accepted' | 'dismissed' | 'unavailable'} InstallOutcome */

/**
 * @typedef {object} StorageEstimate
 * @property {number} usage bytes used by this origin
 * @property {number} quota bytes this origin may use
 */

/**
 * `navigator.storage`. Every method resolves `null` when the API is unsupported or fails.
 * @typedef {object} StorageProtection
 * @property {() => Promise<boolean | null>} persisted whether storage is already persistent
 * @property {() => Promise<boolean | null>} persist ask for persistent storage (Firefox prompts, so call it from a user gesture there)
 * @property {() => Promise<StorageEstimate | null>} estimate
 */

/**
 * @typedef {object} InstallEnvironment
 * @property {() => boolean} isStandalone running as an installed app (display-mode standalone, or iOS home screen)
 * @property {(listener: (standalone: boolean) => void) => () => void} onDisplayModeChange
 * @property {() => boolean} canPromptInstall the browser offered an install prompt we can show
 * @property {(listener: (available: boolean) => void) => () => void} onInstallAvailabilityChange
 * @property {() => Promise<InstallOutcome>} promptInstall shows the browser's install prompt
 * @property {(listener: () => void) => () => void} onInstalled the app was installed from this page
 * @property {Platform} platform
 * @property {StorageProtection} storage
 */

export {};
