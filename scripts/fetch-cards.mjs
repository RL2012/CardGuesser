import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARDS_TXT = join(__dirname, '..', 'public', 'cards.txt')

console.log('Fetching card data from YGOPRODeck…')
const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes')
if (!res.ok) {
  console.error(`API error: ${res.status} ${res.statusText}`)
  process.exit(1)
}
const { data } = await res.json()
console.log(`Got ${data.length} cards.`)

// Format: id|name|frameType|type|attribute|atk|def|level|race|archetype|sets(JSON)|banTcg|views|viewsWeek|tcgDate
const lines = data.map((c) => {
  const misc = c.misc_info?.[0]
  const sets = (c.card_sets ?? []).map((s) => ({
    setName: s.set_name,
    setCode: s.set_code,
    setRarity: s.set_rarity,
    setPrice: s.set_price,
  }))
  return [
    c.id,
    c.name,
    c.frameType ?? '',
    c.type ?? '',
    c.attribute ?? '',
    c.atk ?? '',
    c.def ?? '',
    c.frameType === 'link' ? (c.linkval ?? '') : (c.level ?? ''),
    c.race ?? '',
    c.archetype ?? '',
    JSON.stringify(sets),
    c.banlist_info?.ban_tcg ?? '',
    misc?.views ?? 0,
    misc?.viewsweek ?? 0,
    misc?.tcg_date ?? '',
  ].join('|')
})

writeFileSync(CARDS_TXT, lines.join('\n'), 'utf-8')
console.log('Saved public/cards.txt')

// ── Data-fix staleness check ──────────────────────────────────────────────────
// When the API starts returning the correct value, these hardcodes in
// src/utils/dataFixes.ts can be removed.
const DATA_FIX_CHECKS = [
  { id: 34022970, name: 'Ext Ryzeal', field: 'banlist_info.ban_tcg', correctValue: 'Limited',
    actual: (c) => c.banlist_info?.ban_tcg ?? null },
]
for (const check of DATA_FIX_CHECKS) {
  const card = data.find((c) => c.id === check.id)
  if (!card) continue
  const actual = check.actual(card)
  if (actual === check.correctValue) {
    console.warn(
      `\n⚠  Data fix for "${check.name}" (ID ${check.id}) is now unnecessary.\n` +
      `   API returned the correct value "${actual}" for ${check.field}.\n` +
      `   Remove the entry from CARD_DATA_FIXES in src/utils/dataFixes.ts.\n`,
    )
  }
}
