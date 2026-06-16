import type { Card } from '../../types/types'

export type CategoryTemplate =
  | 'attack' | 'defense'
  | 'race-attribute' | 'race-type'
  | 'attribute-type'
  | 'archetype-type' | 'archetype'
  | 'level-race' | 'level-attribute' | 'level-type'
  | 'card-set'
  | 'ban-type'
  | 'top100week-attribute' | 'top100week-type' | 'top100week-race' | 'top100week-level'
  | 'release-attribute' | 'release-type' | 'release-race' | 'release-level'

export interface Category {
  template: CategoryTemplate
  label: string
  atk?: number
  def?: number
  race?: string
  attribute?: string
  cardType?: string
  archetype?: string
  level?: number
  isLink?: boolean
  setName?: string
  banStatus?: string
  releaseYear?: number
  top100Ids?: number[]
}

export interface GuessRecord {
  peerId: string
  cardId: number
  cardName: string
}

const MIN_CARDS = 10

// Treat Tuner subtypes as their base type for category matching and generation.
// "Synchro Tuner Monster" → "Synchro Monster", "Tuner Monster" (Normal Tuner) → "Normal Monster"
function normalizeType(type: string): string {
  if (type === 'Tuner Monster') return 'Normal Monster'
  return type.replace(' Tuner', '')
}

// ATK/DEF are rare — most categories should be more interesting combos
const TEMPLATE_WEIGHTS: [CategoryTemplate, number][] = [
  ['attack',                 1],
  ['defense',                1],
  ['race-attribute',         4],
  ['race-type',              4],
  ['attribute-type',         3],
  ['archetype-type',         2],
  ['archetype',              3],
  ['level-race',             2],
  ['level-attribute',        2],
  ['level-type',             2],
  ['card-set',               3],
  ['ban-type',               2],
  ['top100week-attribute',   1],
  ['top100week-type',        1],
  ['top100week-race',        1],
  ['top100week-level',       1],
  ['release-attribute',      1],
  ['release-type',           1],
  ['release-race',           1],
  ['release-level',          1],
]
const TOTAL_WEIGHT = TEMPLATE_WEIGHTS.reduce((s, [, w]) => s + w, 0)

