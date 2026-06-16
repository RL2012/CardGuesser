import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Card } from '../types/types'

interface HigherOrLowerState {
  leftCard: Card | null
  rightCard: Card | null
  lives: number
  score: number
  streak: number
  phase: 'idle' | 'picking' | 'reveal' | 'gameover'
  lastWinner: 'left' | 'right' | 'tie' | null
  playerChoice: 'left' | 'right' | null
  lastPointsEarned: number
  totalRounds: number
  correctAnswers: number
}

const MAX_LIVES = 3

const initialState: HigherOrLowerState = {
  leftCard: null,
  rightCard: null,
  lives: MAX_LIVES,
  score: 0,
  streak: 0,
  phase: 'idle',
  lastWinner: null,
  playerChoice: null,
  lastPointsEarned: 0,
  totalRounds: 0,
  correctAnswers: 0,
}

const higherOrLowerSlice = createSlice({
  name: 'higherOrLower',
  initialState,
  reducers: {
    startGame(state, action: PayloadAction<{ leftCard: Card; rightCard: Card }>) {
      state.leftCard = action.payload.leftCard
      state.rightCard = action.payload.rightCard
      state.lives = MAX_LIVES
      state.score = 0
      state.streak = 0
      state.phase = 'picking'
      state.lastWinner = null
      state.playerChoice = null
      state.lastPointsEarned = 0
      state.totalRounds = 0
      state.correctAnswers = 0
    },
    pickCard(state, action: PayloadAction<'left' | 'right'>) {
      const guess = action.payload
      const leftAtk = state.leftCard?.atk ?? -1
      const rightAtk = state.rightCard?.atk ?? -1

      let winner: 'left' | 'right' | 'tie'
      if (leftAtk > rightAtk) winner = 'left'
      else if (rightAtk > leftAtk) winner = 'right'
      else winner = 'tie'

      const isCorrect = winner === 'tie' || guess === winner

      state.playerChoice = guess
      state.lastWinner = winner
      state.totalRounds++

      if (isCorrect) {
        state.streak++
        const streakBonus = Math.floor(state.streak / 3) * 50
        const points = 100 + streakBonus
        state.score += points
        state.lastPointsEarned = points
        state.correctAnswers++
        state.phase = 'reveal'
      } else {
        state.streak = 0
        state.lives--
        state.lastPointsEarned = 0
        state.phase = state.lives <= 0 ? 'gameover' : 'reveal'
      }
    },
    nextRound(state, action: PayloadAction<{ leftCard: Card; rightCard: Card }>) {
      state.leftCard = action.payload.leftCard
      state.rightCard = action.payload.rightCard
      state.phase = 'picking'
      state.lastWinner = null
      state.playerChoice = null
      state.lastPointsEarned = 0
    },
    resetGame() {
      return initialState
    },
  },
})

export const { startGame, pickCard, nextRound, resetGame } = higherOrLowerSlice.actions
export default higherOrLowerSlice.reducer
