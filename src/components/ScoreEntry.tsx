import { useState } from 'react'

interface Props {
  score: number
  onSubmit: (name: string) => void
  onSkip: () => void
}

export default function ScoreEntry({ score, onSubmit, onSkip }: Props) {
  const [name, setName] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="score-entry-overlay">
      <div className="score-entry">
        <h2 className="score-entry__title">Game Over</h2>
        <p className="score-entry__score">{score} pts</p>
        <p className="score-entry__label">Enter your name for the leaderboard</p>
        <form className="score-entry__form" onSubmit={handleSubmit}>
          <input
            className="score-entry__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name…"
            maxLength={24}
            autoFocus
          />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>
            Save Score
          </button>
        </form>
        <button className="score-entry__skip" onClick={onSkip}>
          Skip
        </button>
      </div>
    </div>
  )
}
