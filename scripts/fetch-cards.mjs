import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CARDS_TXT = join(__dirname, '..', 'public', 'cards.txt')

console.log('Fetching card data from YGOPRODeck…')
const res = await fetch('https://db.ygoprodeck.com/api/v7/cardinfo.php')
if (!res.ok) {
  console.error(`API error: ${res.status} ${res.statusText}`)
  process.exit(1)
}
const { data } = await res.json()
console.log(`Got ${data.length} cards.`)

// Format: id|name|frameType|attribute|atk|def|level|race
// Empty string for fields not applicable to a card type (e.g. Spells have no attribute/atk/def)
const lines = data.map((c) =>
  [
    c.id,
    c.name,
    c.frameType ?? '',
    c.attribute ?? '',
    c.atk ?? '',
    c.def ?? '',
    c.level ?? c.linkval ?? '',
    c.race ?? '',
  ].join('|'),
)

writeFileSync(CARDS_TXT, lines.join('\n'), 'utf-8')
console.log('Saved public/cards.txt')
