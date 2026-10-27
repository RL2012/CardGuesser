# CLAUDE.md — CardGuesser

Terse agent brief. Full architecture/feature detail lives in `README.md` → **"Architecture & Implementation Reference (detailed)"**.

## 🚨 Deployment — push to main = production deploy

Every push to `main` triggers a GitHub Actions deploy to GitHub Pages (`.github/workflows/deploy.yml`, Node 24: `npm ci`, `npm run lint`, `npm test`, `npm run build`, publishes `dist/` to `https://rl2012.github.io/CardGuesser/`).

**After every committed code change you MUST push to `main`** so the deploy fires. Never commit without pushing.

**Before committing, verify all pass:**
- `npm run build` (`tsc -b && vite build`)
- `npm run lint` (also enforced by the husky pre-commit hook — a lint failure aborts the commit; `npm run lint:fix` auto-fixes)
- `npm test` (`node --test` over `tests/**/*.test.ts`, no test framework installed: Node 24 strips the types itself, so a file under test must import with explicit `.ts` extensions or have no imports)
- `npm ci` (lock file is CI-compatible)

The test suite is small (card-id filtering, the 16-column `cards.txt` parser and Trivia Blitz's highest ATK question) and has no coverage target. GitHub Actions runs it and lint before the build, so a failing test (including a bad `public/cards.txt` from YgoDomainBuilder's sync) blocks the deploy.

## Commands

```bash
npm run dev          # Vite dev server + WebSocket relay (concurrently)
npm run dev:relay    # WebSocket relay only (scripts/relay-server.mjs)
npm run build        # tsc -b && vite build
npm run lint         # ESLint (must pass before commit; lint:fix to auto-fix)
npm test             # node --test tests/**/*.test.ts
npm run format       # Prettier write (format:check to verify only)
npm run preview      # Preview production build
npm run fetch-cards  # Manual fallback: regenerate public/cards.txt from YGOProDeck alone
```

## Stack & layout (one-liners; detail in README)

- React 19 + TypeScript + Vite; Redux Toolkit (game state); Fuse.js (fuzzy card search); PeerJS/WebRTC (multiplayer). TS target ES2022, `verbatimModuleSyntax` + `erasableSyntaxOnly` on.
- Game modes are tab-switched in `App.tsx`, each a self-contained component tree under `src/components/<mode>/`.
- Multiplayer games (Card Categories, Codenames, Chameleon, Charades) share `src/multiplayer/` and a host-authoritative **star topology**: first player is host + authority, relays `ToClientMsg`; clients send `ToHostMsg` only to host.
- Lobbies get their peer from `createPeer()` in `src/multiplayer/shared.ts` (typed `MultiplayerPeer`; relay on localhost, PeerJS elsewhere). Don't build a `Peer` in a component.
- **Charades** (`src/components/charades/`): team game, min 4 players / 2 per team (Red vs Blue), 3 turns per team alternating. Each turn's describer rotates round-robin within their team; the host sends their card directly to only that one connection (`your-card`/`next-card`), never broadcast, so it stays private — teammates guess via real voice chat, not the app. Prep screen → 60s host-timed guessing round (Skip / Got It!, card name hidden from everyone but the describer) → turn-over reveal (that turn's cards + results shown to the room, also appended to a running sidebar **Card Log** for the whole game) → next turn, until all 6 turns are played.

## Invariants / rules

- **`public/cards.txt`** is 16 pipe-delimited columns: `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice`. Price Check reads each printing's `setPrice` from the sets JSON (0 = left out); column 15 is parsed but unused.
- **YgoDomainBuilder writes `cards.txt`, not this repo.** Its manual admin "Update All Card Info" sync (not the daily price poll) rebuilds the file with tcgcsv per-printing prices and editions, commits that one file in this checkout on the server and pushes `main`. So: pull before pushing here, and a format change touches THREE places, `YgoDomainBuilder/Helpers/CardGuesserExport.cs`, `scripts/fetch-cards.mjs` (manual fallback, YGOProDeck only) and the parser `parseLine` in `src/utils/cardsParse.ts` (pinned by `tests/cardsParse.test.ts`). Never use YGOProDeck's `tcgplayer_data`: it was removed on 2026-09-03 and 400s the request.
- Card data loads via `GET /cards.txt` with a live ygoprodeck API fallback; all modes gate rendering on `status === 'succeeded'`. Both paths go through `playableCards` (`src/utils/cardIds.ts`), which drops YGOProDeck's pre-release ids (100,000,000 to 199,999,999) and repeated ids: upstream keeps serving pre-release rows after release, so they duplicate the real card and almost never have an image. YgoDomainBuilder's export drops the same range. Card images come from `images.ygoprodeck.com/images/cards/{id}.jpg` (full card, `cards_cropped/` for the artwork only; the bare `/{id}.jpg` path 404s) (external CDN, not bundled).
- **Always use the typed Redux hooks** `useAppDispatch`/`useAppSelector` from `src/hooks/hooks.ts`, never the raw react-redux hooks.
- Theme via `data-theme` on `<html>`, persisted to `localStorage`; CSS vars per theme in `App.css`.
- On localhost, multiplayer uses a WebSocket relay (`scripts/relay-server.mjs`) instead of PeerJS (Firefox private-mode mDNS/BroadcastChannel isolation); production uses real PeerJS + metered.ca TURN.
- PWA output is generated by `vite-plugin-pwa`: the app shell and `cards.txt` are precached (12 MiB limit), updates are user-prompted, remote card images remain online-only with a local fallback, and multiplayer is disabled offline.

## Committing

Never auto-commit — only `git commit` when the user asks. Stage all modified/new files; subject line ≤ 70 chars (what + why). Always include the co-author trailer, then **push** (triggers the deploy):

```
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

## Documentation sync — MANDATORY, same change

Any change to architecture, game modes, commands, card-data format, or conventions must update docs in the same change: write the **trimmed rule/invariant** into `CLAUDE.md` and the **full detail** into `README.md` (the detailed reference section). Keep the user-facing README Features/Game Modes list current too. A code change with no matching doc update is incomplete.

## Global CLAUDE.md propagation

After significant changes (new/removed game modes, dependencies, commands, card data, deployment), update `### CardGuesser` in the workspace-root `CLAUDE.md`.

## Looking at the running app

This repo is the exception to the workspace rule: it has no service on this box, so `npm run dev`
(5173, plus the relay on 9001) really is how you see it, and `preview_start` with a launch.json
name is fine here. Everything else in [../CLAUDE.md](../CLAUDE.md) rule 7 still holds. Look at it
in **the server's real Chrome first** (`mcp__claude-in-chrome__*`: check
`list_connected_browsers`, then `tabs_context_mcp` and `navigate`), and only after saying in your
reply that Chrome failed fall back to the sandboxed Browser pane. Do not start a dev server for a
SIBLING repo while you are in here: those are all already serving on their own ports.

---

## Folded in from the workspace-root CLAUDE.md (2026-10-15)

### CardGuesser

CardGuesser is an installable GitHub Pages PWA generated with `vite-plugin-pwa`; its app shell and `cards.txt` are precached, while remote card images and multiplayer remain online-only. Its `public/cards.txt` is written by **YgoDomainBuilder**, not by its own script: Ygo's manual admin "Update All Card Info" sync (not its daily price poll) rebuilds it with tcgcsv per-printing prices and editions, commits that one file in the local checkout and pushes `main` (since 2026-09-30, because YGOProDeck's removed `tcgplayer_data` had left `fetch-cards.mjs` 400ing). Pull before pushing CardGuesser; `npm run fetch-cards` is only a YGOProDeck-alone fallback.
