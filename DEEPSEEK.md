# DEEPSEEK.md

This file provides guidance to DeepSeek when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server + WebSocket relay (concurrently)
npm run dev:relay    # Start just the WebSocket relay server (scripts/relay-server.mjs)
npm run build        # Type-check + production build (tsc -b && vite build)
npm run lint         # ESLint (must pass before committing — runs automatically via pre-commit hook)
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier write
npm run preview      # Preview production build locally
npm run fetch-cards  # Regenerate public/cards.txt from ygoprodeck API (scripts/fetch-cards.mjs)
```

No test suite exists — there are no test files or test scripts.

## Pre-commit hook

A husky pre-commit hook runs `npm run lint`. If linting fails the commit is aborted.
Run `npm run lint:fix` to auto-fix most issues, then review and re-stage before committing.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Redux Toolkit for game state, Fuse.js for fuzzy search, PeerJS for WebRTC.

**Card data loading** (`src/store/cardsSlice.ts`): On startup `App.tsx` dispatches `fetchCards`, which tries `GET /cards.txt` (a pre-generated pipe-delimited flat file) and falls back to the live ygoprodeck API. All three game modes gate rendering behind `status === 'succeeded'`. Card images are loaded from `images.ygoprodeck.com/{id}.jpg` (external CDN, not bundled). The `public/cards.txt` format is `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate` (15 pipe-delimited columns) — regenerated via `npm run fetch-cards`.

**Redux store** (`src/store/`):

- `cards` — shared card list, loaded once at startup
- `game` — Card Guesser state: current card, crop position (`cropX`/`cropY` as 0–1 fractions), zoom level (5 = most zoomed, 1 = full card), timers, scores, round history
- `higherOrLower` — separate slice for Higher or Lower mode

**Game modes** are tab-switched in `App.tsx`; each is a self-contained component tree:

- `src/components/card-guesser/` — four components: `CardGuesser` (orchestrator with timers), `CardDisplay` (CSS crop/zoom), `CardSearch` (Fuse.js autocomplete), `PreviousRounds`
- `src/components/higher-or-lower/HigherOrLower.tsx` — self-contained with its own Redux slice
- `src/components/card-categories/CardCategories.tsx` — PvP and solo mode for Card Categories game. All PvP networking logic lives here.

**PvP networking** (`src/components/card-categories/`): Star topology — the first player to enter a name becomes host; others connect peer-to-peer to the host's peer ID. The host relays all messages (`ToClientMsg`) to other clients. Non-hosts send `ToHostMsg` only to the host.

- **`CardCategories.tsx`** — Main component: lobby, game state, host game logic, network event wiring. Manages connection state with refs (not Redux) to avoid stale closure issues. In multiplayer, the host runs a 60-second per-turn `setTimeout`; expiry calls `hostHandleWrong` (same as a wrong guess). Clients receive a `turnDeadline` timestamp in `guessing-start`/`guess-correct` messages and render a countdown bar.
- **`network.ts`** — Network constants: `ICE_SERVERS` (metered.ca TURN credentials), `MAX_PLAYERS`, message types (`ToHostMsg` / `ToClientMsg`).
- **`categoryUtils.ts`** — Category generation (`generateCategories`) and card matching logic (`cardMatchesCategory`).
- **`LocalTransport.ts`** — WebSocket-based transport for localhost multiplayer. Replaces PeerJS/WebRTC on localhost because Firefox isolates mDNS ICE candidates between normal + private browsing contexts and may block STUN/TURN via Enhanced Tracking Protection. Firefox also partitions BroadcastChannel between normal/private tabs, so a WebSocket relay server (`scripts/relay-server.mjs`, started alongside Vite via `npm run dev`) is used instead. Not used in production (GitHub Pages uses real PeerJS with TURN relays).

**Scoring** (Card Guesser): Points by zoom level `[0, 100, 300, 500, 700, 1000]` minus `wrongGuesses.length * 100`, min 0. 60-second per-card timer, 15-minute (900s) challenge timer, both counted down by a single `tickSecond` Redux action on a `setInterval`.

**Theme:** `data-theme` attribute on `<html>`, toggled in `App.tsx`, persisted to `localStorage`. CSS vars are defined per theme in `App.css`.

**Deployment:** GitHub Actions (`deploy.yml`) builds on push to `main` and deploys `dist/` to GitHub Pages. Vite base is `/CardGuesser/`.

**Typed hooks:** `src/hooks.ts` exports `useAppDispatch` and `useAppSelector` — always use these instead of the raw Redux hooks.

## README maintenance

Update `README.md` before or as part of every commit. If a commit adds a game mode, changes scoring, adds a feature (leaderboards, PvP, etc.), or changes any setup/deployment step, the README must reflect it in the same commit.

## Cross-file sync

`CLAUDE.md` and `DEEPSEEK.md` must be kept in sync. After every code change, update both files to reflect the new state of the project (new files, changed architecture, new commands, etc.). The content should be identical except for the heading and any AI-specific notes.
