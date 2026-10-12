import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isPrereleasePlaceholder, playableCards } from '../src/utils/cardIds.ts'

test('only the 100,000,000-199,999,999 block is a pre-release placeholder', () => {
  for (const id of [100_000_000, 101304014, 199_999_999])
    assert.equal(isPrereleasePlaceholder(id), true, `${id}`)
  // Real passcodes, Speed Duel skill cards and World Championship prize cards stay.
  for (const id of [56651978, 99_999_999, 300302022, 501000006])
    assert.equal(isPrereleasePlaceholder(id), false, `${id}`)
})

test('the stale pre-release Regina is dropped and the released one kept', () => {
  const cards = [
    { id: 56651978, name: 'Elfnote Regina' },
    { id: 101304014, name: 'Elvennotes Regina' },
  ]
  assert.deepEqual(playableCards(cards), [{ id: 56651978, name: 'Elfnote Regina' }])
})

test('a repeated id keeps its first row only', () => {
  const cards = [
    { id: 1, name: 'first' },
    { id: 2, name: 'other' },
    { id: 1, name: 'second' },
  ]
  assert.deepEqual(
    playableCards(cards).map((c) => c.name),
    ['first', 'other'],
  )
})

// The published file as the game sees it. YgoDomainBuilder rewrites it on every manual sync, so this
// is where a new upstream duplicate would show up.
test('public/cards.txt has no pre-release ids, repeated ids or repeated names once loaded', () => {
  const rows = readFileSync(new URL('../public/cards.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [id, name] = l.split('|')
      return { id: parseInt(id), name }
    })
  const cards = playableCards(rows)

  assert.ok(cards.length > 10_000, `only ${cards.length} cards`)
  assert.equal(cards.filter((c) => isPrereleasePlaceholder(c.id)).length, 0)
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, 'repeated id')
  const names = cards.map((c) => c.name)
  const repeated = names.filter((n, i) => names.indexOf(n) !== i)
  assert.deepEqual(repeated, [], 'repeated name')
  assert.deepEqual(
    cards.filter((c) => c.name.endsWith('Regina') && c.name.includes('note')),
    [{ id: 56651978, name: 'Elfnote Regina' }],
  )
})
