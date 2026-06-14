import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { Card } from '../types'

const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

interface YgoCard {
  id: number
  name: string
  frameType?: string
  attribute?: string
  atk?: number
  def?: number
  level?: number
  linkval?: number
  race?: string
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

function parseNum(s: string | undefined): number | null {
  if (s === undefined || s === '') return null
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

function parseLine(line: string): Card {
  const parts = line.split('|')
  return {
    id: parseInt(parts[0]),
    name: parts[1] ?? '',
    frameType: parts[2] ?? '',
    attribute: parts[3] ?? '',
    atk: parseNum(parts[4]),
    def: parseNum(parts[5]),
    level: parseNum(parts[6]),
    race: parts[7] ?? '',
  }
}

export const fetchCards = createAsyncThunk('cards/fetch', async () => {
  // Try pre-generated static file first (id|name|frameType|attribute|atk|def|level|race per line)
  const txtRes = await fetch('/cards.txt').catch(() => null)
  if (txtRes?.ok) {
    const text = await txtRes.text()
    return text.split('\n').map((l) => l.trim()).filter(Boolean).map(parseLine)
  }

  // Fall back to live API
  const apiRes = await fetch(YGOPRO_API)
  if (!apiRes.ok) throw new Error(`API error ${apiRes.status}`)
  const json: YgoResponse = await apiRes.json()
  return json.data.map((c): Card => ({
    id: c.id,
    name: c.name,
    frameType: c.frameType ?? '',
    attribute: c.attribute ?? '',
    atk: c.atk ?? null,
    def: c.def ?? null,
    level: c.level ?? c.linkval ?? null,
    race: c.race ?? '',
  }))
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
