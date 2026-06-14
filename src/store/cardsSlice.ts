import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { Card } from '../types'

const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

interface YgoCard {
  id: number
  name: string
}

interface YgoResponse {
  data: YgoCard[]
}

export interface CardsState {
  cards: Card[]
  status: 'idle' | 'loading' | 'succeeded' | 'failed'
  error: string | null
}

const initialState: CardsState = {
  cards: [],
  status: 'idle',
  error: null,
}

export const fetchCards = createAsyncThunk('cards/fetch', async () => {
  // Try pre-generated static file first (id|name per line)
  const txtRes = await fetch('/cards.txt').catch(() => null)
  if (txtRes?.ok) {
    const text = await txtRes.text()
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const pipe = line.indexOf('|')
        return { id: parseInt(line.slice(0, pipe)), name: line.slice(pipe + 1) }
      })
  }

  // Fall back to live API
  const apiRes = await fetch(YGOPRO_API)
  if (!apiRes.ok) throw new Error(`API error ${apiRes.status}`)
  const json: YgoResponse = await apiRes.json()
  return json.data.map((c) => ({ id: c.id, name: c.name }))
})

const cardsSlice = createSlice({
  name: 'cards',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchCards.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchCards.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.cards = action.payload
      })
      .addCase(fetchCards.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.error.message ?? 'Unknown error'
      })
  },
})

export default cardsSlice.reducer
