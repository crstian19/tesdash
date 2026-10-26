<script lang="ts">
	import { renderSVG } from 'uqr';
	import { buildLaunchUrl } from '../lib/url';
	import { sendStrings } from '../lib/send-i18n';
	import { KEY_STORAGE, decryptLink, generateKey, isValidKey, pairingUrl, relayWsUrl, roomFromKey } from '../lib/send';

	let { relay }: { relay: string } = $props();

	const PING_MS = 45_000;
	const MAX_RETRY_MS = 60_000;
	const MAX_LINKS = 3;

	let lang = $state('en');
	let t = $derived(sendStrings(lang));

	let open = $state(false);
	let key = $state<string | null>(null);
	let status = $state<'idle' | 'connecting' | 'online'>('idle');
	let links = $state<{ id: number; url: string; host: string }[]>([]);
	let nextId = 0;

	let qr = $derived(key ? renderSVG(pairingUrl(location.origin, key), { ecc: 'M', border: 2 }) : '');

	$effect(() => {
		const saved = localStorage.getItem('tesdash-lang');
		lang = saved || navigator.language.split('-')[0] || 'en';

		const stored = localStorage.getItem(KEY_STORAGE);
		if (stored && isValidKey(stored)) key = stored;

		const onLang = (e: Event) => {
			const detail = (e as CustomEvent<{ lang: string }>).detail;
			if (detail?.lang) lang = detail.lang;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') open = false;
		};
		window.addEventListener('tesdash:langchange', onLang);
		document.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('tesdash:langchange', onLang);
			document.removeEventListener('keydown', onKey);
		};
	});

	// Only a car that has been paired keeps a socket open, so plain visitors cost the relay nothing.
	$effect(() => {
		if (!key) return;
		const k = key;
		let ws: WebSocket | null = null;
		let ping: ReturnType<typeof setInterval> | undefined;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		let retries = 0;
		let stopped = false;

		async function connect() {
			const room = await roomFromKey(k);
			if (stopped) return;
			status = 'connecting';
			ws = new WebSocket(relayWsUrl(relay, room, location.href));
			ws.onopen = () => {
				status = 'online';
				retries = 0;
				ping = setInterval(() => ws?.send('ping'), PING_MS);
			};
			ws.onmessage = (e) => receive(k, String(e.data));
			ws.onclose = (e) => {
				clearInterval(ping);
				// 4000: another tab of this car took over the room.
				if (stopped || e.code === 4000) {
					status = 'idle';
					return;
				}
				status = 'connecting';
				retryTimer = setTimeout(connect, Math.min(MAX_RETRY_MS, 2000 * 2 ** retries++));
			};
		}

		connect();
		return () => {
			stopped = true;
			clearInterval(ping);
			clearTimeout(retryTimer);
			ws?.close();
			status = 'idle';
		};
	});

	async function receive(k: string, data: string) {
		if (data === 'pong') return;
		let payload: unknown;
		try {
			payload = (JSON.parse(data) as { payload?: unknown }).payload;
		} catch {
			return;
		}
		if (typeof payload !== 'string') return;
		const url = await decryptLink(k, payload);
		if (!url || !buildLaunchUrl(url)) return;
		const host = new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).host;
		links = [{ id: nextId++, url, host }, ...links].slice(0, MAX_LINKS);
		// Typically the pairing modal is still open right after the first send; get it out of the way.
		open = false;
	}

	function show() {
		if (!key) {
			key = generateKey();
			localStorage.setItem(KEY_STORAGE, key);
		}
		open = true;
	}

	function reset() {
		key = generateKey();
		localStorage.setItem(KEY_STORAGE, key);
	}

	function launch(id: number, url: string) {
		const wrapped = buildLaunchUrl(url);
		if (wrapped) window.open(wrapped, '_blank');
		dismiss(id);
	}

	function dismiss(id: number) {
		links = links.filter((l) => l.id !== id);
	}
</script>

