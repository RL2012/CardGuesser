import type { Card } from '../../types/types'

export type DifficultyColor = 'yellow' | 'green' | 'blue' | 'purple'

export interface ConnectionsCategory {
  label: string
  cards: string[]
  color: DifficultyColor
}

export interface ConnectionsBoard {
  categories: ConnectionsCategory[]
  shuffledCards: string[]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

type BuildResult = { label: string; cards: Card[] }

// Yellow: well-known archetype (most cards = most popular)
function tryArchetype(pool: Card[]): BuildResult | null {
  const map = new Map<string, Card[]>()
  for (const c of pool) {
    if (!c.archetype) continue
    const list = map.get(c.archetype) ?? []
    list.push(c)
    map.set(c.archetype, list)
  }
  const valid = shuffle([...map.entries()].filter(([, cs]) => cs.length >= 4))
  if (!valid.length) return null
  const [name, cards] = valid[0]
  return { label: `${name} Archetype`, cards: pick(cards, 4) }
}

// Green: extra-deck or ritual frame type
function tryFrameType(pool: Card[]): BuildResult | null {
  const types: [string, string][] = [
    ['fusion', 'Fusion Monsters'],
    ['synchro', 'Synchro Monsters'],
    ['xyz', 'XYZ Monsters'],
    ['link', 'Link Monsters'],
    ['ritual', 'Ritual Monsters'],
  ]
  for (const [ft, label] of shuffle(types)) {
    const matching = pool.filter(c => c.frameType === ft)
    if (matching.length >= 4) return { label, cards: pick(matching, 4) }
  }
  return null
}

// Blue: monster attribute
function tryAttribute(pool: Card[]): BuildResult | null {
  const attrs = shuffle(['DARK', 'LIGHT', 'FIRE', 'WATER', 'EARTH', 'WIND'])
  for (const attr of attrs) {
    const matching = pool.filter(c => c.attribute === attr)
    if (matching.length >= 4) return { label: `${attr} Attribute`, cards: pick(matching, 4) }
  }
  return null
}

// Purple option A: ban list status
function tryBanStatus(pool: Card[]): BuildResult | null {
  for (const ban of shuffle(['Forbidden', 'Limited', 'Semi-Limited'])) {
    const matching = pool.filter(c => c.banTcg === ban)
    if (matching.length >= 4) return { label: `${ban} Cards`, cards: pick(matching, 4) }
  }
  return null
}

// Purple option B: monster level
function tryLevel(pool: Card[]): BuildResult | null {
  const levels = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12])
  for (const lv of levels) {
    const matching = pool.filter(c => c.level === lv && c.atk !== null)
    if (matching.length >= 4) return { label: `Level ${lv} Monsters`, cards: pick(matching, 4) }
  }
  return null
}

// Purple option C: monster race
function tryRace(pool: Card[]): BuildResult | null {
  const map = new Map<string, Card[]>()
  for (const c of pool) {
    if (c.atk === null) continue
    const list = map.get(c.race) ?? []
    list.push(c)
    map.set(c.race, list)
  }
  const valid = shuffle([...map.entries()].filter(([, cs]) => cs.length >= 4))
  if (!valid.length) return null
  const [race, cards] = valid[0]
  return { label: `${race}-Type Monsters`, cards: pick(cards, 4) }
}

type Builder = (pool: Card[]) => BuildResult | null

const TIER_BUILDERS: Record<DifficultyColor, Builder[]> = {
  yellow: [tryArchetype],
  green: [tryFrameType],
  blue: [tryAttribute],
  purple: [tryBanStatus, tryLevel, tryRace],
}

export function generateBoard(allCards: Card[]): ConnectionsBoard {
  // Use the most-viewed cards so names are recognisable
  const pool = [...allCards].sort((a, b) => b.views - a.views).slice(0, 3000)

  const colors: DifficultyColor[] = ['yellow', 'green', 'blue', 'purple']

  for (let attempt = 0; attempt < 30; attempt++) {
    const categories: ConnectionsCategory[] = []
    const used = new Set<string>()
    let ok = true

    for (const color of colors) {
      const available = pool.filter(c => !used.has(c.name))
      let found = false

      for (const builder of shuffle([...TIER_BUILDERS[color]])) {
        const result = builder(available)
        if (!result || result.cards.length < 4) continue
        result.cards.forEach(c => used.add(c.name))
        categories.push({ label: result.label, cards: result.cards.map(c => c.name), color })
        found = true
        break
      }

      if (!found) { ok = false; break }
    }

    if (ok && categories.length === 4) {
      return {
        categories,
        shuffledCards: shuffle(categories.flatMap(cat => cat.cards)),
      }
    }
  }

  return { categories: [], shuffledCards: [] }
}
