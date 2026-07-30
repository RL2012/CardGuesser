import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
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
import Leaderboards from './components/Leaderboards'
import Homepage from './components/Homepage'
import './App.css'

type GameMode =
  | 'home'
  | 'leaderboards'
  | 'card-guesser'
  | 'higher-or-lower'
  | 'card-categories'
  | 'codenames'
  | 'connections'
  | 'chameleon'
  | 'wordle'
  | 'trivia'

const MULTIPLAYER_GAMES: GameMode[] = ['card-categories', 'codenames', 'chameleon']

export default function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeGame, setActiveGame] = useState<GameMode>('home')
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const isMultiplayerGame = MULTIPLAYER_GAMES.includes(activeGame)
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const dispatch = useAppDispatch()
  const { status } = useAppSelector((s) => s.cards)

  useEffect(() => {
    if (status === 'idle') dispatch(fetchCards())
  }, [dispatch, status])

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine)
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)
    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
    }
  }, [])

  useEffect(() => {
    const showImageFallback = (event: Event) => {
      const image = event.target
      if (
        !(image instanceof HTMLImageElement) ||
        !image.src.startsWith('https://images.ygoprodeck.com/') ||
        image.dataset.offlineFallback
      ) {
        return
      }

      image.dataset.offlineFallback = 'true'
      image.src = `${import.meta.env.BASE_URL}card-image-unavailable.svg`
      image.alt = 'Card image unavailable'
    }

    document.addEventListener('error', showImageFallback, true)
    return () => document.removeEventListener('error', showImageFallback, true)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <button className="theme-toggle" onClick={() => setIsDark((d) => !d)}>
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        <h1>Card Guesser</h1>
        <button
          className="hamburger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span className={`hamburger__line${menuOpen ? ' hamburger__line--open' : ''}`} />
        </button>
        <nav className={`game-tabs${menuOpen ? ' game-tabs--open' : ''}`}>
          <button
            className={`game-tab${activeGame === 'home' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('home'); setMenuOpen(false) }}
          >
            Home
          </button>
          <button
            className={`game-tab${activeGame === 'leaderboards' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('leaderboards'); setMenuOpen(false) }}
          >
            Leaderboards
          </button>
          <span className="game-tabs__sep" />
          <span className="game-tabs__label">Solo</span>
          <button
            className={`game-tab${activeGame === 'card-guesser' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('card-guesser'); setMenuOpen(false) }}
          >
            Card Guesser
          </button>
          <button
            className={`game-tab${activeGame === 'higher-or-lower' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('higher-or-lower'); setMenuOpen(false) }}
          >
            Higher or Lower
          </button>
          <button
            className={`game-tab${activeGame === 'connections' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('connections'); setMenuOpen(false) }}
          >
            Connections
          </button>
          <button
            className={`game-tab${activeGame === 'wordle' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('wordle'); setMenuOpen(false) }}
          >
            Card Wordle
          </button>
          <button
            className={`game-tab${activeGame === 'trivia' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('trivia'); setMenuOpen(false) }}
          >
            Trivia Blitz
          </button>
          <span className="game-tabs__sep" />
          <span className="game-tabs__label">
            Multiplayer{!isOnline && ' (offline)'}
          </span>
          <button
            className={`game-tab${activeGame === 'card-categories' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('card-categories'); setMenuOpen(false) }}
            disabled={!isOnline}
          >
            Card Categories
          </button>
          <button
            className={`game-tab${activeGame === 'codenames' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('codenames'); setMenuOpen(false) }}
            disabled={!isOnline}
          >
            Codenames
          </button>
          <button
            className={`game-tab${activeGame === 'chameleon' ? ' game-tab--active' : ''}`}
            onClick={() => { setActiveGame('chameleon'); setMenuOpen(false) }}
            disabled={!isOnline}
          >
            Chameleon
          </button>
        </nav>
        {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}
      </header>

      {!isOnline && (
        <div className="offline-banner" role="status">
          Offline: cached solo games remain available. Card images may be unavailable and multiplayer
          is disabled.
        </div>
      )}

      {activeGame === 'home' && (
        <Homepage onPlay={(game) => setActiveGame(game as GameMode)} />
      )}

      {activeGame === 'leaderboards' && status === 'succeeded' && <Leaderboards />}

      {activeGame !== 'home' && status === 'loading' && <p className="status-message">Loading cards…</p>}
      {activeGame !== 'home' && status === 'failed' && (
        <p className="status-message status-message--error">Failed to load cards.</p>
      )}
      {!isOnline && isMultiplayerGame && (
        <p className="status-message status-message--error">
          Multiplayer requires an internet connection.
        </p>
      )}

      {status === 'succeeded' && (
        <>
          {activeGame === 'card-guesser' && <CardGuesser />}
          {activeGame === 'higher-or-lower' && <HigherOrLower />}
          {isOnline && activeGame === 'card-categories' && <CardCategories />}
          {isOnline && activeGame === 'codenames' && <Codenames />}
          {activeGame === 'connections' && <Connections />}
          {isOnline && activeGame === 'chameleon' && <Chameleon />}
          {activeGame === 'wordle' && <CardWordle />}
          {activeGame === 'trivia' && <TriviaBlitz />}
        </>
      )}

      {(offlineReady || needRefresh) && (
        <aside className="pwa-toast" role="status" aria-live="polite">
          <p>
            {needRefresh
              ? 'A new version is ready. Reload when it is safe to leave your current game.'
              : 'Card Guesser is ready to use offline.'}
          </p>
          <div className="pwa-toast__actions">
            {needRefresh && (
              <button type="button" onClick={() => void updateServiceWorker(true)}>
                Reload
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOfflineReady(false)
                setNeedRefresh(false)
              }}
            >
              {needRefresh ? 'Later' : 'OK'}
            </button>
          </div>
        </aside>
      )}

      <span className="version-badge">
        v{import.meta.env.VITE_VERSION || 'dev'}
        {' · '}
        {import.meta.env.VITE_BUILD_TIME
          ? new Date(import.meta.env.VITE_BUILD_TIME).toLocaleDateString()
          : 'local'}
      </span>
    </div>
  )
}
