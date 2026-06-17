import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { Card } from '../types/types'

export interface PreviousRound {
  cardId: number
  cardName: string
  guessed: boolean
  pointsEarned: number
}

interface RoundPayload {
  card: Card
  cropX: number
  cropY: number
}

interface AdvancePayload {
  nextCard: Card
  cropX: number
  cropY: number
}

interface GameState {
  currentCard: Card | null
  cropX: number
  cropY: number
  zoomLevel: number // 5 = most zoomed in, 1 = full card visible
  wrongGuesses: string[]
  previousRounds: PreviousRound[]
  totalPoints: number
  cardTimeLeft: number // seconds
  challengeTimeLeft: number // seconds
  isActive: boolean
}

const initialState: GameState = {
  currentCard: null,
  cropX: 0.5,
  cropY: 0.5,
  zoomLevel: 5,
  wrongGuesses: [],
  previousRounds: [],
  totalPoints: 0,
  cardTimeLeft: 30,
  challengeTimeLeft: 300,
  isActive: false,
}

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    startRound(state, action: PayloadAction<RoundPayload>) {
      state.currentCard = action.payload.card
      state.cropX = action.payload.cropX
      state.cropY = action.payload.cropY
      state.zoomLevel = 5
      state.wrongGuesses = []
      state.cardTimeLeft = 30
      state.isActive = true
    },
    zoomOut(state) {
      if (state.zoomLevel > 1) state.zoomLevel -= 1
    },
    addWrongGuess(state, action: PayloadAction<string>) {
      if (!state.wrongGuesses.includes(action.payload)) {
        state.wrongGuesses.push(action.payload)
      }
    },
    correctGuess(state, action: PayloadAction<AdvancePayload>) {
      const ZOOM_POINTS = [0, 100, 300, 500, 700, 1000]
      const points = Math.max(0, ZOOM_POINTS[state.zoomLevel] - state.wrongGuesses.length * 100)
      if (state.currentCard) {
        state.previousRounds.unshift({
          cardId: state.currentCard.id,
          cardName: state.currentCard.name,
          guessed: true,
          pointsEarned: points,
        })
        state.totalPoints += points
      }
      state.currentCard = action.payload.nextCard
      state.cropX = action.payload.cropX
      state.cropY = action.payload.cropY
      state.zoomLevel = 5
      state.wrongGuesses = []
      state.cardTimeLeft = 30
    },
    replaceCard(state, action: PayloadAction<RoundPayload>) {
      state.currentCard = action.payload.card
      state.cropX = action.payload.cropX
      state.cropY = action.payload.cropY
      state.zoomLevel = 5
      state.wrongGuesses = []
      state.cardTimeLeft = 30
    },
    skipCard(state, action: PayloadAction<AdvancePayload>) {
      if (state.currentCard) {
        state.previousRounds.unshift({
          cardId: state.currentCard.id,
          cardName: state.currentCard.name,
          guessed: false,
          pointsEarned: 0,
        })
      }
      state.currentCard = action.payload.nextCard
      state.cropX = action.payload.cropX
      state.cropY = action.payload.cropY
      state.zoomLevel = 5
      state.wrongGuesses = []
      state.cardTimeLeft = 30
    },
    tickSecond(state) {
      if (!state.isActive) return
      if (state.challengeTimeLeft <= 0) {
        state.isActive = false
        return
      }
      state.challengeTimeLeft -= 1
      if (state.cardTimeLeft > 0) state.cardTimeLeft -= 1
    },
    resetGame() {
      return initialState
    },
  },
})

export const { startRound, zoomOut, addWrongGuess, correctGuess, replaceCard, skipCard, tickSecond, resetGame } =
  gameSlice.actions
export default gameSlice.reducer
