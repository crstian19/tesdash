import { describe, expect, it } from 'vitest';
import {
	decryptLink,
	encryptLink,
	fromBase64Url,
	generateKey,
	isValidKey,
	keyFromHash,
	pairingUrl,
	relayHttpUrl,
	relayWsUrl,
	roomFromKey,
	toBase64Url
} from './send';

describe('base64url', () => {
	it('round-trips arbitrary bytes without padding or unsafe characters', () => {
		const bytes = new Uint8Array([0, 251, 255, 62, 63, 1, 2]);
		const encoded = toBase64Url(bytes);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(fromBase64Url(encoded)).toEqual(bytes);
	});

	it('rejects characters outside the alphabet', () => {
		expect(fromBase64Url('abc+/=')).toBeNull();
	});
});

describe('keys and rooms', () => {
	it('generates valid 32-byte keys', () => {
		const key = generateKey();
		expect(isValidKey(key)).toBe(true);
		expect(generateKey()).not.toBe(key);
	});

	it('rejects keys of the wrong length', () => {
		expect(isValidKey('abc')).toBe(false);
		expect(isValidKey('')).toBe(false);
	});

	it('derives a stable 22-character room id that is not the key', async () => {
		const key = generateKey();
		const room = await roomFromKey(key);
		expect(room).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(await roomFromKey(key)).toBe(room);
		expect(key.startsWith(room)).toBe(false);
	});
});

describe('encryption', () => {
	it('decrypts what it encrypts', async () => {
		const key = generateKey();
		const payload = await encryptLink(key, 'https://example.com/a?b=c#d');
		expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(await decryptLink(key, payload)).toBe('https://example.com/a?b=c#d');
	});

	it('uses a fresh IV for every message', async () => {
		const key = generateKey();
		expect(await encryptLink(key, 'x')).not.toBe(await encryptLink(key, 'x'));
	});

	it('returns null for another key or tampered payloads', async () => {
		const payload = await encryptLink(generateKey(), 'https://example.com');
		expect(await decryptLink(generateKey(), payload)).toBeNull();
		expect(await decryptLink(generateKey(), 'short')).toBeNull();
		expect(await decryptLink(generateKey(), 'not base64!')).toBeNull();
	});
});

describe('pairing URLs', () => {
	it('puts the key in the fragment and reads it back', () => {
		const key = generateKey();
		const url = new URL(pairingUrl('https://tesda.sh', key));
		expect(url.pathname).toBe('/send');
		expect(url.search).toBe('');
		expect(keyFromHash(url.hash)).toBe(key);
	});

	it('ignores missing or invalid keys', () => {
		expect(keyFromHash('')).toBeNull();
		expect(keyFromHash('#k=nope')).toBeNull();
	});
});

describe('relay URLs', () => {
	it('resolves a relative relay against the page', () => {
		expect(relayHttpUrl('/api/send', 'room', 'https://tesda.sh/send')).toBe('https://tesda.sh/api/send/room');
		expect(relayWsUrl('/api/send/', 'room', 'https://tesda.sh/')).toBe('wss://tesda.sh/api/send/room/ws');
	});

	it('keeps absolute relays and maps http to ws', () => {
		expect(relayWsUrl('http://localhost:8787/api/send', 'room', 'http://localhost:4321/')).toBe(
			'ws://localhost:8787/api/send/room/ws'
		);
		expect(relayHttpUrl('https://relay.example.workers.dev/api/send', 'room', 'https://me.example/')).toBe(
			'https://relay.example.workers.dev/api/send/room'
		);
	});
});
