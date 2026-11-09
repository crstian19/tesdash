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

### Releases

[releaser-pleaser](https://github.com/apricote/releaser-pleaser) keeps a release PR open with the
next version and `CHANGELOG.md`, computed from the Conventional Commits on `main`: `feat` bumps the
minor, `fix` the patch, `!` the major. PRs are squash-merged, so the PR title is the commit and has
to follow Conventional Commits (a check enforces it). Renovate commits runtime dependency updates as
`fix(deps)`, so they ship in the next patch release; dev dependency and CI updates are `chore(deps)`.

Merging the release PR tags `vX.Y.Z`, creates the GitHub release and builds the image. The workflow
authenticates as the `crstian19-releaser` GitHub App (secrets `RELEASER_APP_CLIENT_ID` and
`RELEASER_APP_PRIVATE_KEY`), because a tag pushed with `GITHUB_TOKEN` would not start the build.

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
│   │   └── UrlLauncher.svelte
│   ├── data/
│   │   └── config.yml  ← Edit this to configure your apps
│   └── pages/
│       └── index.astro
├── .github/
│   └── workflows/
│       ├── docker.yml             ← Builds and pushes Docker image on version tags
│       ├── releaser-pleaser.yml   ← Release PR, tags and GitHub releases
│       └── pr-title.yml           ← Checks PR titles are Conventional Commits
├── Dockerfile
├── astro.config.mjs
└── package.json
```
