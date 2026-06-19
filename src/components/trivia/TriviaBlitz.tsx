import { useState, useCallback, useEffect, useRef } from 'react'
import { useAppSelector } from '../../hooks/hooks'
import {
  generateQuestion,
  SECONDS_PER_QUESTION,
  MAX_LIVES,
  STREAK_BONUS,
  STREAK_BONUS_PTS,
  BASE_PTS,
  TIME_BONUS_MAX,
} from './triviaUtils'
import type { Question } from './triviaUtils'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'

export default function TriviaBlitz() {
  const cards = useAppSelector((s) => s.cards.cards)

  const [phase, setPhase] = useState<'pregame' | 'playing' | 'gameover'>('pregame')
  const [question, setQuestion] = useState<Question | null>(null)
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION)
  const [lives, setLives] = useState(MAX_LIVES)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [chosenIndex, setChosenIndex] = useState<number | null>(null)
  const [showScoreEntry, setShowScoreEntry] = useState(false)
  const [round, setRound] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const endGame = useCallback(() => {
    clearTimer()
    setPhase('gameover')
    setShowScoreEntry(true)
  }, [clearTimer])

  const nextQuestion = useCallback(() => {
    const q = generateQuestion(cards)
    setQuestion(q)
    setAnswered(false)
    setChosenIndex(null)
    setTimeLeft(SECONDS_PER_QUESTION)
    clearTimer()
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
  }, [cards, clearTimer])

  const startGame = useCallback(() => {
    setScore(0)
    setLives(MAX_LIVES)
    setStreak(0)
    setRound(0)
    setPhase('playing')
    const q = generateQuestion(cards)
    setQuestion(q)
    setAnswered(false)
    setChosenIndex(null)
    setTimeLeft(SECONDS_PER_QUESTION)
    clearTimer()
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1))
    }, 1000)
  }, [cards, clearTimer])

  const handleAnswer = useCallback(
    (index: number) => {
      if (answered || !question) return
      clearTimer()
      setAnswered(true)
      setChosenIndex(index)

      if (index === question.correctIndex) {
        const elapsed = SECONDS_PER_QUESTION - timeLeft
        const timeBonus = Math.max(
          0,
          Math.floor(TIME_BONUS_MAX * (1 - elapsed / SECONDS_PER_QUESTION)),
        )
        const newStreak = streak + 1
        const streakBonus = newStreak % STREAK_BONUS === 0 ? STREAK_BONUS_PTS : 0
        const earned = BASE_PTS + timeBonus + streakBonus
        setScore((s) => s + earned)
        setStreak(newStreak)
        setRound((r) => r + 1)

        setTimeout(() => {
          nextQuestion()
        }, 1000)
      } else {
        setLives((l) => {
          const newLives = l - 1
          setStreak(0)

          setTimeout(() => {
            if (newLives <= 0) {
              endGame()
            } else {
              nextQuestion()
            }
          }, 1200)
          return newLives
        })
      }
    },
    [answered, question, timeLeft, streak, clearTimer, nextQuestion, endGame],
  )

  const handleScoreSubmit = useCallback(
    (name: string) => {
      addScore('trivia', name, score)
      setShowScoreEntry(false)
    },
    [score],
  )

  useEffect(() => {
    return () => clearTimer()
  }, [clearTimer])

  useEffect(() => {
    if (timeLeft <= 0 && !answered && question) {
      const id = setTimeout(() => {
        setAnswered(true)
        setChosenIndex(-1)
        setStreak(0)
        setLives((l) => {
          const newLives = l - 1
          setTimeout(() => {
            if (newLives <= 0) {
              endGame()
            } else {
              nextQuestion()
            }
          }, 1200)
          return newLives
        })
      }, 0)
      return () => clearTimeout(id)
    }
  }, [timeLeft, answered, question, endGame, nextQuestion])

  // ── Pregame ────────────────────────────────────────────────────────────
  if (phase === 'pregame') {
    return (
      <div className="tr-pregame">
        <h2 className="tr-pregame__title">Trivia Blitz</h2>
        <p className="tr-pregame__desc">
          Rapid-fire Yu-Gi-Oh! trivia questions. Answer correctly to build a streak — every{' '}
          {STREAK_BONUS} correct in a row earns a {STREAK_BONUS_PTS} pt bonus. Fast answers score
          extra!
        </p>
        <ul className="tr-pregame__rules">
          <li>{SECONDS_PER_QUESTION} seconds per question</li>
          <li>{MAX_LIVES} lives — lose one on wrong answer or timeout</li>
          <li>
            Questions cover attributes, archetypes, races, types, banlists, and ATK comparisons
          </li>
        </ul>
        <button className="hol-btn" onClick={startGame}>
          Start
        </button>
      </div>
    )
  }

  // ── Game over ───────────────────────────────────────────────────────────
  if (phase === 'gameover') {
    return (
      <div className="tr-gameover">
        <h2 className="tr-gameover__title">Game Over</h2>
        <p className="tr-gameover__rounds">
          {round} question{round !== 1 ? 's' : ''} answered correctly
        </p>
        <p className="tr-gameover__score">{score} pts</p>
        {showScoreEntry ? (
          <ScoreEntry
            score={score}
            onSubmit={handleScoreSubmit}
            onSkip={() => setShowScoreEntry(false)}
          />
        ) : (
          <button className="hol-btn" onClick={startGame}>
            Play Again
          </button>
        )}
      </div>
    )
  }

  // ── Playing ─────────────────────────────────────────────────────────────
  const timerPct = (timeLeft / SECONDS_PER_QUESTION) * 100

  return (
    <div className="tr-game">
      <div className="tr-timer-bar">
        <div
          className={`tr-timer-bar__fill${timeLeft <= 5 ? ' tr-timer-bar__fill--urgent' : ''}`}
          style={{ width: `${timerPct}%` }}
        />
      </div>

      <div className="tr-score-bar">
        <span className="tr-score-bar__score">Score: {score}</span>
        <span className="tr-score-bar__streak">
          {streak > 0 ? `Streak: ${streak}` : ''}
        </span>
        <span className="tr-lives">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <span
              key={i}
              className={i < lives ? 'tr-heart tr-heart--full' : 'tr-heart tr-heart--empty'}
            >
              ♥
            </span>
          ))}
        </span>
      </div>

      <div className="tr-round-counter">Question {round + 1}</div>

      {question && (
        <div className="tr-question-card">
          {question.cardImageId && (
            <img
              className="tr-question-card__img"
              src={`https://images.ygoprodeck.com/images/cards_cropped/${question.cardImageId}.jpg`}
              alt=""
            />
          )}
          <p className="tr-question-card__prompt">{question.prompt}</p>
        </div>
      )}

      <div className="tr-options">
        {question?.options.map((opt, i) => {
          let btnClass = 'tr-option-btn'
          if (answered) {
            if (i === question.correctIndex) {
              btnClass += ' tr-option-btn--correct'
            } else if (i === chosenIndex) {
              btnClass += ' tr-option-btn--wrong'
            } else {
              btnClass += ' tr-option-btn--dimmed'
            }
          }
          return (
            <button
              key={i}
              className={btnClass}
              onClick={() => handleAnswer(i)}
              disabled={answered}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {answered && chosenIndex === -1 && (
        <p className="tr-feedback tr-feedback--wrong">Time's up!</p>
      )}
      {answered && chosenIndex != null && chosenIndex >= 0 && (
        <p
          className={`tr-feedback ${chosenIndex === question?.correctIndex ? 'tr-feedback--correct' : 'tr-feedback--wrong'}`}
        >
          {chosenIndex === question?.correctIndex ? 'Correct!' : 'Wrong!'}
        </p>
      )}
    </div>
  )
}
