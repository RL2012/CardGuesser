import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/hooks'
import { startGame, pickCard, nextRound, resetGame, type HolMode } from '../../store/higherOrLowerSlice'
import { getRandomCard } from '../../utils/utils'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'
import type { Card } from '../../types/types'

function getRandomPair(pool: Card[]): [Card, Card] {
  const a = getRandomCard(pool)
  const b = getRandomCard(pool, a)
  return [a, b]
}

function formatPrice(price: number | null): string {
  if (price === null) return '—'
  return `$${price.toFixed(2)}`
}

export default function HigherOrLower() {
  const dispatch = useAppDispatch()
  const { cards } = useAppSelector((s) => s.cards)
  const { leftCard, rightCard, lives, score, streak, phase, lastWinner, playerChoice, lastPointsEarned, totalRounds, correctAnswers, mode } =
    useAppSelector((s) => s.higherOrLower)

  const [scoreEntrySeen, setScoreEntrySeen] = useState(false)
  const [modeSelected, setModeSelected] = useState(false)

  const monsterCards = useMemo(() => cards.filter((c) => c.atk !== null), [cards])
  const priceCards = useMemo(
    () => cards.filter((c) => c.tcgplayerPrice !== null && c.tcgplayerPrice > 0),
    [cards],
  )

  const handleSelectMode = (selectedMode: HolMode) => {
    const pool = selectedMode === 'price' ? priceCards : monsterCards
    const [a, b] = getRandomPair(pool)
    dispatch(startGame({ leftCard: a, rightCard: b, mode: selectedMode }))
    setModeSelected(true)
  }

  const handlePick = (guess: 'left' | 'right') => {
    dispatch(pickCard(guess))
  }

  const handleNext = () => {
    const pool = mode === 'price' ? priceCards : monsterCards
    const [a, b] = getRandomPair(pool)
    dispatch(nextRound({ leftCard: a, rightCard: b }))
  }

  const handleReset = () => {
    setScoreEntrySeen(false)
    setModeSelected(false)
    dispatch(resetGame())
  }

  // Mode selection screen
  if (!modeSelected) {
    return (
      <div className="hol-mode-select">
        <h2 className="hol-mode-select__title">Higher or Lower</h2>
        <p className="hol-mode-select__subtitle">Choose your game mode</p>
        <div className="hol-mode-select__options">
          <button className="hol-mode-btn" onClick={() => handleSelectMode('atk')}>
            <span className="hol-mode-btn__icon">⚔️</span>
            <span className="hol-mode-btn__label">ATK Battle</span>
            <span className="hol-mode-btn__desc">Which monster has higher ATK?</span>
          </button>
          <button className="hol-mode-btn" onClick={() => handleSelectMode('price')}>
            <span className="hol-mode-btn__icon">💰</span>
            <span className="hol-mode-btn__label">Price Check</span>
            <span className="hol-mode-btn__desc">Which card costs more on TCGPlayer?</span>
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'idle' || !leftCard || !rightCard) {
    return <div className="hol-loading">Loading cards…</div>
  }

  if (phase === 'gameover') {
    const scoreKey = mode === 'price' ? 'higherOrLowerPrice' : 'higherOrLower'

    if (!scoreEntrySeen) {
      return (
        <ScoreEntry
          score={score}
          onSubmit={(name) => { addScore(scoreKey, name, score); setScoreEntrySeen(true) }}
          onSkip={() => setScoreEntrySeen(true)}
        />
      )
    }

    const leftWon = lastWinner === 'left' || lastWinner === 'tie'
    const rightWon = lastWinner === 'right' || lastWinner === 'tie'
    const winnerCard = lastWinner === 'left' ? leftCard : rightCard
    const higherLabel = mode === 'price' ? 'higher price' : 'higher ATK'

    return (
      <div className="hol-gameover">
        <h2>Game Over</h2>

        {leftCard && rightCard && lastWinner && (
          <>
            <p className="hol-gameover__last-label">
              {lastWinner === 'tie'
                ? 'It was a tie!'
                : `${winnerCard.name} had ${higherLabel}`}
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
                  <p className="hol-card-atk">
                    {mode === 'price' ? formatPrice(leftCard.tcgplayerPrice) : `${leftCard.atk} ATK`}
                  </p>
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
                  <p className="hol-card-atk">
                    {mode === 'price' ? formatPrice(rightCard.tcgplayerPrice) : `${rightCard.atk} ATK`}
                  </p>
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
  const hintLabel = mode === 'price' ? 'Higher Price' : 'Higher ATK'

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
                <p className="hol-card-atk">
                  {mode === 'price' ? formatPrice(leftCard.tcgplayerPrice) : `${leftCard.atk} ATK`}
                </p>
              </>
            ) : (
              <p className="hol-card-hint">◀ {hintLabel}</p>
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
                <p className="hol-card-atk">
                  {mode === 'price' ? formatPrice(rightCard.tcgplayerPrice) : `${rightCard.atk} ATK`}
                </p>
              </>
            ) : (
              <p className="hol-card-hint">{hintLabel} ▶</p>
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
