import { useEffect, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/hooks'
import { startRound, correctGuess, replaceCard, skipCard, tickSecond, addWrongGuess } from '../../store/gameSlice'
import { getRandomCard, randomCrop } from '../../utils/utils'
import CardDisplay from './CardDisplay'
import CardSearch from './CardSearch'
import PreviousRounds from './PreviousRounds'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'
import type { Card } from '../../types/types'

export default function CardGuesser() {
  const dispatch = useAppDispatch()
  const { cards } = useAppSelector((s) => s.cards)
  const { currentCard, isActive, cardTimeLeft, challengeTimeLeft, previousRounds, wrongGuesses, totalPoints } = useAppSelector(
    (s) => s.game,
  )
  const [scoreEntrySeen, setScoreEntrySeen] = useState(false)

  const isGameOver = !isActive && challengeTimeLeft === 0

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
    if (cards.length > 0 && !currentCard) {
      dispatch(startRound({ card: takeNextCard(null), ...randomCrop() }))
    }
  }, [cards, currentCard])

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => dispatch(tickSecond()), 1000)
    return () => clearInterval(id)
  }, [isActive, dispatch])

  useEffect(() => {
    if (cardTimeLeft === 0 && isActive && cards.length > 0) {
      dispatch(skipCard({ nextCard: takeNextCard(currentCard), ...randomCrop() }))
    }
  }, [cardTimeLeft, isActive])

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

  const handleScoreSubmit = (name: string) => {
    addScore('cardGuesser', name, totalPoints)
    setScoreEntrySeen(true)
  }

  return (
    <>
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
      {isGameOver && !scoreEntrySeen && (
        <ScoreEntry
          score={totalPoints}
          onSubmit={handleScoreSubmit}
          onSkip={() => setScoreEntrySeen(true)}
        />
      )}
    </>
  )
}
