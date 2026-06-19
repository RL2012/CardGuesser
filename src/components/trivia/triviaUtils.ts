import type { Card } from '../../types/types'

export type QuestionType =
  | 'attribute'
  | 'archetype'
  | 'race'
  | 'frameType'
  | 'banlist'
  | 'highestAtk'

export interface Question {
  type: QuestionType
  prompt: string
  options: string[]
  correctIndex: number
  cardImageId?: number
}

const QUESTION_TYPES: QuestionType[] = [
  'attribute',
  'archetype',
  'race',
  'frameType',
  'banlist',
  'highestAtk',
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickN<T>(arr: T[], n: number, exclude: T[] = []): T[] {
  const available = arr.filter((x) => !exclude.includes(x))
  const result: T[] = []
  const pool = [...available]
  while (result.length < n && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length)
    result.push(pool[idx])
    pool.splice(idx, 1)
  }
  return result
}

function getDistinctValues<T>(cards: Card[], getter: (c: Card) => T | null | undefined): T[] {
  const seen = new Set<T>()
  for (const c of cards) {
    const v = getter(c)
    if (v != null && v !== '' && !seen.has(v)) {
      seen.add(v)
    }
  }
  return [...seen]
}

function formatFrameType(raw: string): string {
  return raw
    .split('_')
    .map((w) => {
      if (w === 'xyz') return 'XYZ'
      return w.charAt(0).toUpperCase() + w.slice(1)
    })
    .join(' ')
}

export function generateQuestion(cards: Card[]): Question {
  const monsters = cards.filter(
    (c) =>
      c.frameType !== 'spell' &&
      c.frameType !== 'trap' &&
      c.frameType !== 'skill' &&
      c.frameType !== 'token',
  )
  const type = pick(QUESTION_TYPES)

  switch (type) {
    case 'attribute': {
      const card = pick(monsters.filter((c) => c.attribute))
      const allAttrs = getDistinctValues(monsters, (c) => c.attribute)
      const wrongs = pickN(allAttrs.filter((a) => a !== card.attribute), 3)
      const options = shuffle([card.attribute, ...wrongs])
      return {
        type,
        prompt: `What attribute is "${card.name}"?`,
        options,
        correctIndex: options.indexOf(card.attribute),
        cardImageId: card.id,
      }
    }

    case 'archetype': {
      const cardWithArch = monsters.filter((c) => c.archetype)
      if (cardWithArch.length === 0) return generateQuestion(cards)
      const card = pick(cardWithArch)
      const arch = card.archetype!
      const escaped = arch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      let censoredName = card.name.replace(new RegExp(escaped, 'gi'), '***')
      if (censoredName === card.name) {
        censoredName = card.name
          .split(' ')
          .map((w) => (new RegExp(escaped, 'i').test(w) ? '***' : w))
          .join(' ')
      }
      const allArchs = getDistinctValues(monsters, (c) => c.archetype)
      const wrongs = pickN(
        allArchs.filter((a) => a !== card.archetype),
        3,
      )
      if (wrongs.length < 3) return generateQuestion(cards)
      const options = shuffle([arch, ...wrongs])
      return {
        type,
        prompt: `What archetype does "${censoredName}" belong to?`,
        options,
        correctIndex: options.indexOf(arch),
      }
    }

    case 'race': {
      const card = pick(monsters)
      const allRaces = getDistinctValues(monsters, (c) => c.race)
      const wrongs = pickN(allRaces.filter((r) => r !== card.race), 3)
      const options = shuffle([card.race, ...wrongs])
      return {
        type,
        prompt: `What is the race of "${card.name}"?`,
        options,
        correctIndex: options.indexOf(card.race),
        cardImageId: card.id,
      }
    }

    case 'frameType': {
      const card = pick(monsters)
      const allFrames = getDistinctValues(monsters, (c) => c.frameType)
      const formatted = allFrames.map(formatFrameType)
      const correctFormatted = formatFrameType(card.frameType)
      const wrongs = pickN(formatted.filter((f) => f !== correctFormatted), 3)
      const options = shuffle([correctFormatted, ...wrongs])
      return {
        type,
        prompt: `What type of monster is "${card.name}"?`,
        options,
        correctIndex: options.indexOf(correctFormatted),
        cardImageId: card.id,
      }
    }

    case 'banlist': {
      const nonNullBans = monsters.filter((c) => c.banTcg != null)
      const card = pick(nonNullBans.length > 0 ? nonNullBans : monsters)
      const statuses = ['Unlimited', 'Forbidden', 'Limited', 'Semi-Limited']
      const correct = card.banTcg || 'Unlimited'
      const wrongs = pickN(statuses.filter((s) => s !== correct), 3)
      const options = shuffle([correct, ...wrongs])
      return {
        type,
        prompt: `What is the TCG banlist status of "${card.name}"?`,
        options,
        correctIndex: options.indexOf(correct),
        cardImageId: card.id,
      }
    }

    case 'highestAtk': {
      const withAtk = monsters.filter((c) => c.atk != null)
      const pool = shuffle(withAtk).slice(0, 8)
      const sorted = pool.sort((a, b) => (b.atk ?? 0) - (a.atk ?? 0))
      const top = sorted[0]
      const options = shuffle(sorted.slice(0, 4).map((c) => `${c.name} (ATK ${c.atk})`))
      return {
        type,
        prompt: 'Which of these cards has the highest ATK?',
        options,
        correctIndex: options.indexOf(`${top.name} (ATK ${top.atk})`),
      }
    }
  }
}

export const SECONDS_PER_QUESTION = 15
export const MAX_LIVES = 3
export const STREAK_BONUS = 3 // every N correct in a row adds bonus
export const STREAK_BONUS_PTS = 50
export const BASE_PTS = 100
export const TIME_BONUS_MAX = 50 // max extra pts for fast answer