<button class="send-trigger" onclick={show}>
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<rect x="5" y="2" width="14" height="20" rx="2"/>
		<path d="M12 18h.01"/>
	</svg>
	{t.btn}
	{#if status === 'online'}<span class="send-dot" aria-hidden="true"></span>{/if}
</button>

<div
	class="modal-overlay"
	class:is-open={open}
	id="modal-send"
	aria-hidden={!open}
	inert={!open}
	onclick={(e) => { if (e.target === e.currentTarget) open = false; }}
	role="presentation"
>
	<div class="modal-box send-box" role="dialog" aria-modal="true" aria-labelledby="send-title">
		<button class="modal-close" onclick={() => (open = false)} aria-label="Close">&times;</button>
		<h2 id="send-title" class="modal-title">{t.title}</h2>
		<p class="modal-text">{t.scan}</p>
		{#if qr}
			<div class="send-qr">{@html qr}</div>
		{/if}
		<p class="send-status" class:is-online={status === 'online'}>
			<span class="send-status-dot" aria-hidden="true"></span>
			{status === 'online' ? t.online : t.connecting}
		</p>
		<p class="send-privacy">{t.privacy}</p>
		<button class="send-reset" onclick={reset}>{t.reset}</button>
	</div>
</div>

{#if links.length}
	<div class="send-toasts" role="status">
		{#each links as link (link.id)}
			<div class="send-toast">
				<div class="send-toast-text">
					<span class="send-toast-label">{t.received}</span>
					<span class="send-toast-host">{link.host}</span>
				</div>
				<button class="send-toast-open" onclick={() => launch(link.id, link.url)}>{t.open}</button>
				<button class="send-toast-dismiss" onclick={() => dismiss(link.id)} aria-label={t.dismiss}>&times;</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.send-trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		margin-top: 0.75rem;
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 0.875rem;
		font-family: inherit;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		border-radius: 8px;
		transition: color 150ms ease, background 150ms ease;
	}

	.send-trigger:hover {
		color: #f8fafc;
		background: rgba(255, 255, 255, 0.05);
	}

	.send-trigger svg {
		width: 16px;
		height: 16px;
	}

	.send-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #22c55e;
	}

	.send-box {
		max-width: 420px;
		text-align: center;
	}

	.send-qr {
		width: 220px;
		margin: 0.5rem auto 1rem;
		background: #fff;
		border-radius: 16px;
		padding: 0.5rem;
	}

	.send-qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}

	.send-status {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		color: #94a3b8;
		margin-bottom: 0.5rem;
	}

	.send-status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #f59e0b;
	}

	.send-status.is-online { color: #f8fafc; }
	.send-status.is-online .send-status-dot { background: #22c55e; }

	.send-privacy {
		font-size: 0.75rem;
		color: #64748b;
		margin-bottom: 1rem;
	}

	.send-reset {
		background: none;
		border: none;
		color: #64748b;
		font-size: 0.75rem;
		font-family: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.send-reset:hover { color: #94a3b8; }

	.send-toasts {
		position: fixed;
		left: 50%;
		bottom: 2rem;
		transform: translateX(-50%);
		z-index: 90;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: min(480px, calc(100vw - 2rem));
	}

	.send-toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.85rem 0.85rem 0.85rem 1.1rem;
		background: rgba(18, 18, 28, 0.94);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 16px;
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
		animation: send-toast-in 250ms ease-out;
	}

	@keyframes send-toast-in {
		from { opacity: 0; transform: translateY(12px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.send-toast-text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	.send-toast-label {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #94a3b8;
	}

	.send-toast-host {
		font-size: 1rem;
		font-weight: 600;
		color: #f8fafc;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.send-toast-open {
		background: #E50914;
		color: #fff;
		border: none;
		border-radius: 12px;
		padding: 0.7rem 1.4rem;
		font-size: 1rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		flex-shrink: 0;
	}

	.send-toast-open:hover { background: #f0141e; }

	.send-toast-dismiss {
		background: none;
		border: none;
		color: #64748b;
		font-size: 1.5rem;
		line-height: 1;
		cursor: pointer;
		padding: 0.25rem 0.4rem;
		flex-shrink: 0;
	}
</style>