function weightedRandomTemplate(): CategoryTemplate {
  let r = Math.random() * TOTAL_WEIGHT
  for (const [t, w] of TEMPLATE_WEIGHTS) { r -= w; if (r <= 0) return t }
  return 'race-attribute'
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function cardMatchesCategory(card: Card, cat: Category): boolean {
  const cardType = normalizeType(card.type)
  switch (cat.template) {
    case 'attack':             return card.atk === cat.atk
    case 'defense':            return card.def === cat.def
    case 'race-attribute':     return card.race === cat.race && card.attribute === cat.attribute
    case 'race-type':          return card.race === cat.race && cardType === cat.cardType
    case 'attribute-type':     return card.attribute === cat.attribute && cardType === cat.cardType
    case 'archetype-type':     return card.archetype === cat.archetype && cardType === cat.cardType
    case 'archetype':          return card.archetype === cat.archetype
    case 'level-race':         return card.level === cat.level && card.race === cat.race && (cat.isLink ? card.frameType === 'link' : card.frameType !== 'link')
    case 'level-attribute':    return card.level === cat.level && card.attribute === cat.attribute && (cat.isLink ? card.frameType === 'link' : card.frameType !== 'link')
    case 'level-type':         return card.level === cat.level && cardType === cat.cardType
    case 'card-set':           return card.cardSets.some(s => s.setName === cat.setName)
    case 'ban-type':           return card.banTcg === cat.banStatus && cardType === cat.cardType
    case 'top100week-attribute': return (cat.top100Ids?.includes(card.id) ?? false) && card.attribute === cat.attribute
    case 'top100week-type':      return (cat.top100Ids?.includes(card.id) ?? false) && cardType === cat.cardType
    case 'top100week-race':      return (cat.top100Ids?.includes(card.id) ?? false) && card.race === cat.race
    case 'top100week-level':     return (cat.top100Ids?.includes(card.id) ?? false) && card.level === cat.level
    case 'release-attribute': return card.tcgDate != null && card.tcgDate.startsWith(`${cat.releaseYear}`) && card.attribute === cat.attribute
    case 'release-type':      return card.tcgDate != null && card.tcgDate.startsWith(`${cat.releaseYear}`) && cardType === cat.cardType
    case 'release-race':      return card.tcgDate != null && card.tcgDate.startsWith(`${cat.releaseYear}`) && card.race === cat.race
    case 'release-level':     return card.tcgDate != null && card.tcgDate.startsWith(`${cat.releaseYear}`) && card.level === cat.level
  }
}

function tryGenerate(cards: Card[], template: CategoryTemplate): Category | null {
  const monsters = cards.filter(c => c.atk !== null)

  if (template === 'attack') {
    const counts = new Map<number, number>()
    for (const c of monsters) if (c.atk !== null) counts.set(c.atk, (counts.get(c.atk) ?? 0) + 1)
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([v]) => v)
    if (!valid.length) return null
    const atk = pickRandom(valid)
    return { template, label: `Monsters with ${atk} ATK`, atk }
  }

  if (template === 'defense') {
    const counts = new Map<number, number>()
    for (const c of monsters) if (c.def !== null) counts.set(c.def, (counts.get(c.def) ?? 0) + 1)
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([v]) => v)
    if (!valid.length) return null
    const def = pickRandom(valid)
    return { template, label: `Monsters with ${def} DEF`, def }
  }

  if (template === 'race-attribute') {
    type Combo = { race: string; attribute: string; count: number }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (!c.race || !c.attribute) continue
      const key = `${c.race}|${c.attribute}`
      const cur = map.get(key) ?? { race: c.race, attribute: c.attribute, count: 0 }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.attribute} ${pick.race}s`, race: pick.race, attribute: pick.attribute }
  }

  if (template === 'race-type') {
    type Combo = { race: string; cardType: string; count: number }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (!c.race || !c.type) continue
      const cardType = normalizeType(c.type)
      const key = `${c.race}|${cardType}`
      const cur = map.get(key) ?? { race: c.race, cardType, count: 0 }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.race} ${pick.cardType}s`, race: pick.race, cardType: pick.cardType }
  }

  if (template === 'attribute-type') {
    type Combo = { attribute: string; cardType: string; count: number }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (!c.attribute || !c.type) continue
      const cardType = normalizeType(c.type)
      const key = `${c.attribute}|${cardType}`
      const cur = map.get(key) ?? { attribute: c.attribute, cardType, count: 0 }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.attribute} ${pick.cardType}s`, attribute: pick.attribute, cardType: pick.cardType }
  }

  if (template === 'archetype-type') {
    type Combo = { archetype: string; cardType: string; count: number }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (!c.archetype || !c.type) continue
      const cardType = normalizeType(c.type)
      const key = `${c.archetype}|${cardType}`
      const cur = map.get(key) ?? { archetype: c.archetype, cardType, count: 0 }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.archetype} ${pick.cardType}s`, archetype: pick.archetype, cardType: pick.cardType }
  }

  if (template === 'archetype') {
    const counts = new Map<string, number>()
    for (const c of monsters) {
      if (!c.archetype) continue
      counts.set(c.archetype, (counts.get(c.archetype) ?? 0) + 1)
    }
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([a]) => a)
    if (!valid.length) return null
    const archetype = pickRandom(valid)
    return { template, label: `${archetype} cards`, archetype }
  }

  if (template === 'level-race') {
    type Combo = { level: number; race: string; count: number; isLink: boolean }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (c.level === null || !c.race) continue
      const isLink = c.frameType === 'link'
      const key = `${c.level}|${c.race}|${isLink}`
      const cur = map.get(key) ?? { level: c.level, race: c.race, count: 0, isLink }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    const prefix = pick.isLink ? 'Link Rating' : 'Level'
    return { template, label: `${prefix} ${pick.level} ${pick.race}s`, level: pick.level, race: pick.race, isLink: pick.isLink }
  }

  if (template === 'level-attribute') {
    type Combo = { level: number; attribute: string; count: number; isLink: boolean }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (c.level === null || !c.attribute) continue
      const isLink = c.frameType === 'link'
      const key = `${c.level}|${c.attribute}|${isLink}`
      const cur = map.get(key) ?? { level: c.level, attribute: c.attribute, count: 0, isLink }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    const prefix = pick.isLink ? 'Link Rating' : 'Level'
    return { template, label: `${prefix} ${pick.level} ${pick.attribute} monsters`, level: pick.level, attribute: pick.attribute, isLink: pick.isLink }
  }

  if (template === 'level-type') {
    type Combo = { level: number; cardType: string; count: number }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (c.level === null || !c.type) continue
      const cardType = normalizeType(c.type)
      const key = `${c.level}|${cardType}`
      const cur = map.get(key) ?? { level: c.level, cardType, count: 0 }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    const levelLabel = pick.cardType.toLowerCase().includes('link') ? 'Link Rating' : 'Level'
    return { template, label: `${levelLabel} ${pick.level} ${pick.cardType}s`, level: pick.level, cardType: pick.cardType }
  }

  if (template === 'card-set') {
    const setCounts = new Map<string, Set<number>>()
    for (const c of monsters) {
      for (const s of c.cardSets) {
        if (!setCounts.has(s.setName)) setCounts.set(s.setName, new Set())
        setCounts.get(s.setName)!.add(c.id)
      }
    }
    const valid = [...setCounts.entries()].filter(([, ids]) => ids.size >= MIN_CARDS).map(([name]) => name)
    if (!valid.length) return null
    const setName = pickRandom(valid)
    return { template, label: `Cards from ${setName}`, setName }
  }

  if (template === 'ban-type') {
    type Combo = { banStatus: string; cardType: string; count: number }
    const map = new Map<string, Combo>()
    for (const c of monsters) {
      if (!c.banTcg || !c.type) continue
      const cardType = normalizeType(c.type)
      const key = `${c.banTcg}|${cardType}`
      const cur = map.get(key) ?? { banStatus: c.banTcg, cardType, count: 0 }
      map.set(key, { ...cur, count: cur.count + 1 })
    }
    const valid = [...map.values()].filter(v => v.count >= MIN_CARDS)
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.banStatus} ${pick.cardType}s`, banStatus: pick.banStatus, cardType: pick.cardType }
  }

  if (template === 'top100week-attribute') {
    const top100 = [...monsters].sort((a, b) => b.viewsWeek - a.viewsWeek).slice(0, 100)
    const top100Ids = top100.map(c => c.id)
    const counts = new Map<string, number>()
    for (const c of top100) { if (c.attribute) counts.set(c.attribute, (counts.get(c.attribute) ?? 0) + 1) }
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([a]) => a)
    if (!valid.length) return null
    const attribute = pickRandom(valid)
    return { template, label: `Top 100 This Week: ${attribute}`, attribute, top100Ids }
  }

  if (template === 'top100week-type') {
    const top100 = [...monsters].sort((a, b) => b.viewsWeek - a.viewsWeek).slice(0, 100)
    const top100Ids = top100.map(c => c.id)
    const counts = new Map<string, number>()
    for (const c of top100) { if (c.type) { const t = normalizeType(c.type); counts.set(t, (counts.get(t) ?? 0) + 1) } }
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([t]) => t)
    if (!valid.length) return null
    const cardType = pickRandom(valid)
    return { template, label: `Top 100 This Week: ${cardType}s`, cardType, top100Ids }
  }

  if (template === 'top100week-race') {
    const top100 = [...monsters].sort((a, b) => b.viewsWeek - a.viewsWeek).slice(0, 100)
    const top100Ids = top100.map(c => c.id)
    const counts = new Map<string, number>()
    for (const c of top100) { if (c.race) counts.set(c.race, (counts.get(c.race) ?? 0) + 1) }
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([r]) => r)
    if (!valid.length) return null
    const race = pickRandom(valid)
    return { template, label: `Top 100 This Week: ${race}s`, race, top100Ids }
  }

  if (template === 'top100week-level') {
    const top100 = [...monsters].sort((a, b) => b.viewsWeek - a.viewsWeek).slice(0, 100)
    const top100Ids = top100.map(c => c.id)
    const counts = new Map<string, number>()
    for (const c of top100) { if (c.level !== null) counts.set(`${c.level}`, (counts.get(`${c.level}`) ?? 0) + 1) }
    const valid = [...counts.entries()].filter(([, n]) => n >= MIN_CARDS).map(([l]) => parseInt(l))
    if (!valid.length) return null
    const level = pickRandom(valid)
    return { template, label: `Top 100 This Week: Level ${level}`, level, top100Ids }
  }

  if (template === 'release-attribute') {
    const map = new Map<string, number>()
    for (const c of monsters) {
      if (!c.tcgDate || !c.attribute) continue
      const key = `${c.tcgDate.slice(0, 4)}|${c.attribute}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    const valid = [...map.entries()].filter(([, n]) => n >= MIN_CARDS).map(([k]) => {
      const [year, attribute] = k.split('|')
      return { year: parseInt(year), attribute }
    })
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.year} ${pick.attribute} cards`, releaseYear: pick.year, attribute: pick.attribute }
  }

  if (template === 'release-type') {
    const map = new Map<string, number>()
    for (const c of monsters) {
      if (!c.tcgDate || !c.type) continue
      const key = `${c.tcgDate.slice(0, 4)}|${normalizeType(c.type)}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    const valid = [...map.entries()].filter(([, n]) => n >= MIN_CARDS).map(([k]) => {
      const [year, cardType] = k.split('|')
      return { year: parseInt(year), cardType }
    })
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.year} ${pick.cardType}s`, releaseYear: pick.year, cardType: pick.cardType }
  }

  if (template === 'release-race') {
    const map = new Map<string, number>()
    for (const c of monsters) {
      if (!c.tcgDate || !c.race) continue
      const key = `${c.tcgDate.slice(0, 4)}|${c.race}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    const valid = [...map.entries()].filter(([, n]) => n >= MIN_CARDS).map(([k]) => {
      const [year, race] = k.split('|')
      return { year: parseInt(year), race }
    })
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.year} ${pick.race}s`, releaseYear: pick.year, race: pick.race }
  }

  if (template === 'release-level') {
    const map = new Map<string, number>()
    for (const c of monsters) {
      if (!c.tcgDate || c.level === null) continue
      const key = `${c.tcgDate.slice(0, 4)}|${c.level}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    const valid = [...map.entries()].filter(([, n]) => n >= MIN_CARDS).map(([k]) => {
      const [year, levelStr] = k.split('|')
      return { year: parseInt(year), level: parseInt(levelStr) }
    })
    if (!valid.length) return null
    const pick = pickRandom(valid)
    return { template, label: `${pick.year} Level ${pick.level} cards`, releaseYear: pick.year, level: pick.level }
  }

  return null
}

export function generateCategories(cards: Card[]): Category[] {
  // Pick 3 templates with weights; duplicates allowed, ATK/DEF are rare
  const result: Category[] = []
  for (let i = 0; i < 3; i++) {
    let cat: Category | null = null
    let tries = 0
    while (!cat && tries < 30) { cat = tryGenerate(cards, weightedRandomTemplate()); tries++ }
    if (cat) result.push(cat)
  }
  // Fallback: pad with race-attribute if generation failed
  while (result.length < 3) {
    const cat = tryGenerate(cards, 'race-attribute')
    if (cat) result.push(cat); else break
  }
  return result
}
