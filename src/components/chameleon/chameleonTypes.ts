export { ICE_SERVERS, type AnyDataConnection } from '../../multiplayer/shared'

export const MAX_PLAYERS_CH = 6
export const MIN_PLAYERS_CH = 3

export interface ChameleonPlayer {
  peerId: string
  name: string
  score: number
}

export interface ChatMessage { id: number; name: string; text: string; self: boolean }

export interface PlayerWord {
  peerId: string
  name: string
  word: string
}

export interface PlayerVote {
  voterId: string
  targetId: string
}

export type RoundPhase = 'reveal' | 'speaking' | 'voting' | 'results'

export interface ChameleonGameState {
  round: number
  totalRounds: number
  phase: RoundPhase
  topic: string
  secretWord: string
  chameleonId: string
  words: PlayerWord[]
  votes: PlayerVote[]
  chameleonGuess: string | null
  chameleonCorrect: boolean | null
  currentSpeakerIndex: number
  speakingOrder: string[]
  winner: string | null
}

// ── Messages sent from a non-host client to the host ──────────────────────────

export type ToHostMsg =
  | { type: 'hello'; name: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'submit-word'; word: string }
  | { type: 'submit-vote'; targetId: string }
  | { type: 'chameleon-guess'; word: string }
  | { type: 'ready-for-next' }

// ── Messages sent from the host to all clients ────────────────────────────────

export type ToClientMsg =
  | { type: 'welcome'; players: ChameleonPlayer[] }
  | { type: 'player-joined'; player: ChameleonPlayer }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'chat'; name: string; text: string }
  | { type: 'game-started'; totalRounds: number }
  | { type: 'round-started'; topic: string; yourRole: 'chameleon' | 'player'; secretWord: string; speakingOrder: string[] }
  | { type: 'your-turn'; speakerName: string }
  | { type: 'word-submitted'; peerId: string; name: string; word: string }
  | { type: 'speaking-done'; words: PlayerWord[] }
  | { type: 'voting-started' }
  | { type: 'vote-cast'; voterId: string }
  | { type: 'voting-done'; votes: PlayerVote[]; chameleonId: string; secretWord: string }
  | { type: 'chameleon-guess-result'; correct: boolean; guess: string }
  | { type: 'round-over'; scores: ChameleonPlayer[] }
  | { type: 'game-over'; scores: ChameleonPlayer[] }
  | { type: 'back-to-lobby' }
  | { type: 'game-in-progress' }
  | { type: 'player-disconnected-reset'; name: string }
