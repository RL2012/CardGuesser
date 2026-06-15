# Card Guesser

A Yu-Gi-Oh! card mini-game web app with four game modes. Built with React + TypeScript + Vite, deployed to GitHub Pages.

**[Play it here](https://rl2012.github.io/CardGuesser/)**

---

## Game Modes

### Card Guesser
A zoomed-in crop of a card image is shown. Type the card name to guess it. Each round starts at maximum zoom (level 5) and zooms out over time. Earn more points by guessing at higher zoom levels — points decrease for each wrong guess. A 60-second per-card timer auto-skips; the full challenge runs 15 minutes.

**Scoring:** `[0, 100, 300, 500, 700, 1000]` points by zoom level, minus 100 per wrong guess.

### Higher or Lower
Two random monster cards are shown face-down. Pick which has the higher ATK stat. 3 lives, with streak bonuses every 3 consecutive correct answers.

### Card Categories
A category is shown (e.g. "LIGHT Dragons", "Beast Fusion monsters", "Monsters with 1800 ATK"). Players guess cards that match. Supports **solo** and **multiplayer** modes.

- **Solo:** A category is auto-picked each round. Guess 3 correct cards to win the round and earn a point. One wrong guess costs a life. 3 lives total.
- **Multiplayer** (up to 4 players, WebRTC via PeerJS): A leader picks from 3 categories each round, then players guess in rotation. Wrong guess loses a life and eliminates that player from the round; last player with lives remaining wins.

Categories are generated from templates (race + attribute, race + card type, ATK value, DEF value). Race-combo categories are weighted much more likely than ATK/DEF categories.

---

## Leaderboards

Card Guesser and Higher or Lower track your top 5 high scores locally (localStorage). After each game you're prompted to enter your name. View all leaderboards from the **Home** tab.

---

## Tech Stack

| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| State | Redux Toolkit |
| Search | Fuse.js (fuzzy card name matching) |
| Multiplayer | PeerJS (WebRTC), metered.ca TURN servers |
| Card data | [YGOProDeck API](https://db.ygoprodeck.com/api-guide/) (`?misc=yes`) |
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

Card data is pre-fetched into `public/cards.txt` (pipe-delimited, 15 columns: `id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate`) so the app doesn't need to hit the API on every load. Run `npm run fetch-cards` to refresh it.

---

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).
