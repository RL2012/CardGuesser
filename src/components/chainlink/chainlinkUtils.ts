import type { Card } from '../../types/types'

export function cardsShareProperty(a: Card, b: Card): boolean {
  if (a.attribute && b.attribute && a.attribute === b.attribute) return true
  if (a.race === b.race) return true
  if (a.archetype && b.archetype && a.archetype === b.archetype) return true
  if (a.frameType === b.frameType) return true
  return false
}

export function getSharedProperties(a: Card, b: Card): string[] {
  const shared: string[] = []
  if (a.attribute && b.attribute && a.attribute === b.attribute) shared.push(`Attribute: ${a.attribute}`)
  if (a.race === b.race) shared.push(`Race: ${a.race}`)
  if (a.archetype && b.archetype && a.archetype === b.archetype) shared.push(`Archetype: ${a.archetype}`)
  if (a.frameType === b.frameType) shared.push(`Type: ${a.frameType}`)
  return shared
}

export function pickStartingCard(cards: Card[]): Card {
  const monsters = cards.filter(
    (c) =>
      c.frameType !== 'spell' &&
      c.frameType !== 'trap' &&
      c.frameType !== 'skill' &&
      c.frameType !== 'token',
  )
  return monsters[Math.floor(Math.random() * monsters.length)]
}
