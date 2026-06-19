import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from './hooks/hooks'
import { fetchCards } from './store/cardsSlice'
import CardGuesser from './components/card-guesser/CardGuesser'
import HigherOrLower from './components/higher-or-lower/HigherOrLower'
import CardCategories from './components/card-categories/CardCategories'
import Codenames from './components/codenames/Codenames'
import Connections from './components/connections/Connections'
import Chameleon from './components/chameleon/Chameleon'
import CardWordle from './components/wordle/CardWordle'
import TriviaBlitz from './components/trivia/TriviaBlitz'
import Homepage from './components/Homepage'
import './App.css'

type GameMode =
  | 'home'
  | 'card-guesser'
  | 'higher-or-lower'
  | 'card-categories'
  | 'codenames'
  | 'connections'
  | 'chameleon'
  | 'wordle'
  | 'trivia'

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [activeGame, setActiveGame] = useState<GameMode>('home')

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
            className={`game-tab${activeGame === 'home' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('home')}
          >
            Home
          </button>
          <span className="game-tabs__sep" />
          <span className="game-tabs__label">Solo</span>
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
            className={`game-tab${activeGame === 'connections' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('connections')}
          >
            Connections
          </button>
          <button
            className={`game-tab${activeGame === 'wordle' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('wordle')}
          >
            Card Wordle
          </button>
          <button
            className={`game-tab${activeGame === 'trivia' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('trivia')}
          >
            Trivia Blitz
          </button>
          <span className="game-tabs__sep" />
          <span className="game-tabs__label">Multiplayer</span>
          <button
            className={`game-tab${activeGame === 'card-categories' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('card-categories')}
          >
            Card Categories
          </button>
          <button
            className={`game-tab${activeGame === 'codenames' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('codenames')}
          >
            Codenames
          </button>
          <button
            className={`game-tab${activeGame === 'chameleon' ? ' game-tab--active' : ''}`}
            onClick={() => setActiveGame('chameleon')}
          >
            Chameleon
          </button>
        </nav>
      </header>

      {activeGame === 'home' && (
        <Homepage onPlay={(game) => setActiveGame(game as GameMode)} />
      )}

      {activeGame !== 'home' && status === 'loading' && <p className="status-message">Loading cards…</p>}
      {activeGame !== 'home' && status === 'failed' && (
        <p className="status-message status-message--error">Failed to load cards.</p>
      )}

      {status === 'succeeded' && (
        <>
          {activeGame === 'card-guesser' && <CardGuesser />}
          {activeGame === 'higher-or-lower' && <HigherOrLower />}
          {activeGame === 'card-categories' && <CardCategories />}
          {activeGame === 'codenames' && <Codenames />}
          {activeGame === 'connections' && <Connections />}
          {activeGame === 'chameleon' && <Chameleon />}
          {activeGame === 'wordle' && <CardWordle />}
          {activeGame === 'trivia' && <TriviaBlitz />}
        </>
      )}
    </div>
  )
}
