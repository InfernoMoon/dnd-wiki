import type { App } from 'obsidian';

/** Safely obtain the Obsidian App instance from the current window. */
export function getObsidianApp(): App | null {
	return (window as Window & { app?: App }).app ?? null;
}

/** Create a unique identifier using Web Crypto with a safe fallback. */
export function createUid(): string {
	try {
		const anyCrypto = window.crypto;
		if (anyCrypto && 'randomUUID' in anyCrypto && typeof anyCrypto.randomUUID === 'function') {
			return anyCrypto.randomUUID();
		}
		if (anyCrypto && 'getRandomValues' in anyCrypto && typeof anyCrypto.getRandomValues === 'function') {
			const buf = new Uint8Array(16);
			anyCrypto.getRandomValues(buf);
			return Array.from(buf).map((byte) => byte.toString(16).padStart(2, '0')).join('');
		}
	} catch {
		// Fall through to the timestamp-based fallback.
	}
	return `uid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
