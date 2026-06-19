import type { Card } from '../../types/types'

export const MAX_ATTEMPTS = 6

export type MatchLevel = 'exact' | 'partial' | 'none'

export interface PropertyHint {
  label: string
  value: string
  match: MatchLevel
  /** For ATK/DEF directional hints: 'up' means secret is higher, 'down' means secret is lower */
  direction?: 'up' | 'down'
}

export function pickSecretCard(cards: Card[]): Card {
  const monsters = cards.filter(
    (c) =>
      c.frameType !== 'spell' &&
      c.frameType !== 'trap' &&
      c.frameType !== 'skill' &&
      c.frameType !== 'token',
  )
  return monsters[Math.floor(Math.random() * monsters.length)]
}

function frameCategory(ft: string): string {
  if (ft.startsWith('fusion')) return 'fusion'
  if (ft.startsWith('synchro')) return 'synchro'
  if (ft.startsWith('xyz')) return 'xyz'
  if (ft.startsWith('link')) return 'link'
  if (ft.startsWith('ritual')) return 'ritual'
  if (ft.startsWith('pendulum')) return 'pendulum'
  if (ft === 'spell') return 'spell'
  if (ft === 'trap') return 'trap'
  if (ft === 'token') return 'token'
  return 'monster'
}

export function getPropertyHints(secret: Card, guess: Card): PropertyHint[] {
  const hints: PropertyHint[] = []

  const match = (a: string | null, b: string | null): MatchLevel =>
    a === b ? 'exact' : 'none'

  const partialType = (a: string, b: string): MatchLevel => {
    if (a === b) return 'exact'
    if (frameCategory(a) === frameCategory(b)) return 'partial'
    return 'none'
  }

  hints.push({
    label: 'Attribute',
    value: guess.attribute || '—',
    match: match(secret.attribute || null, guess.attribute || null),
  })

  hints.push({
    label: 'Type',
    value: guess.frameType,
    match: partialType(secret.frameType, guess.frameType),
  })

  hints.push({
    label: 'Race',
    value: guess.race,
    match: match(secret.race, guess.race),
  })

  hints.push({
    label: 'Archetype',
    value: guess.archetype || 'None',
    match: match(secret.archetype || null, guess.archetype || null),
  })

  const levelMatch = (a: number | null, b: number | null): MatchLevel => {
    if (a === b) return 'exact'
    if (a != null && b != null && Math.abs(a - b) <= 2) return 'partial'
    return 'none'
  }
  hints.push({
    label: 'Level',
    value: guess.level != null ? String(guess.level) : '—',
    match: levelMatch(secret.level, guess.level),
  })

  hints.push({
    label: 'ATK',
    value: guess.atk != null ? String(guess.atk) : '—',
    match:
      secret.atk === guess.atk
        ? 'exact'
        : secret.atk != null && guess.atk != null
          ? Math.abs(secret.atk - guess.atk) <= 500
            ? 'partial'
            : 'none'
          : 'none',
    direction:
      secret.atk != null && guess.atk != null && secret.atk !== guess.atk
        ? secret.atk > guess.atk
          ? 'up'
          : 'down'
        : undefined,
  })

  hints.push({
    label: 'DEF',
    value: guess.def != null ? String(guess.def) : '—',
    match:
      secret.def === guess.def
        ? 'exact'
        : secret.def != null && guess.def != null
          ? Math.abs(secret.def - guess.def) <= 500
            ? 'partial'
            : 'none'
          : 'none',
    direction:
      secret.def != null && guess.def != null && secret.def !== guess.def
        ? secret.def > guess.def
          ? 'up'
          : 'down'
        : undefined,
  })

  hints.push({
    label: 'Banlist',
    value: guess.banTcg || 'Unlimited',
    match: match(secret.banTcg || null, guess.banTcg || null),
  })

  return hints
}

export function getColumnHeaders(secret: Card): string[] {
  return getPropertyHints(secret, secret).map((h) => h.label)
}

export function isGuessCorrect(secret: Card, guess: Card): boolean {
  return secret.id === guess.id
}
