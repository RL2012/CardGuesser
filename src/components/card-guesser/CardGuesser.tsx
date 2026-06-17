import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/hooks'
import { startRound, correctGuess, replaceCard, skipCard, tickSecond, addWrongGuess, resetGame } from '../../store/gameSlice'
import { getRandomCard, randomCrop } from '../../utils/utils'
import CardDisplay from './CardDisplay'
import CardSearch from './CardSearch'
import PreviousRounds from './PreviousRounds'
import ScoreEntry from '../ScoreEntry'
import { addScore, getLeaderboard } from '../../services/leaderboard'
import type { Card } from '../../types/types'

export default function CardGuesser() {
  const dispatch = useAppDispatch()
  const { cards } = useAppSelector((s) => s.cards)
  const { currentCard, isActive, cardTimeLeft, challengeTimeLeft, previousRounds, wrongGuesses, totalPoints } =
    useAppSelector((s) => s.game)

  const [started, setStarted] = useState(false)
  const [scoreEntrySeen, setScoreEntrySeen] = useState(false)

  const isGameOver = !isActive && challengeTimeLeft === 0

  // Reset game state every time this component mounts (navigating to the tab)
  useEffect(() => {
    dispatch(resetGame())
  }, [dispatch])

  const nextCardRef = useRef<Card | null>(null)

  // Preload the next card image in the background
  useEffect(() => {
    if (cards.length === 0) return
    let cancelled = false
    let attempts = 0

    const tryLoad = (exclude: Card | null) => {
      if (cancelled || attempts >= 10) return
      attempts++
      const card = getRandomCard(cards, exclude ?? undefined)
      const img = new Image()
      img.onload = () => {
        if (!cancelled) nextCardRef.current = card
      }
      img.onerror = () => tryLoad(exclude)
      img.src = `https://images.ygoprodeck.com/images/cards_cropped/${card.id}.jpg`
    }

    tryLoad(currentCard)
    return () => {
      cancelled = true
    }
  }, [currentCard, cards])

  const takeNextCard = (exclude: Card | null): Card => {
    const pre = nextCardRef.current
    nextCardRef.current = null
    if (pre && pre.id !== exclude?.id) return pre
    return getRandomCard(cards, exclude ?? undefined)
  }

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => dispatch(tickSecond()), 1000)
    return () => clearInterval(id)
  }, [isActive, dispatch])

  useEffect(() => {
    if (cardTimeLeft === 0 && isActive && cards.length > 0) {
      dispatch(skipCard({ nextCard: takeNextCard(currentCard), ...randomCrop() }))
    }
  }, [cardTimeLeft, isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStart = () => {
    dispatch(resetGame())
    dispatch(startRound({ card: takeNextCard(null), ...randomCrop() }))
    setScoreEntrySeen(false)
    setStarted(true)
  }

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

  // Pre-game / post-game landing screen
  if (!started) {
    const leaderboard = getLeaderboard('cardGuesser')
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Card Guesser</h2>
        <p className="pvp-lobby__hint">
          Identify a Yu-Gi-Oh! card from a zoomed-in crop. Zoom out for hints — fewer zooms means more points.
          <br />
          30 seconds per card &nbsp;·&nbsp; 5 minute challenge
        </p>
        <button className="hol-btn" onClick={handleStart}>
          Start Game
        </button>
        {leaderboard.length > 0 && (
          <div style={{ marginTop: '1.5rem', width: '100%', maxWidth: 340 }}>
            <p className="pvp-lobby__label">Top Scores</p>
            {leaderboard.map((e, i) => (
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}
              >
                <span>
                  {i + 1}.&nbsp;{e.name}
                </span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{e.score} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Score entry full-screen after game over
  if (isGameOver && !scoreEntrySeen) {
    return (
      <ScoreEntry
        score={totalPoints}
        onSubmit={(n) => {
          addScore('cardGuesser', n, totalPoints)
          setScoreEntrySeen(true)
          setStarted(false)
        }}
        onSkip={() => {
          setScoreEntrySeen(true)
          setStarted(false)
        }}
      />
    )
  }

  return (
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
  )
}
