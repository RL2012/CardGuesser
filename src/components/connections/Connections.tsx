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

function CategoryReveal({ categories }: { categories: ConnectionsCategory[] }) {
  return (
    <div className="cxn-gameover__categories">
      {categories.map(cat => (
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
  )
}

function MistakeDots({ used }: { used: number }) {
  return (
    <div className="cxn-mistakes">
      <span className="cxn-mistakes__label">Mistakes remaining:</span>
      <div className="cxn-dots">
        {Array.from({ length: MAX_MISTAKES }).map((_, i) => (
          <span key={i} className={`cxn-dot${i < used ? ' cxn-dot--used' : ''}`} />
        ))}
      </div>
    </div>
  )
}

export default function Connections() {
  const cards = useAppSelector(s => s.cards.cards)

  const [phase, setPhase] = useState<'pregame' | 'playing' | 'between-rounds' | 'gameover'>('pregame')
  const [board, setBoard] = useState<ConnectionsBoard | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [roundsWon, setRoundsWon] = useState(0)
  const [solved, setSolved] = useState<ConnectionsCategory[]>([])
  const [remaining, setRemaining] = useState<string[]>([])
  const [shaking, setShaking] = useState(false)
  const [oneAway, setOneAway] = useState(false)
  const [showScoreEntry, setShowScoreEntry] = useState(false)

  const loadBoard = useCallback((newMistakes: number, newRoundsWon: number) => {
    const newBoard = generateBoard(cards)
    setBoard(newBoard)
    setRemaining(newBoard.shuffledCards)
    setSelected([])
    setSolved([])
    setShaking(false)
    setOneAway(false)
    setMistakes(newMistakes)
    setRoundsWon(newRoundsWon)
    setPhase('playing')
  }, [cards])

  const startGame = useCallback(() => {
    setShowScoreEntry(false)
    loadBoard(0, 0)
  }, [loadBoard])

  const startNextRound = useCallback(() => {
    loadBoard(mistakes, roundsWon)
  }, [loadBoard, mistakes, roundsWon])

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

  const finishRound = (allSolved: ConnectionsCategory[], newMistakeCount: number, didWin: boolean) => {
    setSolved(allSolved)
    setRemaining([])
    setSelected([])
    setOneAway(false)
    setMistakes(newMistakeCount)
    if (didWin) {
      setRoundsWon(prev => prev + 1)
      setPhase('between-rounds')
    } else {
      setPhase('gameover')
      setShowScoreEntry(true)
    }
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
          const remaining4th = newSolved.length === 3
            ? unsolved.find(c => c.label !== cat.label) ?? null
            : null
          const allSolved = remaining4th ? [...newSolved, remaining4th] : newSolved
          finishRound(allSolved, mistakes, true)
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
    setShaking(true)

    setTimeout(() => {
      setShaking(false)
      setSelected([])
      if (newMistakes >= MAX_MISTAKES) {
        finishRound([...solved, ...unsolved], newMistakes, false)
      } else {
        setMistakes(newMistakes)
      }
    }, 600)
  }

  const handleScoreSubmit = (name: string) => {
    addScore('connections', name, roundsWon * 100)
    setShowScoreEntry(false)
  }

  // ── Pre-game ───────────────────────────────────────────────────────────
  if (phase === 'pregame') {
    return (
      <div className="cxn-pregame">
        <h2 className="cxn-pregame__title">Connections</h2>
        <p className="cxn-pregame__desc">
          Find four groups of four Yu-Gi-Oh! cards that share something in common.
          Solve as many boards as you can before running out of lives!
        </p>
        <ul className="cxn-pregame__rules">
          <li>Select four cards, then press <strong>Submit</strong></li>
          <li>You have <strong>4 lives</strong> shared across all boards</li>
          <li>Solving a board starts a new one — lives carry over</li>
          <li>Categories are sorted by difficulty — yellow is easiest, purple is hardest</li>
        </ul>
        <button className="hol-btn" onClick={startGame}>Play</button>
      </div>
    )
  }

  // ── Between rounds ─────────────────────────────────────────────────────
  if (phase === 'between-rounds') {
    const livesLeft = MAX_MISTAKES - mistakes
    return (
      <div className="cxn-gameover">
        <h2 className="cxn-gameover__title">Board {roundsWon} Complete!</h2>
        <p className="cxn-gameover__subtitle">
          {livesLeft === MAX_MISTAKES
            ? 'Perfect board — no mistakes!'
            : `${livesLeft} ${livesLeft !== 1 ? 'lives' : 'life'} remaining`}
        </p>
        <CategoryReveal categories={board?.categories ?? []} />
        <MistakeDots used={mistakes} />
        <button className="hol-btn" style={{ marginTop: '1rem' }} onClick={startNextRound}>
          Next Board
        </button>
      </div>
    )
  }

  // ── Game over ──────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    const score = roundsWon * 100
    return (
      <div className="cxn-gameover">
        <h2 className="cxn-gameover__title">Game Over</h2>
        <p className="cxn-gameover__subtitle">
          You solved <strong>{roundsWon}</strong> board{roundsWon !== 1 ? 's' : ''}!
        </p>
        <CategoryReveal categories={board?.categories ?? []} />
        {showScoreEntry ? (
          <ScoreEntry
            score={score}
            onSubmit={handleScoreSubmit}
            onSkip={() => setShowScoreEntry(false)}
          />
        ) : (
          <button className="hol-btn" onClick={startGame}>Play Again</button>
        )}
      </div>
    )
  }

  // ── Playing ────────────────────────────────────────────────────────────
  return (
    <div className="cxn-game">
      <div className="cxn-solved-list">
        {solved.map(cat => (
          <div key={cat.label} className="cxn-solved-row"
            style={{ background: CATEGORY_STYLES[cat.color].bg, color: CATEGORY_STYLES[cat.color].text }}>
            <span className="cxn-solved-row__label">{cat.label}</span>
            <span className="cxn-solved-row__cards">{cat.cards.join(' · ')}</span>
          </div>
        ))}
      </div>

      <div className="cxn-board-label">Board {roundsWon + 1}</div>

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
        <MistakeDots used={mistakes} />
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
