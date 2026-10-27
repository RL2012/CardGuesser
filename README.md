# Card Guesser

A Yu-Gi-Oh! card mini-game web app with nine game modes. Built with React + TypeScript + Vite and installable as a PWA on GitHub Pages.

**[Play it here](https://rl2012.github.io/CardGuesser/)**

Install it from a supported browser for a standalone app experience. The app shell and card database work offline after the first successful load; card images and multiplayer still require a network connection.

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

Each card's name is shown under its picture before you pick, so you can still tell which card it is when the image fails to load.

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

### Charades
A multiplayer-only team game (minimum 4 players, at least 2 per team) split into Red and Blue teams. Each turn, one team's **describer** gets a random card and describes it over voice chat (not in-app) without saying its name, while their teammates guess out loud.

Before guessing starts, the describer sees a **prep screen** showing their card and a button to start the 60-second guessing round. During the round, only the describer can see the card — everyone else just sees a running correct/skipped count. The describer can **Skip** a card they can't describe or mark **Got It!** to score a point for their team and draw a new card; skipped cards don't score. After 60 seconds the turn ends automatically, every card from that turn (word + whether it was guessed or skipped) is revealed to the whole room, and the other team gets a turn. Each team gets 3 turns (6 turns total, alternating); describer rotates within a team each time it's their turn. A sidebar **Card Log** accumulates every revealed card across the whole game, not just the turn that just ended. Highest combined score when all turns are used wins (a tie is possible).

Uses the same WebRTC/WebSocket multiplayer infrastructure as Card Categories, Codenames, and Chameleon.

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
| PWA | vite-plugin-pwa + Workbox |
| Card data | [YGOProDeck API](https://db.ygoprodeck.com/api-guide/) (`?misc=yes`), per-printing prices from [tcgcsv.com](https://tcgcsv.com) via YgoDomainBuilder |
| Card images | `images.ygoprodeck.com` (external CDN) |

---

## Development

```bash
npm install
npm run dev          # Dev server at http://localhost:5173
npm run build        # Type-check + production build
npm run lint         # ESLint
npm test             # node --test over tests/**/*.test.ts (Node 24 runs the TypeScript directly)
npm run format       # Prettier
npm run fetch-cards  # Manual fallback: regenerate public/cards.txt from YGOProDeck alone
```

Card data is pre-fetched into `public/cards.txt` (pipe-delimited, 16 columns: `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice`) so the app doesn't need to hit the API on every load. You normally don't refresh it by hand: YgoDomainBuilder's manual "Update All Card Info" sync rewrites it and pushes it, which deploys it (see "Card data sync" below).

---

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). The workflow runs on Node 24 and does `npm ci`, `npm run lint`, `npm test`, then `npm run build`. If lint or a test fails, nothing deploys and the live site keeps the previous build. That matters for card data: `tests/cardIds.test.ts` reads `public/cards.txt`, so a bad file pushed by YgoDomainBuilder's sync fails the run instead of going live. The Vite build generates `manifest.webmanifest`, `sw.js`, the precache manifest, and the install icons in `dist/`.

---

# Architecture & Implementation Reference (detailed)

> Human-facing deep reference, moved out of `CLAUDE.md` (the agent brief) to keep it small. When you change a feature, write the full detail here and the trimmed rule in `CLAUDE.md`.

## Architecture

**Stack:** React 19 + TypeScript + Vite, Redux Toolkit for game state, Fuse.js for fuzzy search, PeerJS for WebRTC, and vite-plugin-pwa/Workbox for PWA generation. TypeScript target is ES2022 with `verbatimModuleSyntax` and `erasableSyntaxOnly` enabled (matches YgoDomainBuilder reference config).

**PWA and offline behavior:** `vite.config.ts` generates a prompted-update service worker and a manifest scoped to `/CardGuesser/`. Workbox precaches the built app shell, icons, fallback image, and `cards.txt`; its size limit is raised to 12 MiB because the card database exceeds Workbox's default 2 MiB limit. `App.tsx` reports when offline content is ready, lets players defer a new-version reload until a game is safe to leave, and disables multiplayer while offline. Cross-origin YGOProDeck card images are deliberately not runtime-cached; failed image loads use the same-origin offline placeholder. Card data requests derive from `import.meta.env.BASE_URL` so local and Pages builds use the correct base path.

**Card data loading** (`src/store/cardsSlice.ts`): On startup `App.tsx` dispatches `fetchCards`, which tries `GET /cards.txt` (a pre-generated pipe-delimited flat file) and falls back to the live ygoprodeck API. All game modes gate rendering behind `status === 'succeeded'`. Both paths pass the parsed list through `playableCards` (`src/utils/cardIds.ts`), which drops ids from 100,000,000 to 199,999,999 and any id already seen. That block is YGOProDeck's for announced cards that have no passcode yet, and it keeps serving the row after the card is released under its real 8-digit passcode, usually under a different name, so the old row becomes a duplicate (101304014 "Elvennotes Regina" beside 56651978 "Elfnote Regina", 101303071 "Elvennotes ~Oracle Alicetea~" beside 50590801 "Elfnotes: Aristeia of Trust"). Measured 2026-10-12: 63 such rows in the file, 61 with no image on YGOProDeck's CDN. YgoDomainBuilder's export leaves out the same range, so the next sync drops them from the file too. An audit of the whole API that day found no other duplicate shape: no name appears twice, the only cards sharing rules text and stats are deliberate sets (the Ojamas, the Numeron Gates, Spirit Message, the Sarcophagi), and the Speed Duel skill cards (300…) and World Championship prize cards (501…) duplicate nothing. `tests/cardIds.test.ts` pins the range and the repeated-id guard, and checks the committed `cards.txt` loads with no pre-release id, repeated id or repeated name. Card images are loaded from `images.ygoprodeck.com/images/cards/{id}.jpg` (full card, `cards_cropped/` for the artwork only; the bare `/{id}.jpg` path 404s) (external CDN, not bundled). The `public/cards.txt` format is `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice` (16 pipe-delimited columns). Column 10 is a JSON array of printings, each `{setName, setCode, setRarity, setPrice, setEdition}`. **Price Check reads `setPrice` per printing** and plays only printings priced above zero; column 15 (`tcgplayerPrice`, YGOProDeck's card-level `card_prices[0].tcgplayer_price`) is parsed but no mode reads it.

