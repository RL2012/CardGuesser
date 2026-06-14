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

writeFileSync(CARDS_TXT, data.map((c) => `${c.id}|${c.name}`).join('\n'), 'utf-8')
console.log('Saved public/cards.txt')
