// ── Codenames board generation ─────────────────────────────────────────────────
// Builds a pool of Yu-Gi-Oh! themed words and selects 25 for the board.
//
// Pool sources:
//  1. Top-viewed monster names per race (top 20 each)
//  2. Top-viewed monster names per attribute (top 20 each)
//  3. Top-viewed monster names per frame type (top 20 each)
//  4. Race names themselves (Dragon, Warrior, …)
//  5. Attribute names (DARK, LIGHT, …)
//  6. Simplified frame type labels (Effect, Fusion, Synchro, …)
//  7. Popular archetype names (≥ 3 cards in the dataset)

import type { Card } from '../../types/types'
import type { BoardCell, CellTeam, Team } from './codenamesTypes'

// Cards that go first always get 9, second team gets 8
export const RED_COUNT = 9
export const BLUE_COUNT = 8
export const NEUTRAL_COUNT = 7
export const ASSASSIN_COUNT = 1
export const BOARD_SIZE = RED_COUNT + BLUE_COUNT + NEUTRAL_COUNT + ASSASSIN_COUNT // 25

const FRAME_LABELS: Record<string, string> = {
  normal: 'Normal',
  effect: 'Effect',
  ritual: 'Ritual',
  fusion: 'Fusion',
  synchro: 'Synchro',
  xyz: 'XYZ',
  link: 'Link',
  pendulum_normal: 'Pendulum',
  pendulum_effect: 'Pendulum',
  pendulum_effect_fusion: 'Pendulum',
  pendulum_ritual: 'Pendulum',
  pendulum_xyz: 'Pendulum',
  pendulum_synchro: 'Pendulum',
  token: 'Token',
}

export function buildWordPool(cards: Card[]): string[] {
  const pool = new Set<string>()
  const monsters = cards.filter((c) => c.atk !== null)

  // 1. Top monsters by race
  const races = [...new Set(monsters.map((c) => c.race))]
  for (const race of races) {
    monsters
      .filter((c) => c.race === race)
      .sort((a, b) => b.views - a.views)
      .slice(0, 20)
      .forEach((c) => pool.add(c.name))
  }

  // 2. Top monsters by attribute
  const attrs = ['DARK', 'LIGHT', 'FIRE', 'WATER', 'EARTH', 'WIND', 'DIVINE']
  for (const attr of attrs) {
    monsters
      .filter((c) => c.attribute === attr)
      .sort((a, b) => b.views - a.views)
      .slice(0, 20)
      .forEach((c) => pool.add(c.name))
  }

  // 3. Top monsters by frame type
  const frameTypes = [...new Set(monsters.map((c) => c.frameType))]
  for (const ft of frameTypes) {
    monsters
      .filter((c) => c.frameType === ft)
      .sort((a, b) => b.views - a.views)
      .slice(0, 20)
      .forEach((c) => pool.add(c.name))
  }

  // 4. Race names
  races.forEach((r) => pool.add(r))

  // 5. Attribute names
  attrs.forEach((a) => pool.add(a))

  // 6. Frame type labels (deduplicated via Set)
  Object.values(FRAME_LABELS).forEach((l) => pool.add(l))

  // 7. Popular archetypes (≥ 3 monster cards)
  const archCount = new Map<string, number>()
  monsters
    .filter((c) => c.archetype)
    .forEach((c) => archCount.set(c.archetype!, (archCount.get(c.archetype!) ?? 0) + 1))
  ;[...archCount.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .forEach(([name]) => pool.add(name))

  return [...pool]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function generateBoard(cards: Card[], firstTeam: Team = 'red'): BoardCell[] {
  const pool = buildWordPool(cards)
  if (pool.length < BOARD_SIZE) throw new Error('Not enough words for a board')

  const words = shuffle(pool).slice(0, BOARD_SIZE)

  const secondTeam: Team = firstTeam === 'red' ? 'blue' : 'red'
  const assignments: CellTeam[] = shuffle([
    ...Array<CellTeam>(RED_COUNT).fill(firstTeam),
    ...Array<CellTeam>(BLUE_COUNT).fill(secondTeam),
    ...Array<CellTeam>(NEUTRAL_COUNT).fill('neutral'),
    ...Array<CellTeam>(ASSASSIN_COUNT).fill('assassin'),
  ])

  return words.map((word, i) => ({ word, team: assignments[i], revealed: false }))
}

export function teamRemainingCount(board: BoardCell[], team: Team): number {
  return board.filter((c) => c.team === team && !c.revealed).length
}
