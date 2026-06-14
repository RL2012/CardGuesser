import { configureStore } from '@reduxjs/toolkit'
import cardsReducer from './cardsSlice'
import gameReducer from './gameSlice'
import higherOrLowerReducer from './higherOrLowerSlice'

export const store = configureStore({
  reducer: {
    cards: cardsReducer,
    game: gameReducer,
    higherOrLower: higherOrLowerReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
