import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks'
import { startGame, pickCard, nextRound, resetGame } from '../../store/higherOrLowerSlice'
import { getRandomCard } from '../../utils'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../leaderboard'
import type { Card } from '../../types'

function getRandomPair(monsterCards: Card[]): [Card, Card] {
  const a = getRandomCard(monsterCards)
  const b = getRandomCard(monsterCards, a)
  return [a, b]
}

export default function HigherOrLower() {
  const dispatch = useAppDispatch()
  const { cards } = useAppSelector((s) => s.cards)
  const { leftCard, rightCard, lives, score, streak, phase, lastWinner, playerChoice, lastPointsEarned, totalRounds, correctAnswers } =
    useAppSelector((s) => s.higherOrLower)
  const [scoreEntrySeen, setScoreEntrySeen] = useState(false)

  const monsterCards = useMemo(() => cards.filter((c) => c.atk !== null), [cards])

  useEffect(() => {
    if (monsterCards.length > 0 && phase === 'idle') {
      const [a, b] = getRandomPair(monsterCards)
      dispatch(startGame({ leftCard: a, rightCard: b }))
    }
  }, [monsterCards, phase, dispatch])

  const handlePick = (guess: 'left' | 'right') => {
    dispatch(pickCard(guess))
  }

  const handleNext = () => {
    const [a, b] = getRandomPair(monsterCards)
    dispatch(nextRound({ leftCard: a, rightCard: b }))
  }

  const handleReset = () => {
    setScoreEntrySeen(false)
    dispatch(resetGame())
  }

  const handleScoreSubmit = (name: string) => {
    addScore('higherOrLower', name, score)
    setScoreEntrySeen(true)
  }

  if (phase === 'idle' || !leftCard || !rightCard) {
    return <div className="hol-loading">Loading cards…</div>
  }

  if (phase === 'gameover') {
    if (!scoreEntrySeen) {
      return (
        <ScoreEntry
          score={score}
          onSubmit={handleScoreSubmit}
          onSkip={() => setScoreEntrySeen(true)}
        />
      )
    }

    const leftWon = lastWinner === 'left' || lastWinner === 'tie'
    const rightWon = lastWinner === 'right' || lastWinner === 'tie'
    return (
      <div className="hol-gameover">
        <h2>Game Over</h2>

        {leftCard && rightCard && lastWinner && (
          <>
            <p className="hol-gameover__last-label">
              {lastWinner === 'tie'
                ? 'It was a tie!'
                : `${lastWinner === 'left' ? leftCard.name : rightCard.name} had higher ATK`}
            </p>
            <div className="hol-arena hol-arena--compact">
              <div className={`hol-card hol-card--static ${leftWon ? 'hol-card--winner' : 'hol-card--loser'}`}>
                <div className="hol-card-image-area">
                  <img
                    src={`https://images.ygoprodeck.com/images/cards_cropped/${leftCard.id}.jpg`}
                    alt={leftCard.name}
                    className="hol-card-img"
                  />
                </div>
                <div className="hol-card-info">
                  <p className="hol-card-name">{leftCard.name}</p>
                  <p className="hol-card-atk">{leftCard.atk} ATK</p>
                </div>
              </div>
              <div className="hol-vs">VS</div>
              <div className={`hol-card hol-card--static ${rightWon ? 'hol-card--winner' : 'hol-card--loser'}`}>
                <div className="hol-card-image-area">
                  <img
                    src={`https://images.ygoprodeck.com/images/cards_cropped/${rightCard.id}.jpg`}
                    alt={rightCard.name}
                    className="hol-card-img"
                  />
                </div>
                <div className="hol-card-info">
                  <p className="hol-card-name">{rightCard.name}</p>
                  <p className="hol-card-atk">{rightCard.atk} ATK</p>
                </div>
              </div>
            </div>
          </>
        )}

        <p className="hol-gameover__score">{score} pts</p>
        <p className="hol-gameover__stat">{correctAnswers} / {totalRounds} correct</p>
        <button className="hol-btn" onClick={handleReset}>Play Again</button>
      </div>
    )
  }

  const isRevealed = phase === 'reveal'
  const isCorrectAnswer = isRevealed && (playerChoice === lastWinner || lastWinner === 'tie')

  return (
    <main className="hol-main">
      <div className="hol-score-bar">
        <span>Score: <strong>{score}</strong></span>
        <span>Streak: <strong>{streak}</strong></span>
        <span className="hol-lives">{'♥'.repeat(lives)}{'♡'.repeat(3 - lives)}</span>
      </div>

      <div className="hol-arena">
        <button
          className={[
            'hol-card',
            isRevealed && (lastWinner === 'left' || lastWinner === 'tie') ? 'hol-card--winner' : '',
            isRevealed && lastWinner === 'right' ? 'hol-card--loser' : '',
            !isRevealed ? 'hol-card--pickable' : '',
          ].filter(Boolean).join(' ')}
          onClick={!isRevealed ? () => handlePick('left') : undefined}
          disabled={isRevealed}
        >
          <div className="hol-card-image-area">
            <img
              src={`https://images.ygoprodeck.com/images/cards_cropped/${leftCard.id}.jpg`}
              alt={isRevealed ? leftCard.name : 'Card'}
              className="hol-card-img"
            />
          </div>
          <div className="hol-card-info">
            {isRevealed ? (
              <>
                <p className="hol-card-name">{leftCard.name}</p>
                <p className="hol-card-atk">{leftCard.atk} ATK</p>
              </>
            ) : (
              <p className="hol-card-hint">◀ Higher ATK</p>
            )}
          </div>
        </button>

        <div className="hol-vs">VS</div>

        <button
          className={[
            'hol-card',
            isRevealed && (lastWinner === 'right' || lastWinner === 'tie') ? 'hol-card--winner' : '',
            isRevealed && lastWinner === 'left' ? 'hol-card--loser' : '',
            !isRevealed ? 'hol-card--pickable' : '',
          ].filter(Boolean).join(' ')}
          onClick={!isRevealed ? () => handlePick('right') : undefined}
          disabled={isRevealed}
        >
          <div className="hol-card-image-area">
            <img
              src={`https://images.ygoprodeck.com/images/cards_cropped/${rightCard.id}.jpg`}
              alt={isRevealed ? rightCard.name : 'Card'}
              className="hol-card-img"
            />
          </div>
          <div className="hol-card-info">
            {isRevealed ? (
              <>
                <p className="hol-card-name">{rightCard.name}</p>
                <p className="hol-card-atk">{rightCard.atk} ATK</p>
              </>
            ) : (
              <p className="hol-card-hint">Higher ATK ▶</p>
            )}
          </div>
        </button>
      </div>

      {isRevealed && (
        <div className="hol-result">
          {isCorrectAnswer ? (
            <p className="hol-result--correct">
              Correct! {lastWinner === 'tie' ? '(Tie!) ' : ''}+{lastPointsEarned} pts
              {streak >= 3 ? ` (${Math.floor(streak / 3) * 50} streak bonus!)` : ''}
            </p>
          ) : (
            <p className="hol-result--wrong">Wrong! {lives} {lives === 1 ? 'life' : 'lives'} remaining</p>
          )}
          <button className="hol-btn" onClick={handleNext}>Next Round</button>
        </div>
      )}
    </main>
  )
}
