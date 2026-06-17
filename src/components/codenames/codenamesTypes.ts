// ── Codenames types & network messages ────────────────────────────────────────

export { ICE_SERVERS, type AnyDataConnection } from '../../multiplayer/shared'

export const MAX_PLAYERS_CN = 8

export type Team = 'red' | 'blue'
export type CellTeam = 'red' | 'blue' | 'neutral' | 'assassin'

export interface BoardCell {
  word: string
  team: CellTeam
  revealed: boolean
}

export interface CodenamesPlayer {
  peerId: string
  name: string
  team: Team
  isSpymaster: boolean
}

export interface ChatMessage { id: number; name: string; text: string; self: boolean }

// ── Messages sent from a non-host client to the host ──────────────────────────

export type ToHostMsg =
  | { type: 'hello'; name: string }
  | { type: 'pick-team'; team: Team }
  | { type: 'claim-spymaster' }
  | { type: 'give-clue'; word: string; count: number }
  | { type: 'pick-card'; index: number }
  | { type: 'end-turn' }
  | { type: 'chat'; name: string; text: string }

// ── Messages sent from the host to all clients ────────────────────────────────

export type ToClientMsg =
  | { type: 'welcome'; players: CodenamesPlayer[] }
  | { type: 'player-joined'; player: CodenamesPlayer }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'player-updated'; peerId: string; team: Team; isSpymaster: boolean }
  | { type: 'chat'; name: string; text: string }
  | { type: 'game-started'; board: BoardCell[]; activeTeam: Team; redTotal: number; blueTotal: number }
  | { type: 'clue-given'; word: string; count: number; guessesLeft?: number }
  | { type: 'card-revealed'; index: number; cellTeam: CellTeam; guessesLeft: number; redRemaining: number; blueRemaining: number }
  | { type: 'turn-ended'; activeTeam: Team }
  | { type: 'game-over'; winner: Team; reason: 'found-all' | 'assassin' }
  | { type: 'back-to-lobby' }
