// ── Network constants & message types (Card Categories, multiplayer-only) ─────

export { type PlayerInfo, type AnyDataConnection, type ChatMessage } from '../../multiplayer/shared'

export const MAX_PLAYERS = 4

// Messages sent from a non-host client to the host
export type ToHostMsg =
  | { type: 'hello'; name: string; peerId: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'pick-category'; idx: number }
  | { type: 'submit-guess'; cardId: number }
  | { type: 'resign' }

// Messages sent from the host to all clients
export type ToClientMsg =
  | { type: 'player-list'; players: import('../../multiplayer/shared').PlayerInfo[] }
  | { type: 'player-joined'; player: import('../../multiplayer/shared').PlayerInfo; lives?: Record<string, number> }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'game-start' }
  | { type: 'round-start'; leader: string; categories: import('./categoryUtils').Category[]; lives: Record<string, number>; prevRoundInfo?: { categoryLabel: string; unguessedCards: { cardId: number; cardName: string }[] } }
  | { type: 'guessing-start'; category: import('./categoryUtils').Category; guesserOrder: string[]; turnDeadline?: number; turnDuration?: number; currentGuesserIdx?: number }
  | { type: 'guess-correct'; guesser: string; cardId: number; cardName: string; nextGuesserIdx: number; turnDeadline?: number; turnDuration?: number }
  | { type: 'guess-wrong'; guesser: string; lives: Record<string, number>; eliminated: string | null; cardId: number | null; cardName: string | null }
  | { type: 'round-draw' }
  | { type: 'game-over'; winner: string; prevRoundInfo?: { categoryLabel: string; unguessedCards: { cardId: number; cardName: string }[] } }
  | { type: 'back-to-lobby' }
