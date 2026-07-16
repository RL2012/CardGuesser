# Card Guesser

A Yu-Gi-Oh! card mini-game web app with eight game modes. Built with React + TypeScript + Vite, deployed to GitHub Pages.

**[Play it here](https://rl2012.github.io/CardGuesser/)**

---

## Game Modes

### Card Guesser
A zoomed-in crop of a card image is shown. Type the card name to guess it. Each round starts at maximum zoom (level 5) and zooms out over time. Earn more points by guessing at higher zoom levels — points decrease for each wrong guess. A 60-second per-card timer auto-skips; the full challenge runs 15 minutes.

**Scoring:** `[0, 100, 300, 500, 700, 1000]` points by zoom level, minus 100 per wrong guess.

### Higher or Lower
Three modes, all with 3 lives and streak bonuses every 3 correct answers:

- **ATK Battle** — two random monsters face-down; pick which has the higher ATK.
- **Price Check** — two random card printings; pick which costs more on TCGPlayer.
- **Newer or Older** — two random cards; pick which was released more recently in the TCG. The release date is revealed after each guess.

### Card Categories
A category is shown (e.g. "LIGHT Dragons", "Beast Fusion monsters", "Monsters with 1800 ATK"). Players guess cards that match. Supports **solo** and **multiplayer** modes.

- **Solo:** A category is auto-picked each round. Guess 3 correct cards to win the round and earn a point. One wrong guess costs a life. 3 lives total.
- **Multiplayer** (up to 4 players, WebRTC via PeerJS): A leader picks from 3 categories each round, then players guess in rotation. Each player has 60 seconds to name a card; running out of time counts as a wrong guess. Wrong guess or timeout loses a life; last player with lives remaining wins.

Categories are generated from a weighted pool of templates: race + attribute, race/attribute/type combos, archetype, level + race/attribute/type (with Link Rating support), card set membership, ban list status, top-100-this-week, and release year. ATK/DEF-value categories are rare; combination categories are most common.

### Codenames: Yu-Gi-Oh!
A multiplayer-only take on the classic Codenames word game with a Yu-Gi-Oh! card theme. Up to 8 players split into Red and Blue teams.

Each team has a **Spymaster** (who can see all card colors on the board) and one or more **Operatives** (who cannot). The Spymaster gives a one-word clue and a number each turn; the Operatives try to click the cards on the board that match it without hitting the Assassin card or the enemy team's cards.

**Board generation:** 25 words are drawn from a pool of top-viewed monster names per race/attribute/frame type, race/attribute/type names themselves, and popular archetype names — giving spymasters a rich set of thematic connections to exploit. Red starts with 9 cards, Blue has 8, there are 7 neutral cards, and 1 Assassin.

**Win conditions:** Reveal all your team's cards (win), or click the Assassin (instant loss for your team).

Uses the same WebRTC/WebSocket multiplayer infrastructure as Card Categories (PeerJS + metered.ca TURN, with a WebSocket relay fallback for localhost/Firefox).

### Connections
A solo puzzle mode inspired by NYT Connections. 16 Yu-Gi-Oh! card names are displayed in a 4×4 grid. Find the four groups of four that share something in common.

Categories are colour-coded by difficulty:
- **Yellow (easiest):** All four cards share an archetype (e.g. "Blue-Eyes Archetype")
- **Green:** All four are the same extra-deck or ritual summoning type (e.g. "Synchro Monsters")
- **Blue:** All four share an attribute (e.g. "DARK Attribute")
- **Purple (hardest):** All four share a ban-list status, level, or monster type (e.g. "Forbidden Cards", "Level 4 Monsters")

You have 4 mistakes before the game ends. The last group is auto-solved once the other three are found. **Scoring:** `(4 − mistakes) × 100` on a win.

### Card Wordle
A solo mode where you guess a hidden monster card in 6 tries. After each guess, colour-coded hints reveal how close you are across the card's properties: Attribute, Type, Race, Archetype, Level, ATK, DEF, and Banlist status.

### Trivia Blitz
A solo rapid-fire multiple-choice quiz about Yu-Gi-Oh! cards (attribute, archetype, race, frame type, banlist status, highest ATK). Each question has a 15-second timer. You have 3 lives, with streak and time bonuses rewarding fast, accurate answers.

### Chameleon
A multiplayer-only social deduction game (3–6 players) based on the board game. One player is secretly the **Chameleon** who knows only the topic (e.g. "DARK monsters"); everyone else knows which of the 16 words on a 4×4 grid is the real secret Yu-Gi-Oh! card.

Players take turns saying **one word** to prove they know the card. After all have spoken, everyone votes for who they think the Chameleon is. If the Chameleon escapes, they win the round (+3 pts). If caught, the Chameleon gets one chance to **click the correct word on the board** to steal the win (+3 pts); otherwise the players win (+1 pt each).

**Grid generation:** 16 words are drawn from the top 100 most-viewed cards matching the chosen topic (attribute, race, frame type, or level).

Uses the same WebRTC/WebSocket multiplayer infrastructure as Card Categories and Codenames.

---

## Leaderboards

Card Guesser, all three Higher or Lower modes, Card Categories (solo), Connections, Card Wordle, and Trivia Blitz each track your top 5 high scores locally (localStorage) — 9 leaderboard categories across the 8 game modes (Higher or Lower is split into ATK, Price, and Date). After each game you're prompted to enter your name. View all leaderboards from the **Home** tab.

---

## Tech Stack

| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| State | Redux Toolkit |
| Search | Fuse.js (fuzzy card name matching) |
| Multiplayer | PeerJS (WebRTC), metered.ca TURN servers |
| Card data | [YGOProDeck API](https://db.ygoprodeck.com/api-guide/) (`?misc=yes&tcgplayer_data=true`) |
| Card images | `images.ygoprodeck.com` (external CDN) |

---

## Development

```bash
npm install
npm run dev          # Dev server at http://localhost:5173
npm run build        # Type-check + production build
npm run lint         # ESLint
npm run format       # Prettier
npm run fetch-cards  # Regenerate public/cards.txt from YGOProDeck API
```

Card data is pre-fetched into `public/cards.txt` (pipe-delimited, 16 columns: `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice`) so the app doesn't need to hit the API on every load. Run `npm run fetch-cards` to refresh it.

---

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).

---

# Architecture & Implementation Reference (detailed)

> Human-facing deep reference, moved out of `CLAUDE.md` (the agent brief) to keep it small. When you change a feature, write the full detail here and the trimmed rule in `CLAUDE.md`.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Redux Toolkit for game state, Fuse.js for fuzzy search, PeerJS for WebRTC. TypeScript target is ES2022 with `verbatimModuleSyntax` and `erasableSyntaxOnly` enabled (matches YgoDomainBuilder reference config).

**Card data loading** (`src/store/cardsSlice.ts`): On startup `App.tsx` dispatches `fetchCards`, which tries `GET /cards.txt` (a pre-generated pipe-delimited flat file) and falls back to the live ygoprodeck API. All game modes gate rendering behind `status === 'succeeded'`. Card images are loaded from `images.ygoprodeck.com/{id}.jpg` (external CDN, not bundled). The `public/cards.txt` format is `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice` (16 pipe-delimited columns) — regenerated via `npm run fetch-cards`. Column 15 (`tcgplayerPrice`) comes from `card_prices[0].tcgplayer_price` in the YGOProDeck API; cards with a missing or zero price are excluded from Price Check mode.

**Redux store** (`src/store/`):

- `cards` — shared card list, loaded once at startup
- `game` — Card Guesser state: current card, crop position (`cropX`/`cropY` as 0–1 fractions), zoom level (5 = most zoomed, 1 = full card), timers, scores, round history
- `higherOrLower` — Higher or Lower state; includes `mode: 'atk' | 'price' | 'date'` — ATK Battle compares monster ATK, Price Check compares TCGPlayer prices (cards with price = 0 are excluded), Newer or Older compares TCG release dates (`tcgDate`)

**Game modes** are tab-switched in `App.tsx`; each is a self-contained component tree. The nav bar is organized into sections: Home, Leaderboards, then **Solo** games (Card Guesser, Higher or Lower, Connections, Card Wordle, Trivia Blitz) and **Multiplayer** games (Card Categories, Codenames, Chameleon). On mobile (≤600px) the nav collapses into a slide-in hamburger drawer.

- `src/components/card-guesser/` — four components: `CardGuesser` (orchestrator with timers), `CardDisplay` (CSS crop/zoom), `CardSearch` (Fuse.js autocomplete), `PreviousRounds`
- `src/components/higher-or-lower/HigherOrLower.tsx` — self-contained with its own Redux slice
- `src/components/connections/Connections.tsx` — Solo Connections puzzle game (see below).
- `src/components/wordle/CardWordle.tsx` — Solo Card Wordle: guess a hidden monster card in 6 tries using colour-coded property hints (Attribute, Type, Race, Archetype, Level, ATK, DEF, Banlist). See `wordleUtils.ts`.
- `src/components/trivia/TriviaBlitz.tsx` — Solo Trivia Blitz: rapid-fire multiple-choice quiz (attribute, archetype, race, frame type, banlist, highest ATK). 15s timer, 3 lives, streak/time bonuses. See `triviaUtils.ts`.
- `src/components/Leaderboards.tsx` — Standalone leaderboards page showing top 5 across 9 leaderboard categories (8 game modes — Higher or Lower split into ATK/Price/Date), read from `localStorage` via `src/services/leaderboard.ts`.
- `src/components/card-categories/CardCategories.tsx` — PvP and solo mode for Card Categories game. All PvP networking logic lives here.
- `src/components/codenames/Codenames.tsx` — Multiplayer-only Codenames game (see below).
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

**Typed hooks:** `src/hooks/hooks.ts` exports `useAppDispatch` and `useAppSelector` — always use these instead of the raw Redux hooks.

**Shared utilities and types:**
- `src/hooks/hooks.ts` — typed Redux hooks (`useAppDispatch`, `useAppSelector`)
- `src/types/types.ts` — shared TypeScript types (`Card`, `CardSet`)
- `src/utils/utils.ts` — shared utility functions (`getRandomCard`, `formatTime`, `randomCrop`, `preloadImages`)
- `src/services/leaderboard.ts` — localStorage leaderboard service (`getLeaderboard`, `addScore`; also exports `LeaderboardEntry` and `GameKey` types)
