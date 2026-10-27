import type { Card, CardSet } from '../types/types'
import { applyDataFix } from './dataFixes.ts'

function parseNum(s: string | undefined): number | null {
  if (s === undefined || s === '') return null
  const n = parseInt(s)
  return isNaN(n) ? null : n
}

export function parseTcgPrice(s: string | undefined): number | null {
  if (!s || s === '') return null
  const n = parseFloat(s)
  return isNaN(n) || n <= 0 ? null : n
}

// Flat file format (columns 0–15):
// id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice
export function parseLine(line: string): Card {
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
