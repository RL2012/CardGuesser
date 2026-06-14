import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from './hooks'
import { fetchCards } from './store/cardsSlice'
import { startRound, correctGuess, replaceCard, skipCard, tickSecond, addWrongGuess } from './store/gameSlice'
import { getRandomCard, randomCrop } from './utils'
import CardDisplay from './components/CardDisplay'
import CardSearch from './components/CardSearch'
import PreviousRounds from './components/PreviousRounds'
import type { Card } from './types'
import './App.css'

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const dispatch = useAppDispatch()
  const { status, cards } = useAppSelector((s) => s.cards)
  const { currentCard, isActive, cardTimeLeft, previousRounds, wrongGuesses } = useAppSelector(
    (s) => s.game,
  )

  // Pre-selected next card. Validates the image actually loads before storing,
  // retrying on error so the ref always points to a card with a working image.
  const nextCardRef = useRef<Card | null>(null)

  useEffect(() => {
    if (cards.length === 0) return
    let cancelled = false
    let attempts = 0

    const tryLoad = (exclude: Card | null) => {
      if (cancelled || attempts >= 10) return
      attempts++
      const card = getRandomCard(cards, exclude ?? undefined)
      const img = new Image()
      img.onload = () => { if (!cancelled) nextCardRef.current = card }
      img.onerror = () => tryLoad(exclude)
      img.src = `https://images.ygoprodeck.com/images/cards_cropped/${card.id}.jpg`
    }

    tryLoad(currentCard)
    return () => { cancelled = true }
  }, [currentCard, cards])

  const takeNextCard = (exclude: Card | null): Card => {
    const pre = nextCardRef.current
    nextCardRef.current = null
    if (pre && pre.id !== exclude?.id) return pre
    return getRandomCard(cards, exclude ?? undefined)
  }

  useEffect(() => {
    if (status === 'idle') dispatch(fetchCards())
  }, [dispatch, status])

  useEffect(() => {
    if (status === 'succeeded' && cards.length > 0 && !currentCard) {
      dispatch(startRound({ card: takeNextCard(null), ...randomCrop() }))
    }
  }, [status, cards, currentCard, dispatch])

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => dispatch(tickSecond()), 1000)
    return () => clearInterval(id)
  }, [isActive, dispatch])

  useEffect(() => {
    if (cardTimeLeft === 0 && isActive && cards.length > 0) {
      dispatch(skipCard({ nextCard: takeNextCard(currentCard), ...randomCrop() }))
    }
  }, [cardTimeLeft, isActive, cards, currentCard, dispatch])

  const handleGuess = (name: string) => {
    if (!currentCard || !isActive) return
    if (name.toLowerCase() === currentCard.name.toLowerCase()) {
      dispatch(correctGuess({ nextCard: takeNextCard(currentCard), ...randomCrop() }))
    } else {
      dispatch(addWrongGuess(name))
    }
  }

  const handleSkip = () => {
    if (!cards.length) return
    dispatch(skipCard({ nextCard: takeNextCard(currentCard), ...randomCrop() }))
  }

  const handleReplace = () => {
    if (!cards.length) return
    dispatch(replaceCard({ card: takeNextCard(currentCard), ...randomCrop() }))
  }

  return (
    <div className="app">
      <header className="app-header">
        <button className="theme-toggle" onClick={() => setIsDark((d) => !d)}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <h1>Card Guesser</h1>
      </header>

      {status === 'loading' && <p className="status-message">Loading cards…</p>}
      {status === 'failed' && (
        <p className="status-message status-message--error">Failed to load cards.</p>
      )}

      {status === 'succeeded' && (
        <main className="app-main">
          <CardDisplay onSkip={handleSkip} onReplace={handleReplace} />
          <div className="game-panel">
            <CardSearch
              cardNames={cards.map((c) => c.name)}
              onGuess={handleGuess}
              disabled={!isActive}
            />
            {wrongGuesses.length > 0 && (
              <ul className="wrong-guesses">
                {wrongGuesses.map((name) => (
                  <li key={name} className="wrong-guess-item">
                    {name}
                  </li>
                ))}
              </ul>
            )}
            <PreviousRounds rounds={previousRounds} />
          </div>
        </main>
      )}
    </div>
  )
}
