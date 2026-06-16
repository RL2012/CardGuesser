import type { Card } from '../types/types'

export function getRandomCard(cards: Card[], exclude?: Card): Card {
  const pool = exclude ? cards.filter((c) => c.id !== exclude.id) : cards
  return pool[Math.floor(Math.random() * pool.length)]
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function randomCrop(): { cropX: number; cropY: number } {
  return { cropX: Math.random(), cropY: Math.random() }
}

export function preloadImages(ids: number[]): void {
  for (const id of ids) {
    const img = new Image()
    img.src = `/images/${id}.jpg`
  }
}
