import { useState, useCallback } from 'react'
import { useAppSelector } from '../../hooks/hooks'
import { generateBoard } from './connectionsUtils'
import type { ConnectionsBoard, ConnectionsCategory } from './connectionsUtils'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'

const MAX_MISTAKES = 4

const CATEGORY_STYLES: Record<string, { bg: string; text: string }> = {
  yellow: { bg: '#F9DF6D', text: '#3b2000' },
  green:  { bg: '#6AAA64', text: '#fff' },
  blue:   { bg: '#85C0F9', text: '#0a1540' },
  purple: { bg: '#C9B1FF', text: '#1a004a' },
}

function SolvedRow({ category }: { category: ConnectionsCategory }) {
  const style = CATEGORY_STYLES[category.color]
  return (
    <div className="cxn-solved-row" style={{ background: style.bg, color: style.text }}>
      <span className="cxn-solved-row__label">{category.label}</span>
      <span className="cxn-solved-row__cards">{category.cards.join(' · ')}</span>
    </div>
  )
}

export default function Connections() {
  const cards = useAppSelector(s => s.cards.cards)

  const [phase, setPhase] = useState<'pregame' | 'playing' | 'gameover'>('pregame')
  const [board, setBoard] = useState<ConnectionsBoard | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [solved, setSolved] = useState<ConnectionsCategory[]>([])
  const [remaining, setRemaining] = useState<string[]>([])
  const [shaking, setShaking] = useState(false)
  const [oneAway, setOneAway] = useState(false)
  const [won, setWon] = useState(false)
  const [showScoreEntry, setShowScoreEntry] = useState(false)
  const [finalScore, setFinalScore] = useState(0)

  const startGame = useCallback(() => {
    const newBoard = generateBoard(cards)
    setBoard(newBoard)
    setRemaining(newBoard.shuffledCards)
    setSelected([])
    setMistakes(0)
    setSolved([])
    setShaking(false)
    setOneAway(false)
    setWon(false)
    setShowScoreEntry(false)
    setPhase('playing')
  }, [cards])

  const toggleCard = (name: string) => {
    if (shaking) return
    setOneAway(false)
    setSelected(sel =>
      sel.includes(name) ? sel.filter(s => s !== name)
        : sel.length < 4   ? [...sel, name]
        : sel
    )
  }

  const shuffleRemaining = () => {
    setRemaining(prev => {
      const a = [...prev]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    })
  }

  const finishGame = (allSolved: ConnectionsCategory[], mistakeCount: number, didWin: boolean) => {
    setSolved(allSolved)
    setRemaining([])
    setSelected([])
    setOneAway(false)
    setWon(didWin)
    const score = didWin ? Math.max(0, (MAX_MISTAKES - mistakeCount) * 100) : 0
    setFinalScore(score)
    setPhase('gameover')
    setShowScoreEntry(true)
  }

  const submitGuess = () => {
    if (selected.length !== 4 || shaking || !board) return

    const unsolved = board.categories.filter(cat => !solved.some(s => s.label === cat.label))
    let wasOneAway = false

    for (const cat of unsolved) {
      const matchCount = selected.filter(n => cat.cards.includes(n)).length
      if (matchCount === 4) {
        const newSolved = [...solved, cat]

        if (newSolved.length >= 3) {
          // Solve this category and auto-solve the last one if applicable
          const remaining4th = newSolved.length === 3
            ? unsolved.find(c => c.label !== cat.label) ?? null
            : null
          const allSolved = remaining4th ? [...newSolved, remaining4th] : newSolved
          finishGame(allSolved, mistakes, true)
        } else {
          setSolved(newSolved)
          setRemaining(prev => prev.filter(n => !cat.cards.includes(n)))
          setSelected([])
          setOneAway(false)
        }
        return
      }
      if (matchCount === 3) wasOneAway = true
    }

    // Wrong guess
    setOneAway(wasOneAway)
    const newMistakes = mistakes + 1
    setMistakes(newMistakes)
    setShaking(true)

    setTimeout(() => {
      setShaking(false)
      setSelected([])
      if (newMistakes >= MAX_MISTAKES) {
        finishGame([...solved, ...unsolved], newMistakes, false)
      }
    }, 600)
  }

  const handleScoreSubmit = (name: string) => {
    addScore('connections', name, finalScore)
    setShowScoreEntry(false)
  }

  // ── Pre-game ─────────────────────────────────────────────────────────
  if (phase === 'pregame') {
    return (
      <div className="cxn-pregame">
        <h2 className="cxn-pregame__title">Connections</h2>
        <p className="cxn-pregame__desc">
          Find four groups of four Yu-Gi-Oh! cards that share something in common.
        </p>
        <ul className="cxn-pregame__rules">
          <li>Select four cards, then press <strong>Submit</strong></li>
          <li>You have <strong>4 mistakes</strong> before the game ends</li>
          <li>Categories are sorted by difficulty — yellow is easiest, purple is hardest</li>
        </ul>
        <button className="hol-btn" onClick={startGame}>Play</button>
      </div>
    )
  }

  // ── Game over ─────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <div className="cxn-gameover">
        <h2 className="cxn-gameover__title">{won ? 'Solved!' : 'Game Over'}</h2>
        <p className="cxn-gameover__subtitle">
          {won
            ? `Completed with ${mistakes} mistake${mistakes !== 1 ? 's' : ''}!`
            : 'Here\'s what the groups were:'}
        </p>

        <div className="cxn-gameover__categories">
          {(board?.categories ?? []).map(cat => (
            <div
              key={cat.label}
              className="cxn-gameover__cat"
              style={{ background: CATEGORY_STYLES[cat.color].bg, color: CATEGORY_STYLES[cat.color].text }}
            >
              <div className="cxn-gameover__cat-label">{cat.label}</div>
              <div className="cxn-gameover__cat-cards">{cat.cards.join(', ')}</div>
            </div>
          ))}
        </div>

        {showScoreEntry ? (
          <ScoreEntry
            score={finalScore}
            onSubmit={handleScoreSubmit}
            onSkip={() => setShowScoreEntry(false)}
          />
        ) : (
          <button className="hol-btn" onClick={startGame}>Play Again</button>
        )}
      </div>
    )
  }

  // ── Playing ───────────────────────────────────────────────────────────
  return (
    <div className="cxn-game">
      <div className="cxn-solved-list">
        {solved.map(cat => <SolvedRow key={cat.label} category={cat} />)}
      </div>

      <div className={`cxn-grid${shaking ? ' cxn-grid--shake' : ''}`}>
        {remaining.map(name => (
          <button
            key={name}
            className={`cxn-tile${selected.includes(name) ? ' cxn-tile--selected' : ''}`}
            onClick={() => toggleCard(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="cxn-status">
        {oneAway && <span className="cxn-status__one-away">One away!</span>}
      </div>

      <div className="cxn-footer">
        <div className="cxn-mistakes">
          <span className="cxn-mistakes__label">Mistakes remaining:</span>
          <div className="cxn-dots">
            {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
              <span key={i} className={`cxn-dot${i < mistakes ? ' cxn-dot--used' : ''}`} />
            ))}
          </div>
        </div>

        <div className="cxn-controls">
          <button className="cxn-ctrl-btn" onClick={shuffleRemaining}>Shuffle</button>
          <button
            className="cxn-ctrl-btn"
            onClick={() => setSelected([])}
            disabled={selected.length === 0}
          >
            Deselect All
          </button>
          <button
            className="hol-btn"
            onClick={submitGuess}
            disabled={selected.length !== 4 || shaking}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