**Card data sync** (writer: YgoDomainBuilder's `Helpers/CardGuesserExport.cs` + `Managers/CardGuesserPublisher.cs`): YGOProDeck removed its `tcgplayer_data` parameter on 2026-09-03. The parameter now 400s the whole request, and without it `card_sets` has no `set_edition`, its `set_price` is YGOProDeck's own figure, and colour variants collapse into one entry per set code and rarity. YgoDomainBuilder had already moved its per-printing prices to tcgcsv.com's TCGplayer mirror, so it now writes this file too. At the end of the admin "Update All Card Info" sync (deliberately NOT the daily 12:00 price poll, so the site redeploys only when you sync by hand), it builds the file from the YGOProDeck response it just processed plus its own stored printings, writes it into this repo's local checkout on the server, and if git sees a change, commits `public/cards.txt` alone (a pathspec commit, so other uncommitted work is untouched) and pushes `main`, which deploys Pages. The outcome (`CardGuesser pushed <hash>` / `unchanged` / `publish failed: ...`) is appended to that sync's Run History line on YgoDomainBuilder's admin page. It skips when the checkout is not on `main`, when no GitHub token is configured, or when the new card count is under 90% of the published file's (a truncated upstream answer). Printings are sorted so an unchanged catalogue produces identical text; a printing whose stored price is card-level (`PriceIsCardLevel`) or missing is written with `setPrice` `"0"` so Price Check leaves it out rather than quizzing on the wrong figure. Card names come HTML-decoded. A card YgoDomainBuilder has no stored printings for keeps YGOProDeck's own `card_sets`. Each publish that changes something is one commit, about 150 KB of pack growth.

`npm run fetch-cards` (`scripts/fetch-cards.mjs`) is the manual fallback and writes the same 16 columns from YGOProDeck alone, with no editions and YGOProDeck's own set prices. If you change the format, change both writers and the parser in `cardsSlice.ts` together.

**Redux store** (`src/store/`):

- `cards` — shared card list, loaded once at startup
- `game` — Card Guesser state: current card, crop position (`cropX`/`cropY` as 0–1 fractions), zoom level (5 = most zoomed, 1 = full card), timers, scores, round history
- `higherOrLower` — Higher or Lower state; includes `mode: 'atk' | 'price' | 'date'` — ATK Battle compares monster ATK, Price Check compares per-printing TCGplayer prices (`setPrice`; printings priced 0 are excluded), Newer or Older compares TCG release dates (`tcgDate`)

**Game modes** are tab-switched in `App.tsx`; each is a self-contained component tree. The nav bar is organized into sections: Home, Leaderboards, then **Solo** games (Card Guesser, Higher or Lower, Connections, Card Wordle, Trivia Blitz) and **Multiplayer** games (Card Categories, Codenames, Chameleon, Charades). On mobile (≤600px) the nav collapses into a slide-in hamburger drawer.

- `src/components/card-guesser/` — four components: `CardGuesser` (orchestrator with timers), `CardDisplay` (CSS crop/zoom), `CardSearch` (Fuse.js autocomplete), `PreviousRounds`
- `src/components/higher-or-lower/HigherOrLower.tsx` — self-contained with its own Redux slice
- `src/components/connections/Connections.tsx` — Solo Connections puzzle game (see below).
- `src/components/wordle/CardWordle.tsx` — Solo Card Wordle: guess a hidden monster card in 6 tries using colour-coded property hints (Attribute, Type, Race, Archetype, Level, ATK, DEF, Banlist). See `wordleUtils.ts`.
- `src/components/trivia/TriviaBlitz.tsx` — Solo Trivia Blitz: rapid-fire multiple-choice quiz (attribute, archetype, race, frame type, banlist, highest ATK). 15s timer, 3 lives, streak/time bonuses. See `triviaUtils.ts`.
- `src/components/Leaderboards.tsx` — Standalone leaderboards page showing top 5 across 9 leaderboard categories (8 game modes — Higher or Lower split into ATK/Price/Date), read from `localStorage` via `src/services/leaderboard.ts`.
- `src/components/card-categories/CardCategories.tsx` — PvP and solo mode for Card Categories game. All PvP networking logic lives here.
- `src/components/codenames/Codenames.tsx` — Multiplayer-only Codenames game (see below).
- `src/components/chameleon/Chameleon.tsx` — Multiplayer-only Chameleon social deduction game (see below).
- `src/components/charades/Charades.tsx` — Multiplayer-only Charades team game (see below).

**Shared multiplayer layer** (`src/multiplayer/`): Extracted from Card Categories so both multiplayer games share it.

- **`src/multiplayer/transport.ts`** — WebSocket relay transport (`LocalConnection`, `createLocalPeer`). Replaces PeerJS/WebRTC on localhost (Firefox compat — see below). Not used in production.
- **`src/multiplayer/shared.ts`** — `ICE_SERVERS` (metered.ca TURN), `PlayerInfo`, `AnyDataConnection` union type.

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

**Charades** (`src/components/charades/`): Multiplayer-only team game (minimum 4 players, at least 2 per team), two teams (Red/Blue). Turns alternate between teams, 3 turns per team (6 total, `TURNS_PER_TEAM` in `charadesTypes.ts`). The describer for a turn rotates round-robin through that team's player order (shuffled once at game start). The host draws a random card from a shuffled deck of the whole card pool (reshuffled when exhausted) and sends it **only to the describer's connection** (`your-card`/`next-card` messages, never broadcast) so teammates and the other team never see the word or image — describing happens over voice chat outside the app. The game has four phases per turn: `prep` (describer sees their card and a "Start Guessing Round" button), `guessing` (60-second host-authoritative countdown via `setTimeout`; while this is running, `card-progress` messages broadcast only the running correct/skipped counts and scores, never the card's word, so it stays private to the describer until the turn ends), `turn-over` (the `turn-ended` message reveals that turn's card list — word plus correct/skipped — to everyone, shown as a results panel that auto-advances after 3s), and `game-over` once all 6 turns are played (highest combined score wins; a tie is possible). Every revealed `turn-ended` entry is also appended (client-side, from the message itself — `turnNumber`/`activeTeam` ride along on `turn-ended` for this) to a running **`cardLog`** shown in a sidebar "Card Log" panel for the rest of the game, so earlier turns' cards stay visible rather than disappearing once the next turn starts; it resets on `game-started`/`back-to-lobby`/`player-disconnected-reset` like the rest of game state. Unlike Codenames, there's no per-role (Spymaster) concept — any team member can join either team, and only whoever the host currently names describer can act.

- **`Charades.tsx`** — Main component: lobby with team selection, host-authoritative turn/timer/deck logic, privacy-scoped card delivery (`sendToPlayer`), per-game chat.
- **`charadesTypes.ts`** — Re-exports shared types; defines `Team`, `CharadesPlayer`, `CharadesGameState`, `TurnCardResult` (one revealed card, scoped to the turn that just ended), `LoggedCard` (a `TurnCardResult` plus `turnNumber`/`team`, for the whole-game card log), `ToHostMsg`, `ToClientMsg`, and constants `MIN_PLAYERS_CZ`/`MAX_PLAYERS_CZ`/`TURNS_PER_TEAM`/`ROUND_DURATION_MS`.

**Scoring** (Card Guesser): Points by zoom level `[0, 100, 300, 500, 700, 1000]` minus `wrongGuesses.length * 100`, min 0. 60-second per-card timer, 15-minute (900s) challenge timer, both counted down by a single `tickSecond` Redux action on a `setInterval`.

**Theme:** `data-theme` attribute on `<html>`, toggled in `App.tsx`, persisted to `localStorage`. CSS vars are defined per theme in `App.css`.

**Typed hooks:** `src/hooks/hooks.ts` exports `useAppDispatch` and `useAppSelector` — always use these instead of the raw Redux hooks.

**Shared utilities and types:**
- `src/hooks/hooks.ts` — typed Redux hooks (`useAppDispatch`, `useAppSelector`)
- `src/types/types.ts` — shared TypeScript types (`Card`, `CardSet`)
- `src/utils/utils.ts` — shared utility functions (`getRandomCard`, `formatTime`, `randomCrop`)
- `src/services/leaderboard.ts` — localStorage leaderboard service (`getLeaderboard`, `addScore`; also exports `LeaderboardEntry` and `GameKey` types)
