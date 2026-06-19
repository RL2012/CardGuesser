export interface LeaderboardEntry {
  name: string
  score: number
  date: string
}

const KEYS = {
  cardGuesser: 'lb_card_guesser',
  higherOrLower: 'lb_higher_or_lower',
  higherOrLowerPrice: 'lb_higher_or_lower_price',
  higherOrLowerDate: 'lb_higher_or_lower_date',
  cardCategories: 'lb_card_categories',
  connections: 'lb_connections',
  chameleon: 'lb_chameleon',
  wordle: 'lb_wordle',
  trivia: 'lb_trivia',
} as const

export type GameKey = keyof typeof KEYS

export function getLeaderboard(game: GameKey): LeaderboardEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS[game]) ?? '[]')
  } catch {
    return []
  }
}

export function addScore(game: GameKey, name: string, score: number): LeaderboardEntry[] {
  const entries = getLeaderboard(game)
  entries.push({ name, score, date: new Date().toLocaleDateString() })
  entries.sort((a, b) => b.score - a.score)
  const top5 = entries.slice(0, 5)
  localStorage.setItem(KEYS[game], JSON.stringify(top5))
  return top5
}
