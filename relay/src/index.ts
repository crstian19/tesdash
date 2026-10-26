/**
 * Tesdash "send from phone" relay.
 *
 * One Durable Object per pairing room. The car keeps a hibernatable WebSocket
 * open on its room; the phone POSTs an end-to-end encrypted link that is pushed
 * to every socket in the room. If the car is offline, the link waits for a few
 * minutes and is delivered (then deleted) on the next connect.
 *
 * The relay never sees plaintext: payloads are AES-GCM ciphertext and the key
 * stays in the QR code's URL fragment. See src/lib/send.ts in the site.
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env {
	ROOMS: DurableObjectNamespace<Room>;
	/** Comma-separated extra origins allowed to use the relay (for cross-origin setups). */
	ALLOWED_ORIGINS?: string;
}

const PATH_RE = /^\/api\/send\/([A-Za-z0-9_-]{22})(\/ws)?$/;
const PAYLOAD_RE = /^[A-Za-z0-9_-]+$/;
// Keep in sync with MAX_PAYLOAD in src/lib/send.ts.
const MAX_PAYLOAD = 4096;
const MAX_BODY = MAX_PAYLOAD + 64;
const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 5;
const MAX_SOCKETS = 4;

interface Pending {
	payload: string;
	expires: number;
}

function allowedOrigin(request: Request, env: Env): string | null | false {
	const origin = request.headers.get('Origin');
	if (!origin) return null;
	if (origin === new URL(request.url).origin) return origin;
	const extra = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
	return extra.includes(origin) ? origin : false;
}

function json(body: unknown, status: number, headers: HeadersInit = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}

export default {
	async fetch(request, env): Promise<Response> {
		const origin = allowedOrigin(request, env);
		if (origin === false) return json({ error: 'forbidden_origin' }, 403);

		const cors: Record<string, string> = origin
			? {
					'Access-Control-Allow-Origin': origin,
					'Access-Control-Allow-Methods': 'POST, OPTIONS',
					'Access-Control-Allow-Headers': 'content-type',
					Vary: 'Origin'
				}
			: {};

		if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

		const match = new URL(request.url).pathname.match(PATH_RE);
		if (!match) return json({ error: 'not_found' }, 404, cors);
		const [, room, ws] = match;
		const stub = env.ROOMS.get(env.ROOMS.idFromName(room));

		if (ws) {
			if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected_websocket' }, 426);
			return stub.fetch(request);
		}

		if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors);
		if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) {
			return json({ error: 'too_large' }, 413, cors);
		}

		let payload: unknown;
		try {
			const text = await request.text();
			if (text.length > MAX_BODY) return json({ error: 'too_large' }, 413, cors);
			payload = (JSON.parse(text) as { payload?: unknown }).payload;
		} catch {
			return json({ error: 'bad_request' }, 400, cors);
		}
		if (typeof payload !== 'string' || payload.length > MAX_PAYLOAD || !PAYLOAD_RE.test(payload)) {
			return json({ error: 'bad_request' }, 400, cors);
		}

		const delivered = await stub.deliver(payload);
		return json({ delivered }, 200, cors);
	}
} satisfies ExportedHandler<Env>;

export class Room extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		// Keep-alive pings are answered without waking the object, so idle cars cost nothing.
		ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
	}

	async fetch(): Promise<Response> {
		// A car with several tabs open may hold a few sockets; drop the oldest beyond the cap.
		const existing = this.ctx.getWebSockets();
		for (const old of existing.slice(0, Math.max(0, existing.length - MAX_SOCKETS + 1))) {
			old.close(4000, 'replaced');
		}

		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);

		const pending = await this.takePending();
		for (const p of pending) server.send(JSON.stringify({ type: 'link', payload: p.payload }));

		return new Response(null, { status: 101, webSocket: client });
	}

	/** Pushes a payload to the connected car, or queues it briefly. Returns true if a socket received it. */
	async deliver(payload: string): Promise<boolean> {
		const message = JSON.stringify({ type: 'link', payload });
		let delivered = false;
		for (const ws of this.ctx.getWebSockets()) {
			try {
				ws.send(message);
				delivered = true;
			} catch {
				// Socket is closing; ignore it.
			}
		}
		if (delivered) return true;

		const now = Date.now();
		const pending = ((await this.ctx.storage.get<Pending[]>('pending')) ?? []).filter((p) => p.expires > now);
		pending.push({ payload, expires: now + PENDING_TTL_MS });
		await this.ctx.storage.put('pending', pending.slice(-MAX_PENDING));
		await this.ctx.storage.setAlarm(now + PENDING_TTL_MS);
		return false;
	}

	async alarm(): Promise<void> {
		await this.ctx.storage.deleteAll();
	}

	async webSocketMessage(): Promise<void> {
		// Cars only send "ping", which the auto-response handles. Ignore anything else.
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		try {
			ws.close(code, reason);
		} catch {
			// Already closed, or a reserved code like 1005/1006 that cannot be echoed.
		}
	}

	private async takePending(): Promise<Pending[]> {
		const pending = await this.ctx.storage.get<Pending[]>('pending');
		if (!pending) return [];
		await this.ctx.storage.deleteAll();
		const now = Date.now();
		return pending.filter((p) => p.expires > now);
	}
}
