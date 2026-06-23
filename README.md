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
