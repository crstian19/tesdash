/**
 * "Send from phone" helpers shared by the car-side island and the /send page.
 *
 * Pairing works with a single secret key that lives in the URL fragment of the
 * QR code (`/send#k=<key>`), so it never reaches any server. The relay room id
 * is derived from that key with SHA-256, and every link is AES-GCM encrypted
 * with it before leaving the phone. The relay only ever sees an opaque room id
 * and ciphertext.
 */

export const KEY_STORAGE = 'tesdash-send-key';

/** Max length of the encrypted payload the relay accepts. Keep in sync with relay/src/index.ts. */
export const MAX_PAYLOAD = 4096;

const KEY_BYTES = 32;
const IV_BYTES = 12;
const ROOM_CHARS = 22;

export function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array | null {
	if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	try {
		const bin = atob(b64);
		const out = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	} catch {
		return null;
	}
}

export function generateKey(): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

export function isValidKey(key: string): boolean {
	return fromBase64Url(key)?.length === KEY_BYTES;
}

/** Room ids are public; they are derived from the key so the QR only has to carry one value. */
export async function roomFromKey(key: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`tesdash-room:${key}`));
	return toBase64Url(new Uint8Array(digest)).slice(0, ROOM_CHARS);
}

async function importKey(key: string): Promise<CryptoKey> {
	const raw = fromBase64Url(key);
	if (!raw || raw.length !== KEY_BYTES) throw new Error('Invalid key');
	return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypts a link as base64url(iv || ciphertext). */
export async function encryptLink(key: string, url: string): Promise<string> {
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), new TextEncoder().encode(url));
	const out = new Uint8Array(IV_BYTES + ct.byteLength);
	out.set(iv);
	out.set(new Uint8Array(ct), IV_BYTES);
	return toBase64Url(out);
}

/** Returns the decrypted link, or null when the payload is malformed or was not encrypted with this key. */
export async function decryptLink(key: string, payload: string): Promise<string | null> {
	const bytes = fromBase64Url(payload);
	if (!bytes || bytes.length <= IV_BYTES) return null;
	try {
		const pt = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES) },
			await importKey(key),
			bytes.slice(IV_BYTES)
		);
		return new TextDecoder().decode(pt);
	} catch {
		return null;
	}
}

/** Reads the pairing key from a URL fragment like `#k=<key>`. */
export function keyFromHash(hash: string): string | null {
	const key = new URLSearchParams(hash.replace(/^#/, '')).get('k');
	return key && isValidKey(key) ? key : null;
}

export function pairingUrl(origin: string, key: string): string {
	return `${origin}/send#k=${key}`;
}

/** HTTP endpoint the phone posts to. `relay` may be relative (`/api/send`) or absolute. */
export function relayHttpUrl(relay: string, room: string, base: string): string {
	return new URL(`${relay.replace(/\/+$/, '')}/${room}`, base).toString();
}

/** WebSocket endpoint the car listens on. */
export function relayWsUrl(relay: string, room: string, base: string): string {
	const url = new URL(`${relay.replace(/\/+$/, '')}/${room}/ws`, base);
	url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
	return url.toString();
}
