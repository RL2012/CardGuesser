// ── Network constants & message types (multiplayer-only) ─────────────────────

export const MAX_PLAYERS = 4

export const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:443', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
]

export interface PlayerInfo { peerId: string; name: string }

export interface ChatMessage { id: number; name: string; text: string; self: boolean }

// Messages sent from a non-host client to the host
export type ToHostMsg =
  | { type: 'hello'; name: string; peerId: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'pick-category'; idx: number }
  | { type: 'submit-guess'; cardId: number }
  | { type: 'resign' }

// Messages sent from the host to all clients
export type ToClientMsg =
  | { type: 'player-list'; players: PlayerInfo[] }
  | { type: 'player-joined'; player: PlayerInfo }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'game-start' }
  | { type: 'round-start'; leader: string; categories: import('./categoryUtils').Category[]; lives: Record<string, number>; prevRoundInfo?: { categoryLabel: string; unguessedCards: { cardId: number; cardName: string }[] } }
  | { type: 'guessing-start'; category: import('./categoryUtils').Category; guesserOrder: string[]; turnDeadline?: number; turnDuration?: number }
  | { type: 'guess-correct'; guesser: string; cardId: number; cardName: string; nextGuesserIdx: number; turnDeadline?: number; turnDuration?: number }
  | { type: 'guess-wrong'; guesser: string; lives: Record<string, number>; eliminated: string | null; cardId: number | null; cardName: string | null }
  | { type: 'game-over'; winner: string; prevRoundInfo?: { categoryLabel: string; unguessedCards: { cardId: number; cardName: string }[] } }
  | { type: 'back-to-lobby' }
