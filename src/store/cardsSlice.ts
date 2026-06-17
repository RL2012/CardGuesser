import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { Card, CardSet } from '../types/types'
import { applyDataFix } from '../utils/dataFixes'

const YGOPRO_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes'

interface YgoCardSet {
  set_name: string
  set_code: string
  set_rarity: string
  set_price: string
}

interface YgoMiscInfo {
  views: number
  viewsweek: number
  tcg_date?: string
}

interface YgoCardPrices {
  tcgplayer_price?: string
}

interface YgoCard {
  id: number
  name: string
  type?: string
  frameType?: string
  attribute?: string
  atk?: number
  def?: number
  level?: number
  linkval?: number
  race?: string
  archetype?: string
  card_sets?: YgoCardSet[]
  card_prices?: YgoCardPrices[]
  banlist_info?: { ban_tcg?: string }
  misc_info?: YgoMiscInfo[]
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

function parseTcgPrice(s: string | undefined): number | null {
  if (!s || s === '') return null
  const n = parseFloat(s)
  return isNaN(n) || n <= 0 ? null : n
}

// Flat file format (columns 0–15):
// id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice
function parseLine(line: string): Card {
  const p = line.split('|')
  let cardSets: CardSet[]
  try {
    cardSets = p[10] ? JSON.parse(p[10]) : []
  } catch {
    cardSets = []
  }
  return applyDataFix({
    id: parseInt(p[0]),
    name: p[1] ?? '',
    frameType: p[2] ?? '',
    type: p[3] ?? '',
    attribute: p[4] ?? '',
    atk: parseNum(p[5]),
    def: parseNum(p[6]),
    level: parseNum(p[7]),
    race: p[8] ?? '',
    archetype: p[9] || null,
    cardSets,
    banTcg: p[11] || null,
    views: parseInt(p[12]) || 0,
    viewsWeek: parseInt(p[13]) || 0,
    tcgDate: p[14] || null,
    tcgplayerPrice: parseTcgPrice(p[15]),
  })
}

function mapYgoCard(c: YgoCard): Card {
  const misc = c.misc_info?.[0]
  return applyDataFix({
    id: c.id,
    name: c.name,
    frameType: c.frameType ?? '',
    type: c.type ?? '',
    attribute: c.attribute ?? '',
    atk: c.atk ?? null,
    def: c.def ?? null,
    level: c.frameType === 'link' ? (c.linkval ?? null) : (c.level ?? null),
    race: c.race ?? '',
    archetype: c.archetype ?? null,
    cardSets: (c.card_sets ?? []).map((s) => ({
      setName: s.set_name,
      setCode: s.set_code,
      setRarity: s.set_rarity,
      setPrice: s.set_price,
    })),
    banTcg: c.banlist_info?.ban_tcg ?? null,
    views: misc?.views ?? 0,
    viewsWeek: misc?.viewsweek ?? 0,
    tcgDate: misc?.tcg_date ?? null,
    tcgplayerPrice: parseTcgPrice(c.card_prices?.[0]?.tcgplayer_price),
  })
}

export const fetchCards = createAsyncThunk('cards/fetch', async () => {
  // Try pre-generated static file first
  const txtRes = await fetch('/CardGuesser/cards.txt').catch(() => null)
  if (txtRes?.ok) {
    const text = await txtRes.text()
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map(parseLine)
  }

  // Fall back to live API
  const apiRes = await fetch(YGOPRO_API)
  if (!apiRes.ok) throw new Error(`API error ${apiRes.status}`)
  const json: YgoResponse = await apiRes.json()
  return json.data.map(mapYgoCard)
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
