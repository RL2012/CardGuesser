import { configureStore } from '@reduxjs/toolkit'
import cardsReducer from './cardsSlice'
import gameReducer from './gameSlice'

export const store = configureStore({
  reducer: {
    cards: cardsReducer,
    game: gameReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
