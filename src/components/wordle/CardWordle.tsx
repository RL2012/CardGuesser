import { useState, useCallback, useMemo } from 'react'
import { useAppSelector } from '../../hooks/hooks'
import { pickSecretCard, getPropertyHints, MAX_ATTEMPTS, isGuessCorrect } from './wordleUtils'
import type { PropertyHint } from './wordleUtils'
import type { Card } from '../../types/types'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'

const MATCH_COLORS: Record<string, { bg: string; text: string }> = {
  exact: { bg: '#22c55e', text: '#fff' },
  partial: { bg: '#eab308', text: '#1a1a00' },
  none: { bg: '#3f3f46', text: '#d4d4d8' },
}

function HintBadge({ hint }: { hint: PropertyHint }) {
  const style = MATCH_COLORS[hint.match]
  const arrow =
    hint.direction === 'up' ? ' ↑' : hint.direction === 'down' ? ' ↓' : ''
  return (
    <span
      className="wl-hint-badge"
      style={{ background: style.bg, color: style.text }}
    >
      <span className="wl-hint-badge__label">{hint.label}</span>
      {hint.value}
      {arrow}
    </span>
  )
}

function EmptyRow() {
  return (
    <div className="wl-row wl-row--empty">
      <div className="wl-row__card" />
      <div className="wl-row__hints">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="wl-hint-badge wl-hint-badge--empty" />
        ))}
      </div>
    </div>
  )
}

function GuessRow({ card, hints }: { card: Card; hints: PropertyHint[] }) {
  return (
    <div className="wl-row">
      <div className="wl-row__card">
        <img
          className="wl-row__img"
          src={`https://images.ygoprodeck.com/images/cards_cropped/${card.id}.jpg`}
          alt={card.name}
          loading="lazy"
        />
        <span className="wl-row__name">{card.name}</span>
      </div>
      <div className="wl-row__hints">
        {hints.map((hint) => (
          <HintBadge key={hint.label} hint={hint} />
        ))}
      </div>
    </div>
  )
}

export default function CardWordle() {
  const cards = useAppSelector((s) => s.cards.cards)
  const cardNames = useMemo(() => cards.map((c) => c.name), [cards])

  const [secret, setSecret] = useState<Card>(() => pickSecretCard(cards))
  const [guesses, setGuesses] = useState<Card[]>([])
  const [won, setWon] = useState(false)
  const [showScoreEntry, setShowScoreEntry] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [filteredNames, setFilteredNames] = useState<string[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [shakeRow, setShakeRow] = useState(false)

  const lost = !won && guesses.length >= MAX_ATTEMPTS
  const gameOver = won || lost

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (value.length >= 2) {
      const lower = value.toLowerCase()
      setFilteredNames(
        cardNames
          .filter((n) => !guesses.some((g) => g.name === n) && n.toLowerCase().includes(lower))
          .slice(0, 8),
      )
      setDropdownOpen(true)
    } else {
      setFilteredNames([])
      setDropdownOpen(false)
    }
  }

  const submitGuess = (name: string) => {
    const card = cards.find((c) => c.name === name)
    if (!card || guesses.some((g) => g.id === card.id) || gameOver) return

    const correct = isGuessCorrect(secret, card)
    const newGuesses = [...guesses, card]
    setGuesses(newGuesses)
    setInputValue('')
    setFilteredNames([])
    setDropdownOpen(false)

    if (correct) {
      setWon(true)
      setShowScoreEntry(true)
    } else if (newGuesses.length >= MAX_ATTEMPTS) {
      setShakeRow(true)
      setTimeout(() => setShakeRow(false), 500)
      setTimeout(() => setShowScoreEntry(true), 600)
    } else {
      setShakeRow(true)
      setTimeout(() => setShakeRow(false), 400)
    }
  }

  const handleScoreSubmit = (name: string) => {
    const score = won ? (MAX_ATTEMPTS - guesses.length + 1) * 100 : 0
    addScore('wordle', name, score)
    setShowScoreEntry(false)
  }

  const restart = useCallback(() => {
    setSecret(pickSecretCard(cards))
    setGuesses([])
    setWon(false)
    setShowScoreEntry(false)
    setInputValue('')
    setFilteredNames([])
    setDropdownOpen(false)
  }, [cards])

  const emptyRows = MAX_ATTEMPTS - guesses.length
  const score = won ? (MAX_ATTEMPTS - guesses.length + 1) * 100 : 0

  return (
    <div className="wl-game">
      <div className="wl-header">
        <h2 className="wl-header__title">Card Wordle</h2>
        <p className="wl-header__subtitle">
          Guess the secret Yu-Gi-Oh! card. Properties of each guess are color-coded against the
          target.
        </p>
      </div>

      <div className="wl-column-headers">
        <div className="wl-col-header wl-col-header--card">Card</div>
        {getPropertyHints(secret, secret).map((h) => (
          <div key={h.label} className="wl-col-header">
            {h.label}
          </div>
        ))}
      </div>

      <div className={`wl-rows${shakeRow ? ' wl-rows--shake' : ''}`}>
        {guesses.map((g) => (
          <GuessRow key={g.id} card={g} hints={getPropertyHints(secret, g)} />
        ))}
        {Array.from({ length: Math.max(0, emptyRows) }).map((_, i) => (
          <EmptyRow key={`empty-${i}`} />
        ))}
      </div>

      {!gameOver && (
        <div className="wl-input-area">
          <div className="card-search">
            <input
              className="card-search-input"
              placeholder="Type a card name…"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredNames.length > 0) {
                  submitGuess(filteredNames[0])
                }
              }}
              onFocus={() => {
                if (filteredNames.length > 0) setDropdownOpen(true)
              }}
              onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
              autoComplete="off"
            />
            {dropdownOpen && filteredNames.length > 0 && (
              <ul className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0 }}>
                {filteredNames.map((name) => (
                  <li
                    key={name}
                    className="search-dropdown-item"
                    onMouseDown={() => submitGuess(name)}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="wl-input-area__hint">
            {guesses.length} / {MAX_ATTEMPTS} attempts
          </p>
        </div>
      )}

      {gameOver && (
        <div className="wl-gameover">
          <h2 className="wl-gameover__title">{won ? 'You got it!' : 'Out of attempts!'}</h2>
          <div className="wl-gameover__reveal">
            <img
              className="wl-gameover__img"
              src={`https://images.ygoprodeck.com/images/cards_cropped/${secret.id}.jpg`}
              alt={secret.name}
            />
            <span className="wl-gameover__name">{secret.name}</span>
          </div>
          <p className="wl-gameover__score">
            {won
              ? `Solved in ${guesses.length} / ${MAX_ATTEMPTS} — ${score} pts`
              : `The secret card was: ${secret.name}`}
          </p>
          {showScoreEntry ? (
            <ScoreEntry score={score} onSubmit={handleScoreSubmit} onSkip={() => setShowScoreEntry(false)} />
          ) : (
            <button className="hol-btn" onClick={restart}>
              Play Again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
