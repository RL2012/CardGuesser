import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLine } from '../src/utils/cardsParse.ts'

// A real row from public/cards.txt. The 16 columns, in the order CLAUDE.md documents:
// id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate|tcgplayerPrice
const SCORPION =
  '14261867|8-Claws Scorpion|effect|Effect Monster|DARK|300|200|2|Insect||' +
  '[{"setName":"Gold Series","setCode":"GLD1-EN007","setRarity":"Common","setPrice":"0.20","setEdition":"Limited"},' +
  '{"setName":"Pharaonic Guardian","setCode":"PGD-024","setRarity":"Common","setPrice":"0.44","setEdition":"1st Edition"},' +
  '{"setName":"Pharaonic Guardian","setCode":"PGD-024","setRarity":"Common","setPrice":"0.22","setEdition":"Unlimited"}]' +
  '||200304|483|2003-07-18|0.20'

test('a monster row maps each of the 16 columns to its field', () => {
  assert.equal(SCORPION.split('|').length, 16)
  assert.deepEqual(parseLine(SCORPION), {
    id: 14261867,
    name: '8-Claws Scorpion',
    frameType: 'effect',
    type: 'Effect Monster',
    attribute: 'DARK',
    atk: 300,
    def: 200,
    level: 2,
    race: 'Insect',
    archetype: null,
    cardSets: [
      { setName: 'Gold Series', setCode: 'GLD1-EN007', setRarity: 'Common', setPrice: '0.20', setEdition: 'Limited' },
      { setName: 'Pharaonic Guardian', setCode: 'PGD-024', setRarity: 'Common', setPrice: '0.44', setEdition: '1st Edition' },
      { setName: 'Pharaonic Guardian', setCode: 'PGD-024', setRarity: 'Common', setPrice: '0.22', setEdition: 'Unlimited' },
    ],
    banTcg: null,
    views: 200304,
    viewsWeek: 483,
    tcgDate: '2003-07-18',
    tcgplayerPrice: 0.2,
  })
})

test('a link monster has no DEF and its link rating sits in the level column', () => {
  const card = parseLine(
    '4731783|A Bao A Qu, the Lightless Shadow|link|Link Monster|DARK|2800||4|Fiend||' +
      '[{"setName":"Magnificent Monsters","setCode":"MAMO-EN038","setRarity":"Secret Rare","setPrice":"0.39","setEdition":"1st Edition"}]' +
      '||487176|3360|2025-01-23|0.38',
  )
  assert.equal(card.atk, 2800)
  assert.equal(card.def, null)
  assert.equal(card.level, 4)
  assert.equal(card.cardSets[0].setEdition, '1st Edition')
})

test('a spell has empty attribute, ATK, DEF and level, and keeps its archetype', () => {
  const card = parseLine(
    '35261759|Pot of Desires|spell|Spell Card|||||Normal|Greed|' +
      '[{"setName":"2017 Mega-Tins","setCode":"CT14-EN004","setRarity":"Ultra Rare","setPrice":"1.37","setEdition":"Limited"}]' +
      '||4952339|7437|2016-08-04|0.32',
  )
  assert.equal(card.attribute, '')
  assert.equal(card.atk, null)
  assert.equal(card.def, null)
  assert.equal(card.level, null)
  assert.equal(card.race, 'Normal')
  assert.equal(card.archetype, 'Greed')
  assert.equal(card.cardSets[0].setPrice, '1.37')
})

test('a ban status, broken sets JSON and a zero price come through as expected', () => {
  const card = parseLine('1|X|effect|Effect Monster|DARK|0|0|1|Fiend||not json|Forbidden|5|1||0')
  assert.equal(card.atk, 0)
  assert.equal(card.def, 0)
  assert.deepEqual(card.cardSets, [])
  assert.equal(card.banTcg, 'Forbidden')
  assert.equal(card.tcgDate, null)
  assert.equal(card.tcgplayerPrice, null)
})
