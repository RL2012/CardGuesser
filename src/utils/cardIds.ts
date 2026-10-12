// No imports: tests/cardIds.test.ts loads this file straight into Node.

// YGOProDeck lists announced cards under temporary 9-digit ids (101304014 "Elvennotes Regina") and
// keeps serving that row after the card is released under its real 8-digit passcode, so it turns up
// as a duplicate of the real card (56651978 "Elfnote Regina"). Almost none of these ids have an image.
// YgoDomainBuilder's export (Helpers/CardGuesserExport.cs) leaves out the same range.
export function isPrereleasePlaceholder(id: number): boolean {
  return id >= 100_000_000 && id < 200_000_000
}

// Drops pre-release rows, and any id seen before, so one card can never be dealt twice.
export function playableCards<T extends { id: number }>(cards: T[]): T[] {
  const seen = new Set<number>()
  return cards.filter((c) => {
    if (isPrereleasePlaceholder(c.id) || seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}
