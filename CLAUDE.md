# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before starting work

Always run `git fetch origin && git status` before making any changes. Check whether the local branch is behind the remote — if it is, **pull first** to avoid conflicts with parallel commits from other machines.

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

## After installing npm packages

After any `npm install` that adds or updates packages, always verify the lock file is CI-compatible before committing:

```bash
npm ci
```

`npm ci` is what GitHub Actions uses to install dependencies. If it fails with a lock file mismatch (e.g. `package-lock.json` was generated with `--legacy-peer-deps` or other non-standard flags), the deployment will break.

**If `npm ci` fails after install:**
1. Delete `node_modules/` and `package-lock.json`
2. Run `npm install` without any extra flags
3. Run `npm ci` again to confirm the fresh lock file is valid
4. Commit the updated `package-lock.json`

Never commit a lock file produced by `npm install --legacy-peer-deps` — it causes `npm ci` to fail in CI.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Redux Toolkit for game state, Fuse.js for fuzzy search, PeerJS for WebRTC. TypeScript target is ES2022 with `verbatimModuleSyntax` and `erasableSyntaxOnly` enabled (matches YgoDomainBuilder reference config).

**Card data loading** (`src/store/cardsSlice.ts`): On startup `App.tsx` dispatches `fetchCards`, which tries `GET /cards.txt` (a pre-generated pipe-delimited flat file) and falls back to the live ygoprodeck API. All game modes gate rendering behind `status === 'succeeded'`. Card images are loaded from `images.ygoprodeck.com/{id}.jpg` (external CDN, not bundled). The `public/cards.txt` format is `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice` (16 pipe-delimited columns) — regenerated via `npm run fetch-cards`. Column 15 (`tcgplayerPrice`) comes from `card_prices[0].tcgplayer_price` in the YGOProDeck API; cards with a missing or zero price are excluded from Price Check mode.

**Redux store** (`src/store/`):

- `cards` — shared card list, loaded once at startup
- `game` — Card Guesser state: current card, crop position (`cropX`/`cropY` as 0–1 fractions), zoom level (5 = most zoomed, 1 = full card), timers, scores, round history
- `higherOrLower` — Higher or Lower state; includes `mode: 'atk' | 'price' | 'date'` — ATK Battle compares monster ATK, Price Check compares TCGPlayer prices (cards with price = 0 are excluded), Newer or Older compares TCG release dates (`tcgDate`)

**Game modes** are tab-switched in `App.tsx`; each is a self-contained component tree:

- `src/components/card-guesser/` — four components: `CardGuesser` (orchestrator with timers), `CardDisplay` (CSS crop/zoom), `CardSearch` (Fuse.js autocomplete), `PreviousRounds`
- `src/components/higher-or-lower/HigherOrLower.tsx` — self-contained with its own Redux slice
- `src/components/card-categories/CardCategories.tsx` — PvP and solo mode for Card Categories game. All PvP networking logic lives here.
- `src/components/codenames/Codenames.tsx` — Multiplayer-only Codenames game (see below).
- `src/components/connections/Connections.tsx` — Solo Connections game (see below).
- `src/components/chameleon/Chameleon.tsx` — Multiplayer-only Chameleon social deduction game (see below).

**Shared multiplayer layer** (`src/multiplayer/`): Extracted from Card Categories so both multiplayer games share it.

- **`src/multiplayer/transport.ts`** — WebSocket relay transport (`LocalConnection`, `createLocalPeer`). Replaces PeerJS/WebRTC on localhost (Firefox compat — see below). Not used in production.
- **`src/multiplayer/shared.ts`** — `ICE_SERVERS` (metered.ca TURN), `PlayerInfo`, `AnyDataConnection` union type.
- `src/components/card-categories/LocalTransport.ts` — Re-exports from `../../multiplayer/transport` (kept for backward-compat imports in CardCategories).

**PvP networking pattern** (star topology — used by both Card Categories and Codenames): the first player becomes host; others connect peer-to-peer to the host's peer ID. The host is authoritative and relays `ToClientMsg` to all clients. Non-hosts send `ToHostMsg` only to the host. On localhost, `createLocalPeer()` replaces PeerJS with a WebSocket relay (`scripts/relay-server.mjs`, started alongside Vite via `npm run dev`) because Firefox private mode isolates mDNS ICE candidates and partitions BroadcastChannel. Production uses real PeerJS with TURN relays.

**Card Categories** (`src/components/card-categories/`):

- **`CardCategories.tsx`** — Main component: lobby, game state, host game logic, network event wiring. Manages connection state with refs (not Redux) to avoid stale closure issues. In multiplayer, the host runs a 60-second per-turn `setTimeout`; expiry calls `hostHandleWrong` (same as a wrong guess). Clients receive a `turnDeadline` timestamp in `guessing-start`/`guess-correct` messages and render a countdown bar. When the host disconnects, guests are redirected to setup with an error message. After game-over, the host sends `back-to-lobby` to return everyone to the room without destroying connections. The category picker (leader) always guesses first. The current guesser can press "Resign turn" to forfeit (costs a life). Player name is persisted to `localStorage` (`cc-player-name`) so it pre-fills on next visit.
- **`network.ts`** — Re-exports `ICE_SERVERS`, `PlayerInfo`, `AnyDataConnection` from shared; adds Card Categories-specific `MAX_PLAYERS=4` and `ToHostMsg`/`ToClientMsg` message types.
- **`categoryUtils.ts`** — Category generation (`generateCategories`) and card matching logic (`cardMatchesCategory`).

**Codenames** (`src/components/codenames/`): Multiplayer-only (up to 8 players). Two teams (Red/Blue); each team has a Spymaster and operatives. Spymaster gives a one-word clue + number; operatives click board cards. Clicking the assassin card loses instantly. First team to reveal all their cards wins.

