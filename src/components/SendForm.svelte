<script lang="ts">
	import { buildLaunchUrl } from '../lib/url';
	import { sendStrings } from '../lib/send-i18n';
	import { KEY_STORAGE, MAX_PAYLOAD, encryptLink, isValidKey, keyFromHash, relayHttpUrl, roomFromKey } from '../lib/send';

	let { relay }: { relay: string } = $props();

	let lang = $state('en');
	let t = $derived(sendStrings(lang));

	let key = $state<string | null>(null);
	let ready = $state(false);
	let url = $state('');
	let result = $state<'idle' | 'sending' | 'sent' | 'queued' | 'invalid' | 'failed'>('idle');
	let canPaste = $state(false);

	$effect(() => {
		lang = navigator.language.split('-')[0] || 'en';
		canPaste = typeof navigator.clipboard?.readText === 'function';

		// The QR code carries the key in the fragment. Keep a copy so /send keeps
		// working when opened again without it.
		const fromHash = keyFromHash(location.hash);
		if (fromHash) {
			localStorage.setItem(KEY_STORAGE, fromHash);
			key = fromHash;
		} else {
			const stored = localStorage.getItem(KEY_STORAGE);
			if (stored && isValidKey(stored)) key = stored;
		}
		ready = true;
	});

	async function paste() {
		try {
			url = (await navigator.clipboard.readText()).trim();
			result = 'idle';
		} catch {
			// Permission denied; the user can still paste manually.
		}
	}

	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (!key || result === 'sending') return;
		const target = url.trim();
		if (!buildLaunchUrl(target)) {
			result = 'invalid';
			return;
		}

		result = 'sending';
		try {
			const payload = await encryptLink(key, target);
			if (payload.length > MAX_PAYLOAD) {
				result = 'invalid';
				return;
			}
			const res = await fetch(relayHttpUrl(relay, await roomFromKey(key), location.href), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ payload })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const { delivered } = (await res.json()) as { delivered: boolean };
			result = delivered ? 'sent' : 'queued';
			url = '';
		} catch {
			result = 'failed';
		}
	}
</script>

<div class="send-card">
	<h1 class="send-title">{t.phoneTitle}</h1>

	{#if !relay}
		<p class="send-note">{t.disabled}</p>
	{:else if !ready}
		<!-- Waiting for the client to read the pairing key. -->
	{:else if !key}
		<p class="send-note">{t.unpaired}</p>
	{:else}
		<form onsubmit={send} novalidate>
			<div class="send-input-row">
				<input
					type="url"
					inputmode="url"
					bind:value={url}
					oninput={() => (result = 'idle')}
					placeholder={t.placeholder}
					autocomplete="off"
					autocapitalize="off"
					spellcheck={false}
					aria-label={t.placeholder}
				/>
				{#if canPaste}
					<button type="button" class="send-paste" onclick={paste}>{t.paste}</button>
				{/if}
			</div>
			<button type="submit" class="send-submit" disabled={!url.trim() || result === 'sending'}>
				{result === 'sending' ? t.sending : t.send}
			</button>
		</form>

		{#if result === 'sent'}
			<p class="send-msg is-ok" role="status">{t.sent}</p>
		{:else if result === 'queued'}
			<p class="send-msg is-warn" role="status">{t.queued}</p>
		{:else if result === 'invalid'}
			<p class="send-msg is-error" role="alert">{t.invalid}</p>
		{:else if result === 'failed'}
			<p class="send-msg is-error" role="alert">{t.failed}</p>
		{/if}

		<p class="send-privacy">{t.privacy}</p>
	{/if}
</div>

<style>
	.send-card {
		width: 100%;
		max-width: 440px;
		padding: 2rem 1.5rem;
		background: rgba(18, 18, 28, 0.85);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
	}

	.send-title {
		font-size: 1.4rem;
		font-weight: 700;
		margin-bottom: 1.25rem;
		text-align: center;
	}

	.send-note {
		color: rgba(248, 250, 252, 0.75);
		line-height: 1.6;
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.send-input-row {
		display: flex;
		align-items: center;
		height: 3.25rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
	}

	.send-input-row:focus-within {
		border-color: rgba(255, 255, 255, 0.25);
	}

	input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: #f8fafc;
		font-size: 1rem;
		font-family: inherit;
		padding: 0 1rem;
	}

	input::placeholder { color: #475569; }

	.send-paste {
		background: rgba(255, 255, 255, 0.08);
		border: none;
		color: #f8fafc;
		font-size: 0.85rem;
		font-weight: 600;
		font-family: inherit;
		border-radius: 10px;
		padding: 0.5rem 0.85rem;
		margin-right: 0.4rem;
		cursor: pointer;
	}

	.send-submit {
		height: 3.25rem;
		background: #E50914;
		color: #fff;
		border: none;
		border-radius: 14px;
		font-size: 1rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
	}

	.send-submit:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.send-msg {
		margin-top: 1rem;
		font-size: 0.9rem;
		line-height: 1.5;
		text-align: center;
	}

	.send-msg.is-ok { color: #4ade80; }
	.send-msg.is-warn { color: #fbbf24; }
	.send-msg.is-error { color: #f87171; }

	.send-privacy {
		margin-top: 1.25rem;
		font-size: 0.75rem;
		color: #64748b;
		text-align: center;
	}
</style>
