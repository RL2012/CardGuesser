import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateQuestion } from '../src/components/trivia/triviaUtils.ts'

test('a highest ATK question names the cards without their ATK and has one right answer', () => {
  // Two cards tie at 3000 so a tied top can come up and must be refused.
  const atks = [3000, 3000, 2500, 2400, 1800, 1200, 1000, 800, 500, 0]
  const cards = atks.map((atk, i) => ({
    id: i + 1,
    name: `Monster ${i + 1}`,
    frameType: 'normal',
    attribute: 'LIGHT',
    race: 'Dragon',
    archetype: null,
    banTcg: null,
    atk,
  }))
  const byName = new Map(cards.map((c) => [c.name, c.atk]))

  let seen = 0
  for (let i = 0; i < 2000; i++) {
    const q = generateQuestion(cards as never)
    if (q.type !== 'highestAtk') continue
    seen++
    assert.equal(q.options.length, 4)
    for (const o of q.options) assert.ok(byName.has(o), `option "${o}" is not a bare card name`)
    const values = q.options.map((o) => byName.get(o)!)
    const best = Math.max(...values)
    assert.equal(values.filter((v) => v === best).length, 1, 'tied top answer')
    assert.equal(values[q.correctIndex], best)
  }
  assert.ok(seen > 0)
})