- **`Codenames.tsx`** — Main component: lobby with team/role selection, 5×5 board rendering, host-authoritative game logic, per-game chat.
- **`codenamesTypes.ts`** — Re-exports shared types; defines `Team`, `CellTeam`, `BoardCell`, `CodenamesPlayer`, `ToHostMsg`, `ToClientMsg`.
- **`codenamesUtils.ts`** — `buildWordPool(cards)` (top-viewed monsters per race/attribute/type + race/attribute/type names + popular archetypes) and `generateBoard(cards)` (picks 25 words, assigns 9 red/8 blue/7 neutral/1 assassin).

**Connections** (`src/components/connections/`): Solo puzzle game. 16 card names shown in a 4×4 grid; player groups them into 4 categories of 4. Up to 4 mistakes allowed. Categories are color-coded by difficulty: yellow (archetype) → green (frame type) → blue (attribute) → purple (ban status/level/race). Board generated from the top 3000 most-viewed cards; `generateBoard` picks one category per tier in order, excluding already-used card names to prevent overlap. Score = `(4 - mistakes) * 100` on win, 0 on loss. Auto-solves the last group when 3 of 4 categories are found.

- **`Connections.tsx`** — Main component: pre-game intro, 4×4 tile grid, solved-category banners, shake animation on wrong guess, ScoreEntry modal on game end.
- **`connectionsUtils.ts`** — `generateBoard(cards)` and category builder functions (`tryArchetype`, `tryFrameType`, `tryAttribute`, `tryBanStatus`, `tryLevel`, `tryRace`).

**Chameleon** (`src/components/chameleon/`): Multiplayer-only social deduction (3-6 players) based on the board game. One player is secretly the Chameleon who knows only the topic; everyone else knows which of the 16 words on a 4×4 grid is the real secret Yu-Gi-Oh! card. Players take turns saying one word to prove they know the card, then vote out the imposter. If caught, the Chameleon clicks a word on the board to guess — if correct they still win. The 16 grid words are drawn from the top 100 most-viewed cards matching the topic criteria (attribute, race, frame type, or level). Scoring: Chameleon +3 for escaping/guessing correctly, players +1 for catching them.

- **`Chameleon.tsx`** — Main component: lobby, host-authoritative game logic, turn-based speaking, voting, board-click guess, per-game chat.
- **`chameleonTypes.ts`** — Re-exports shared types; defines `ChameleonPlayer`, `PlayerWord`, `ChameleonGameState` (with `gridWords` and `secretWordIndex`), `ToHostMsg`, `ToClientMsg`.

**Scoring** (Card Guesser): Points by zoom level `[0, 100, 300, 500, 700, 1000]` minus `wrongGuesses.length * 100`, min 0. 60-second per-card timer, 15-minute (900s) challenge timer, both counted down by a single `tickSecond` Redux action on a `setInterval`.

**Theme:** `data-theme` attribute on `<html>`, toggled in `App.tsx`, persisted to `localStorage`. CSS vars are defined per theme in `App.css`.

**Deployment:** GitHub Actions (`deploy.yml`) builds on push to `main` and deploys `dist/` to GitHub Pages. Vite base is `/CardGuesser/`.

**Typed hooks:** `src/hooks/hooks.ts` exports `useAppDispatch` and `useAppSelector` — always use these instead of the raw Redux hooks.

**Shared utilities and types:**
- `src/hooks/hooks.ts` — typed Redux hooks (`useAppDispatch`, `useAppSelector`)
- `src/types/types.ts` — shared TypeScript types (`Card`, `CardSet`)
- `src/utils/utils.ts` — shared utility functions (`getRandomCard`, `formatTime`, `randomCrop`, `preloadImages`)
- `src/services/leaderboard.ts` — localStorage leaderboard service (`getLeaderboard`, `addScore`; also exports `LeaderboardEntry` and `GameKey` types)

## Committing changes

Never auto-commit changes. Only run `git commit` when the user explicitly asks. When asked to commit, stage all modified and new files and use a subject line ≤ 70 characters explaining *what* changed and *why*. Always include the co-author trailer:

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Git workflow after code changes

After every code change, stage, commit, and push automatically:

```powershell
git add -A
git commit -m "describe changes made"
git push
```

## README.md synchronization

Whenever `CLAUDE.md` or `README.md` is updated, **always update both files** so they stay in sync. Changes to architecture, game modes, commands, or conventions described in one must be reflected in the other.

## Global CLAUDE.md propagation

The global orchestrator context lives at `{ROOT}\CLAUDE.md` (where `{ROOT}` is `C:\Users\a1670\Documents\GitHub` or `C:\Users\milyu\source\repos`). It contains the authoritative per-repo summary that cross-repo sessions and subagents read to understand this project.

After any significant change in this repo, **also update the `### CardGuesser` section in that global file** so it stays accurate.

### What counts as a significant change

Update the global files when you:
- Add, remove, or rename a major game mode or feature
- Add, remove, or upgrade a key dependency (new major library, framework version bump)
- Change a build command, script name, or dev workflow step
- Change the card data source, its format, or the external API integration
- Rename key files listed in the global file, or restructure top-level directories
- Change the deployment process or GitHub Actions workflow
- Add or remove a top-level npm script

**Do not** update the global files for routine bug fixes, minor refactors, style tweaks, or anything that doesn't affect how an agent unfamiliar with the repo should approach working in it.

### What to update

Find the `### CardGuesser` section in `{ROOT}\CLAUDE.md` and update whichever parts accurately reflect your change: the feature list, the key files table, the stack description, the commands block, or the card data notes.
