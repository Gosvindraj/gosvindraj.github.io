# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git

- Only commit and push when explicitly asked to.
- Do not include a `Co-Authored-By` trailer in commit messages.

## Writing style

- **No em dashes (`—`)** anywhere in user-facing text. Use a comma, colon, or period instead.

## Commands

```bash
npm run dev       # start dev server (localhost:4321)
npm run build     # production build → dist/
npm run preview   # preview production build
```

No test suite or linter is configured.

## Stack

- **Astro 6** with `@astrojs/react` integration and `@astrojs/sitemap`
- **React 19** — used only for the ChatBot component (interactive island)
- **GSAP 3** — all animations (scroll, cursor, page transitions, glitch effects)
- **Astro View Transitions** (`ClientRouter`) for SPA-style navigation
- Deployed to **GitHub Pages** at `https://gosvindraj.github.io`

## Architecture

### Layout and shared chrome
`src/layouts/BaseLayout.astro` is the single layout wrapping every page. It owns:
- Global `<head>` with SEO meta, Open Graph, JSON-LD structured data
- Preloader (GSAP, runs once per session via `sessionStorage`)
- Ambient background orbs, custom cursor (dot + ring + effects), film-grain overlay
- `<Navbar>` and `<ChatBot>` — both `transition:persist` so they survive page navigations
- GSAP `ScrollTrigger` cleanup/refresh hooks on `astro:before-swap` / `astro:page-load`

All pages import `BaseLayout` and slot content into it.

### Styles
`src/styles/global.css` is the single stylesheet, imported in `BaseLayout`. It defines CSS custom properties (design tokens) used everywhere:

| Token | Value | Purpose |
|---|---|---|
| `--bg` | `#0b0b0d` | Page background |
| `--surface` | `#111116` | Card/panel background |
| `--accent` | `#9b6dce` | Purple highlight colour |
| `--text` | `#e4e4e8` | Body text |
| `--muted` | `#55556a` | Subdued text |
| `--nav-height` | `72px` | Navbar height (also used for `main` padding-top) |

All page-specific styles live in `<style>` blocks within each `.astro` file.

### ChatBot (`src/components/ChatBot.tsx`)
The only React component. It posts to `/api/chat` (a server-side API route not yet present in the codebase — the endpoint must be created for the chat to work). Rate-limited client-side: 20 messages per session, 2 s cooldown, 500 char max. Session history is persisted to `localStorage`. The component is hidden on the home page until the user dismisses the "found-me" intro screen.

### Home page two-phase entry (`src/pages/index.astro`)
1. **Phase 1 — "found-me" screen**: full-screen overlay with glitch animations and a proximity wave driven by `gsap.quickTo`. Shown once per JS session (`foundMeSeen` in-memory flag).
2. **Phase 2 — intro reveal**: glitch text reveal + staggered GSAP timeline. The matrix canvas background (`requestAnimationFrame` loop) runs throughout both phases and is cancelled on `astro:before-swap`.

### Project pages
- `/projects` — project index rendered from a static array in frontmatter
- `/snake-game`, `/crypto-api`, `/anomaly-detector` — individual project pages with their own `<script>` blocks containing all logic inline

The anomaly detector calls the Snowtrace/Avalanche C-Chain API client-side and runs an Isolation Forest algorithm in-browser (no server route required for that feature).

### Cursor
The custom cursor is entirely CSS + GSAP in `BaseLayout`. `cursor: none` is set globally; `#cursor-dot` and `#cursor-ring` are positioned with `gsap.set`. Body classes `cursor-hover` and `cursor-text` drive CSS state transitions. Cursor effects are disabled on touch devices via `@media (hover: none), (pointer: coarse)`.
