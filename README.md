# Card Guesser

A Yu-Gi-Oh! card mini-game web app with three game modes. Built with React + TypeScript + Vite, deployed to GitHub Pages.

**[Play it here](https://rl2012.github.io/CardGuesser/)**

---

## Game Modes

### Card Guesser
A zoomed-in crop of a card image is shown. Type the card name to guess it. Each round starts at maximum zoom (level 5) and zooms out over time. Earn more points by guessing at higher zoom levels — points decrease for each wrong guess. A 60-second per-card timer auto-skips; the full challenge runs 15 minutes.

**Scoring:** `[0, 100, 300, 500, 700, 1000]` points by zoom level, minus 100 per wrong guess.

### Higher or Lower
Two random monster cards are shown face-down. Pick which has the higher ATK stat. 3 lives, with streak bonuses every 3 consecutive correct answers.

### PvP Lobby
Real-time multiplayer lobby (up to 4 players) using PeerJS WebRTC with metered.ca TURN servers for NAT traversal. Share your peer ID with friends to connect. Includes an in-lobby chat system. No server required — all communication is peer-to-peer.

---

## Leaderboards

Both Card Guesser and Higher or Lower track your top 5 high scores locally (localStorage). After each game you're prompted to enter your name. View all leaderboards from the **Home** tab.

---

## Tech Stack

| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| State | Redux Toolkit |
| Search | Fuse.js (fuzzy card name matching) |
| Multiplayer | PeerJS (WebRTC) |
| Card data | [YGOProDeck API](https://db.ygoprodeck.com/api-guide/) |
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

Card data is pre-fetched into `public/cards.txt` (pipe-delimited: `id|name|frameType|attribute|atk|def|level|race`) so the app doesn't need to hit the API on every load. Run `npm run fetch-cards` to refresh it.

---

## Deployment

Pushes to `main` automatically build and deploy to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`).
