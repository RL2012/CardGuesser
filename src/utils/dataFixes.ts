// Known incorrect values from the YGOProdeck API.
//
// How to use:
//   - Add an entry when the API returns the wrong value for a card.
//   - When `npm run fetch-cards` prints a warning that the API now returns the
//     correct value, remove the entry — the hardcode is no longer needed.
//
// Keys are card IDs (numbers). Only override fields that are wrong.

export interface CardDataFix {
  banTcg?: string | null
}

export const CARD_DATA_FIXES: Record<number, CardDataFix> = {
  // Ext Ryzeal — API returns no ban status; correct value is "Limited"
  34022970: { banTcg: 'Limited' },
}

export function applyDataFix<T extends { id: number; banTcg: string | null }>(card: T): T {
  const fix = CARD_DATA_FIXES[card.id]
  if (!fix) return card
  return {
    ...card,
    ...(fix.banTcg !== undefined ? { banTcg: fix.banTcg } : {}),
  }
}
