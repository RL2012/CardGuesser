# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server (Vite)
npm run build        # Type-check + production build (tsc -b && vite build)
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier write
npm run preview      # Preview production build locally
npm run fetch-cards  # Regenerate public/cards.txt from ygoprodeck API (scripts/fetch-cards.mjs)
```

No test suite exists — there are no test files or test scripts.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Redux Toolkit for game state, Fuse.js for fuzzy search, PeerJS for WebRTC.

**Card data loading** (`src/store/cardsSlice.ts`): On startup `App.tsx` dispatches `fetchCards`, which tries `GET /cards.txt` (a pre-generated pipe-delimited flat file) and falls back to the live ygoprodeck API. All three game modes gate rendering behind `status === 'succeeded'`. Card images are loaded from `images.ygoprodeck.com/{id}.jpg` (external CDN, not bundled). The `public/cards.txt` format is `id|name|frameType|attribute|atk|def|level|race` — regenerated via `npm run fetch-cards`.

**Redux store** (`src/store/`):
- `cards` — shared card list, loaded once at startup
- `game` — Card Guesser state: current card, crop position (`cropX`/`cropY` as 0–1 fractions), zoom level (5 = most zoomed, 1 = full card), timers, scores, round history
- `higherOrLower` — separate slice for Higher or Lower mode

**Game modes** are tab-switched in `App.tsx`; each is a self-contained component tree:
- `src/components/card-guesser/` — four components: `CardGuesser` (orchestrator with timers), `CardDisplay` (CSS crop/zoom), `CardSearch` (Fuse.js autocomplete), `PreviousRounds`
- `src/components/higher-or-lower/HigherOrLower.tsx` — self-contained with its own Redux slice
- `src/components/pvp-lobby/PvpLobby.tsx` — single file, all PvP logic

**PvP networking** (`PvpLobby.tsx`): Star topology — the first player to enter a name becomes host; others connect peer-to-peer to the host's peer ID. The host relays all messages (`ToClientMsg`) to other clients. Non-hosts send `ToHostMsg` only to the host. TURN servers are metered.ca credentials hardcoded in `ICE_SERVERS`. The component manages connection state with refs (not Redux) to avoid stale closure issues in event handlers.

**Scoring** (Card Guesser): Points by zoom level `[0, 100, 300, 500, 700, 1000]` minus `wrongGuesses.length * 100`, min 0. 60-second per-card timer, 15-minute (900s) challenge timer, both counted down by a single `tickSecond` Redux action on a `setInterval`.

**Theme:** `data-theme` attribute on `<html>`, toggled in `App.tsx`, persisted to `localStorage`. CSS vars are defined per theme in `App.css`.

**Deployment:** GitHub Actions (`deploy.yml`) builds on push to `main` and deploys `dist/` to GitHub Pages. Vite base is `/CardGuesser/`.

**Typed hooks:** `src/hooks.ts` exports `useAppDispatch` and `useAppSelector` — always use these instead of the raw Redux hooks.
