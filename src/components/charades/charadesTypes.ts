// ── Charades types & network messages ─────────────────────────────────────────

export { ICE_SERVERS, type AnyDataConnection } from '../../multiplayer/shared'

export const MIN_PLAYERS_CZ = 4
export const MAX_PLAYERS_CZ = 10
export const TURNS_PER_TEAM = 3
export const ROUND_DURATION_MS = 60_000

export type Team = 'red' | 'blue'

export interface CharadesPlayer {
  peerId: string
  name: string
  team: Team
}

export interface ChatMessage { id: number; name: string; text: string; self: boolean }

export interface TurnCardResult {
  word: string
  result: 'correct' | 'skipped'
}

export type GamePhase = 'prep' | 'guessing' | 'turn-over' | 'game-over'

export interface CharadesGameState {
  turnNumber: number
  totalTurns: number
  activeTeam: Team
  describerId: string
  phase: GamePhase
  turnDeadline: number | null
  scoreRed: number
  scoreBlue: number
  turnCorrect: number
  turnSkipped: number
  lastTurnResults: TurnCardResult[]
  winner: Team | null
}

// ── Messages sent from a non-host client to the host ──────────────────────────

export type ToHostMsg =
  | { type: 'hello'; name: string }
  | { type: 'pick-team'; team: Team }
  | { type: 'start-guessing' }
  | { type: 'skip-card' }
  | { type: 'got-it' }
  | { type: 'chat'; name: string; text: string }

// ── Messages sent from the host to all clients ────────────────────────────────

export type ToClientMsg =
  | { type: 'welcome'; players: CharadesPlayer[] }
  | { type: 'player-joined'; player: CharadesPlayer }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'player-updated'; peerId: string; team: Team }
  | { type: 'chat'; name: string; text: string }
  | { type: 'game-started'; totalTurns: number }
  | { type: 'turn-prep'; turnNumber: number; activeTeam: Team; describerId: string; describerName: string; scoreRed: number; scoreBlue: number }
  | { type: 'your-card'; id: number; word: string }
  | { type: 'guessing-started'; turnDeadline: number }
  | { type: 'card-progress'; result: 'correct' | 'skipped'; turnCorrect: number; turnSkipped: number; scoreRed: number; scoreBlue: number }
  | { type: 'next-card'; id: number; word: string }
  | { type: 'turn-ended'; scoreRed: number; scoreBlue: number; lastTurnResults: TurnCardResult[] }
  | { type: 'game-over'; scoreRed: number; scoreBlue: number; winner: Team | null }
  | { type: 'back-to-lobby' }
  | { type: 'game-in-progress' }
  | { type: 'player-disconnected-reset'; name: string }
