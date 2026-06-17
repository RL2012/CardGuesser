import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/hooks'
import { startGame, pickCard, nextRound, resetGame, type HolMode } from '../../store/higherOrLowerSlice'
import { getRandomCard } from '../../utils/utils'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'
import type { Card, CardSet } from '../../types/types'

function getRandomValidSet(card: Card): CardSet | null {
  const valid = card.cardSets.filter((s) => parseFloat(s.setPrice) > 0)
  if (valid.length === 0) return null
  return valid[Math.floor(Math.random() * valid.length)]
}

function getRandomPricePair(
  pool: Card[],
): { leftCard: Card; leftCardSet: CardSet; rightCard: Card; rightCardSet: CardSet } {
  const a = getRandomCard(pool)
  const b = getRandomCard(pool, a)
  return {
    leftCard: a,
    leftCardSet: getRandomValidSet(a)!,
    rightCard: b,
    rightCardSet: getRandomValidSet(b)!,
  }
}

function getRandomAtkPair(pool: Card[]): { leftCard: Card; rightCard: Card } {
  return { leftCard: getRandomCard(pool), rightCard: getRandomCard(pool) }
}

function formatSetPrice(setPrice: string): string {
  const n = parseFloat(setPrice)
  return isNaN(n) ? '—' : `$${n.toFixed(2)}`
}

export default function HigherOrLower() {
  const dispatch = useAppDispatch()
  const { cards } = useAppSelector((s) => s.cards)
  const {
    leftCard, rightCard, leftCardSet, rightCardSet,
    lives, score, streak, phase, lastWinner, playerChoice,
    lastPointsEarned, totalRounds, correctAnswers, mode,
  } = useAppSelector((s) => s.higherOrLower)

  const [scoreEntrySeen, setScoreEntrySeen] = useState(false)
  const [modeSelected, setModeSelected] = useState(false)

  const monsterCards = useMemo(() => cards.filter((c) => c.atk !== null), [cards])
  const priceCards = useMemo(
    () => cards.filter((c) => c.cardSets.some((s) => parseFloat(s.setPrice) > 0)),
    [cards],
  )

  const handleSelectMode = (selectedMode: HolMode) => {
    if (selectedMode === 'price') {
      const { leftCard: a, leftCardSet: sa, rightCard: b, rightCardSet: sb } = getRandomPricePair(priceCards)
      dispatch(startGame({ leftCard: a, rightCard: b, leftCardSet: sa, rightCardSet: sb, mode: selectedMode }))
    } else {
      const { leftCard: a, rightCard: b } = getRandomAtkPair(monsterCards)
      dispatch(startGame({ leftCard: a, rightCard: b, leftCardSet: null, rightCardSet: null, mode: selectedMode }))
    }
    setModeSelected(true)
  }

  const handlePick = (guess: 'left' | 'right') => {
    dispatch(pickCard(guess))
  }

  const handleNext = () => {
    if (mode === 'price') {
      const { leftCard: a, leftCardSet: sa, rightCard: b, rightCardSet: sb } = getRandomPricePair(priceCards)
      dispatch(nextRound({ leftCard: a, rightCard: b, leftCardSet: sa, rightCardSet: sb }))
    } else {
      const { leftCard: a, rightCard: b } = getRandomAtkPair(monsterCards)
      dispatch(nextRound({ leftCard: a, rightCard: b, leftCardSet: null, rightCardSet: null }))
    }
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
            <span className="hol-mode-btn__desc">Which printing costs more on TCGPlayer?</span>
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
    const winnerCard = lastWinner === 'right' ? rightCard : leftCard
    const winnerSet = lastWinner === 'right' ? rightCardSet : leftCardSet

    return (
      <div className="hol-gameover">
        <h2>Game Over</h2>

        {lastWinner && (
          <>
            <p className="hol-gameover__last-label">
              {lastWinner === 'tie'
                ? 'It was a tie!'
                : mode === 'price'
                  ? `${winnerCard.name} (${winnerSet?.setName}) had the higher price`
                  : `${winnerCard.name} had higher ATK`}
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
                  {mode === 'price' && leftCardSet && (
                    <p className="hol-card-set">{leftCardSet.setName} · {leftCardSet.setRarity}</p>
                  )}
                  <p className="hol-card-atk">
                    {mode === 'price' && leftCardSet
                      ? formatSetPrice(leftCardSet.setPrice)
                      : `${leftCard.atk} ATK`}
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
                  {mode === 'price' && rightCardSet && (
                    <p className="hol-card-set">{rightCardSet.setName} · {rightCardSet.setRarity}</p>
                  )}
                  <p className="hol-card-atk">
                    {mode === 'price' && rightCardSet
                      ? formatSetPrice(rightCardSet.setPrice)
                      : `${rightCard.atk} ATK`}
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

  return (
    <main className="hol-main">
      <div className="hol-score-bar">
        <span>Score: <strong>{score}</strong></span>
        <span>Streak: <strong>{streak}</strong></span>
        <span className="hol-lives">{'♥'.repeat(lives)}{'♡'.repeat(3 - lives)}</span>
      </div>

      <div className="hol-arena">
        {/* Left card */}
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
                {mode === 'price' && leftCardSet && (
                  <p className="hol-card-set">{leftCardSet.setName} · {leftCardSet.setRarity}</p>
                )}
                <p className="hol-card-atk">
                  {mode === 'price' && leftCardSet
                    ? formatSetPrice(leftCardSet.setPrice)
                    : `${leftCard.atk} ATK`}
                </p>
              </>
            ) : (
              <>
                {mode === 'price' && leftCardSet && (
                  <>
                    <p className="hol-card-set">{leftCardSet.setName}</p>
                    <p className="hol-card-set hol-card-set--rarity">{leftCardSet.setRarity}</p>
                  </>
                )}
                <p className="hol-card-hint">◀ Higher Price</p>
              </>
            )}
          </div>
        </button>

        <div className="hol-vs">VS</div>

        {/* Right card */}
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
                {mode === 'price' && rightCardSet && (
                  <p className="hol-card-set">{rightCardSet.setName} · {rightCardSet.setRarity}</p>
                )}
                <p className="hol-card-atk">
                  {mode === 'price' && rightCardSet
                    ? formatSetPrice(rightCardSet.setPrice)
                    : `${rightCard.atk} ATK`}
                </p>
              </>
            ) : (
              <>
                {mode === 'price' && rightCardSet && (
                  <>
                    <p className="hol-card-set">{rightCardSet.setName}</p>
                    <p className="hol-card-set hol-card-set--rarity">{rightCardSet.setRarity}</p>
                  </>
                )}
                <p className="hol-card-hint">Higher Price ▶</p>
              </>
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
