import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from './hooks'
import { fetchCards } from './store/cardsSlice'
import CardGuesser from './components/card-guesser/CardGuesser'
import HigherOrLower from './components/higher-or-lower/HigherOrLower'
import PvpLobby from './components/pvp-lobby/PvpLobby'
import './App.css'

type GameMode = 'card-guesser' | 'higher-or-lower' | 'pvp'

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [activeGame, setActiveGame] = useState<GameMode>('card-guesser')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const dispatch = useAppDispatch()
  const { status } = useAppSelector((s) => s.cards)

  useEffect(() => {
    if (status === 'idle') dispatch(fetchCards())
  }, [dispatch, status])

  return (
    <div className="app">
      <header className="app-header">
        <button className="theme-toggle" onClick={() => setIsDark((d) => !d)}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <h1>Card Guesser</h1>
        <nav className="game-tabs">
          <button
            className={`game-tab${activeGame === 'card-guesser' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('card-guesser')}
          >
            Card Guesser
          </button>
          <button
            className={`game-tab${activeGame === 'higher-or-lower' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('higher-or-lower')}
          >
            Higher or Lower
          </button>
          <button
            className={`game-tab${activeGame === 'pvp' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('pvp')}
          >
            PvP
          </button>
        </nav>
      </header>

      {status === 'loading' && <p className="status-message">Loading cards…</p>}
      {status === 'failed' && (
        <p className="status-message status-message--error">Failed to load cards.</p>
      )}

      {status === 'succeeded' && (
        <>
          {activeGame === 'card-guesser' && <CardGuesser />}
          {activeGame === 'higher-or-lower' && <HigherOrLower />}
          {activeGame === 'pvp' && <PvpLobby />}
        </>
      )}
    </div>
  )
}
