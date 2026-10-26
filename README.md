<p align="center">
  <img src="public/logos/tesdash-black.webp" alt="Tesdash" width="400" />
</p>

<p align="center">
  A self-hosted static dashboard designed for the Tesla browser — launch all your apps in fullscreen with a single tap.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-6-FF5D01?style=for-the-badge&logo=astro&logoColor=white" />
  <img src="https://img.shields.io/badge/Svelte-5-FF3E00?style=for-the-badge&logo=svelte&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/github/actions/workflow/status/crstian19/tesdash/docker.yml?style=for-the-badge&logo=githubactions&logoColor=white&label=Docker+Build" />
  <img src="https://img.shields.io/github/license/crstian19/tesdash?style=for-the-badge&logo=opensourceinitiative&logoColor=white" />
</p>

---

## How it works

Tesla's browser can open any URL fullscreen using a YouTube redirect trick. Tesdash wraps every app link with:

```
https://www.youtube.com/redirect?q=<your-url>
```

This is applied automatically at build time — you just add URLs to the config file.

## Stack

| Layer | Technology |
|---|---|
| Framework | Astro 6 (SSG) |
| Interactive islands | Svelte 5 (Clock, URL Launcher) |
| Styling | Tailwind CSS 4 + DaisyUI 5 |
| Config | YAML parsed at build time with `js-yaml` |
| Logo color extraction | `sharp` (dominant color from logo image) |
| Runtime | Bun |

## Features

- **Fullscreen launcher** — every app opens fullscreen via the Tesla YouTube redirect
- **Per-app fullscreen toggle** — set `fullscreen: false` on any app to open it in a normal tab instead
- **Glassmorphism UI** — dark theme with backdrop blur and per-app accent color extracted from the logo
- **Spotlight effect** — radial gradient follows cursor/finger across each card (disabled on touch for performance)
- **Category drag & drop** — reorder categories by dragging the handle; order persists in `localStorage`
- **Add custom apps** — tap the `+` button to add any app at runtime without touching the config
- **URL launcher** — type any URL and open it fullscreen instantly
- **Send from phone** *(optional)* — pair your phone with a QR code and send links to the car's screen, end-to-end encrypted ([setup](#send-from-phone-optional))
- **Language & Region modal** — 13 interface languages; country filter hides apps unavailable in your region
- **Regional app support** — apps can be limited to specific countries via `regions:` in the config
- **EV charging calculator** — calculates charge time, cost and energy for all Tesla models with a dual-range battery slider
- **Live clock** — updates every second
- **Touch optimized** — all interactions work on the Tesla touchscreen
- **PWA ready** — web manifest and icons configured for home screen installation
- **Zero JS for static content** — cards and layout are pure HTML, JS only loads for interactive islands

## Getting started

```bash
# Install dependencies
bun install

# Start dev server
bun dev

# Build static output → /dist
bun run build

# Preview build
bun run preview
```

## Self-hosting with Docker

A Docker image is available at `ghcr.io/crstian19/tesdash`. It builds the static output with Bun and serves it with nginx.

```bash
docker run -p 8080:80 ghcr.io/crstian19/tesdash:latest
```

Or with Docker Compose:

```yaml
services:
  tesdash:
    image: ghcr.io/crstian19/tesdash:latest
    ports:
      - "8080:80"
    restart: unless-stopped
```

Images are published automatically on every version tag for `amd64` and `arm64`.

## Send from phone (optional)

Typing URLs on the touchscreen is tedious, so Tesdash can receive links from your phone:

1. In the car, tap **Send from phone** under the URL bar. A QR code appears.
2. Scan it with your phone. It opens `/send` on your phone, already paired with the car.
3. Paste a link and tap **Send**. It pops up on the car's screen, ready to open fullscreen.

The feature is **off by default** because it needs a small relay next to the static site. The Docker image does not include it.

### How it works

- The QR code points to `/send#k=<key>`. The key stays in the URL fragment, which browsers never send to a server.
- The phone encrypts each link with AES-GCM using that key. The relay only sees an opaque room id (a hash of the key) and ciphertext.
- The relay is a Cloudflare Worker with one Durable Object per room (`relay/`). The car keeps a hibernating WebSocket open, so an idle car costs nothing. If the car is offline, a link waits up to 10 minutes and is deleted once delivered.
- Everything fits in the Cloudflare **Workers Free** plan. On that plan, going over a daily limit makes requests fail until the next day; it never bills you.

### Enable it

1. Deploy the relay (needs a free Cloudflare account):

   ```bash
   cd relay
   bun install
   # Edit "routes" in wrangler.jsonc to point at your own domain, or remove it
   # to use the workers.dev URL instead.
   bunx wrangler deploy
   ```

2. Build the site with the relay URL:

   ```bash
   # Relay served on the same domain under /api/send (recommended, no CORS)
   PUBLIC_SEND_RELAY_URL=/api/send bun run build

   # Relay on another origin, e.g. workers.dev
   PUBLIC_SEND_RELAY_URL=https://tesdash-relay.<you>.workers.dev/api/send bun run build
   ```

   With Cloudflare Pages, set `PUBLIC_SEND_RELAY_URL` as a build environment variable instead.

3. If the relay is on a different origin than the site, allow the site in `relay/wrangler.jsonc`:

   ```jsonc
   "vars": { "ALLOWED_ORIGINS": "https://dash.example.com" }
   ```

The site must be served over HTTPS (or `localhost`) because the encryption uses the Web Crypto API.

### Local development

```bash
# Terminal 1: relay on :8787, allowing the Astro dev server
cd relay && bunx wrangler dev --var ALLOWED_ORIGINS:http://localhost:4321

# Terminal 2: site
PUBLIC_SEND_RELAY_URL=http://localhost:8787/api/send bun dev
```

## Configuration

Edit `src/data/config.yml` to add, remove or reorganize apps. No code changes needed.

```yaml
categories:
  - name: Streaming
    apps:
      - name: Netflix
        url: https://www.netflix.com
        logo: /logos/netflix.png   # local path or remote URL
        color: "#E50914"           # optional — auto-extracted from logo if omitted
        regions: ['ES', 'GB']      # optional — hide app outside these countries
        fullscreen: false          # optional — open without YouTube redirect (default: true)
```

### Logo sources

- **Local:** place PNG/SVG/WebP files in `public/logos/` and reference them as `/logos/filename.png`
- **Remote:** use any direct image URL (fetched at build time)
- **Auto color:** if `color` is omitted, the dominant color is extracted from the logo automatically

## Project structure

```
tesdash/
├── public/
│   └── logos/          ← App logos (PNG, SVG, WebP)
├── src/
│   ├── components/
│   │   ├── Clock.svelte
│   │   ├── SendForm.svelte       ← Phone side of "Send from phone"
│   │   ├── SendFromPhone.svelte  ← Car side: QR pairing + incoming links
│   │   └── UrlLauncher.svelte
│   ├── data/
│   │   └── config.yml  ← Edit this to configure your apps
│   └── pages/
│       ├── index.astro
│       └── send.astro  ← Phone page opened from the QR code
├── relay/              ← Optional Cloudflare Worker for "Send from phone"
├── .github/
│   └── workflows/
│       └── docker.yml  ← Builds and pushes Docker image on version tags
├── Dockerfile
├── astro.config.mjs
└── package.json
```
