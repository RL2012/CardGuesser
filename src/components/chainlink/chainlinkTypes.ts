export { ICE_SERVERS, type PlayerInfo, type AnyDataConnection } from '../../multiplayer/shared'

export const MAX_PLAYERS = 6
export const TURN_SECONDS = 30
export const MAX_LIVES = 3

export interface ChainEntry {
  cardId: number
  cardName: string
  playerPeerId: string
  playerName: string
}

export type ToHostMsg =
  | { type: 'hello'; name: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'submit-card'; cardId: number; cardName: string }

export type ToClientMsg =
  | { type: 'welcome'; players: import('../../multiplayer/shared').PlayerInfo[] }
  | { type: 'player-joined'; player: import('../../multiplayer/shared').PlayerInfo }
  | { type: 'player-list'; players: import('../../multiplayer/shared').PlayerInfo[] }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'player-disconnected-reset'; name: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'game-in-progress' }
  | { type: 'game-start'; firstCard: { id: number; name: string }; playerOrder: string[]; lives: Record<string, number> }
  | { type: 'turn-start'; playerPeerId: string; lastCard: { id: number; name: string }; deadline: number }
  | { type: 'chain-correct'; playerPeerId: string; cardId: number; cardName: string; nextPlayerPeerId: string; deadline: number; chainLength: number }
  | { type: 'chain-wrong'; playerPeerId: string; lives: Record<string, number>; nextPlayerPeerId: string; deadline: number; cardId: number | null; cardName: string | null }
  | { type: 'game-over'; winner: string; chain: { cardName: string; playerName: string }[]; lives: Record<string, number> }
