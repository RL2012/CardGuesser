import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import Peer from 'peerjs'
import { useAppSelector } from '../../hooks/hooks'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'
import { cardsShareProperty, getSharedProperties, pickStartingCard } from './chainlinkUtils'
import { createLocalPeer } from '../card-categories/LocalTransport'
import {
  ICE_SERVERS,
  MAX_PLAYERS,
  TURN_SECONDS,
  MAX_LIVES,
  type PlayerInfo,
  type AnyDataConnection,
  type ToHostMsg,
  type ToClientMsg,
  type ChainEntry,
} from './chainlinkTypes'

let chatIdSeq = 0

function timestamp(): number {
  return Date.now()
}

export default function ChainLink() {
  const cards = useAppSelector((s) => s.cards.cards)
  const cardNames = useMemo(() => cards.map((c) => c.name), [cards])

  const [name, setName] = useState(() => localStorage.getItem('cl-player-name') ?? '')
  const [phase, setPhase] = useState<'setup' | 'lobby' | 'game' | 'gameover'>('setup')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [isHost, setIsHost] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ id: number; name: string; text: string; self: boolean }[]>([])
  const [chatInput, setChatInput] = useState('')

  // Game state
  const [chain, setChain] = useState<ChainEntry[]>([])
  const [lives, setLives] = useState<Record<string, number>>({})
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null)
  const [turnDisplaySeconds, setTurnDisplaySeconds] = useState(0)
  const [lastSharedProps, setLastSharedProps] = useState<string[]>([])
  const [feedback, setFeedback] = useState<{ correct: boolean; cardName?: string } | null>(null)
  const [winner, setWinner] = useState<string | null>(null)
  const [showScoreEntry, setShowScoreEntry] = useState(false)
  const [finalScore, setFinalScore] = useState(0)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  // Refs
  const peerRef = useRef<Peer | null>(null)
  const hostConnRef = useRef<AnyDataConnection | null>(null)
  const clientConnsRef = useRef<Map<string, AnyDataConnection>>(new Map())
  const myPeerIdRef = useRef('')
  const myNameRef = useRef('')
  const isHostRef = useRef(false)
  const playersRef = useRef<PlayerInfo[]>([])
  const chainRef = useRef<ChainEntry[]>([])
  const livesRef = useRef<Record<string, number>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostGameRef = useRef({
    playerOrder: [] as string[],
    currentIdx: 0,
    usedCardIds: new Set<number>(),
    lastCard: null as { id: number; name: string } | null,
  })

  useEffect(() => {
    playersRef.current = players
  }, [players])

  useEffect(() => {
    chainRef.current = chain
  }, [chain])

  useEffect(() => {
    livesRef.current = lives
  }, [lives])

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // ── Host helpers ──

  const hostBroadcast = (msg: ToClientMsg) => {
    clientConnsRef.current.forEach((conn) => {
      try { conn.send(msg) } catch { /* ignore */ }
    })
  }

  const hostHandleTimeout = (peerId: string) => {
    if (hostGameRef.current.playerOrder[hostGameRef.current.currentIdx] !== peerId) return

    const newLives = { ...livesRef.current }
    newLives[peerId] = Math.max(0, (newLives[peerId] ?? MAX_LIVES) - 1)
    setLives(newLives)

    hostBroadcast({
      type: 'chain-wrong',
      playerPeerId: peerId,
      lives: newLives,
      nextPlayerPeerId: '',
      deadline: 0,
      cardId: null,
      cardName: null,
    })
    setFeedback({ correct: false })

    setTimeout(() => {
      setFeedback(null)
      hostAdvancePlayer()
    }, 1500)
  }

  const hostHandleSubmit = (peerId: string, cardId: number, cardName: string) => {
    if (hostGameRef.current.playerOrder[hostGameRef.current.currentIdx] !== peerId) return
    if (hostGameRef.current.usedCardIds.has(cardId)) {
      hostHandleTimeout(peerId)
      return
    }

    const card = cards.find((c) => c.id === cardId)
    const lastCardId = hostGameRef.current.lastCard?.id
    const lastCard = lastCardId ? cards.find((c) => c.id === lastCardId) : null

    if (!card || !lastCard || !cardsShareProperty(lastCard, card)) {
      hostHandleTimeout(peerId)
      return
    }

    clearTimer()
    hostGameRef.current.usedCardIds.add(cardId)
    hostGameRef.current.lastCard = { id: cardId, name: cardName }

    const playerName = playersRef.current.find((p) => p.peerId === peerId)?.name ?? peerId
    const entry: ChainEntry = { cardId, cardName, playerPeerId: peerId, playerName }
    const newChain = [...chainRef.current, entry]
    setChain(newChain)

    const nextPeerId = hostGameRef.current.playerOrder[(hostGameRef.current.currentIdx + 1) % hostGameRef.current.playerOrder.length]

    hostBroadcast({
      type: 'chain-correct',
      playerPeerId: peerId,
      cardId,
      cardName,
      nextPlayerPeerId: nextPeerId,
      deadline: 0,
      chainLength: newChain.length,
    })

    const shared = getSharedProperties(lastCard, card)
    setLastSharedProps(shared)
    setFeedback({ correct: true, cardName })

    setTimeout(() => {
      setFeedback(null)
      hostAdvancePlayer()
    }, 1500)
  }

  const hostAdvancePlayer = () => {
    const order = hostGameRef.current.playerOrder
    const alive = order.filter((p) => (livesRef.current[p] ?? 0) > 0)
    if (alive.length <= 1) {
      const w = alive[0]
      const winnerName = playersRef.current.find((p) => p.peerId === w)?.name ?? w
      setWinner(winnerName)
      setPhase('gameover')
      hostBroadcast({
        type: 'game-over',
        winner: winnerName,
        chain: chainRef.current.map((c) => ({ cardName: c.cardName, playerName: c.playerName })),
        lives: livesRef.current,
      })
      if (w === myPeerId) {
        setFinalScore(chainRef.current.length * 10 + 50)
        setShowScoreEntry(true)
      }
      return
    }

    let next = (hostGameRef.current.currentIdx + 1) % order.length
    let nextPeerId = order[next]
    let tries = 0
    while ((livesRef.current[nextPeerId] ?? 0) <= 0 && tries < order.length) {
      next = (next + 1) % order.length
      nextPeerId = order[next]
      tries++
    }
    hostGameRef.current.currentIdx = next
    hostStartTurn(nextPeerId)
  }

  const hostStartTurn = (peerId: string) => {
    clearTimer()
    setTurnDeadline(timestamp() + TURN_SECONDS * 1000)
    setTurnDisplaySeconds(TURN_SECONDS)
    setCurrentPlayer(peerId)

    const lastCard = hostGameRef.current.lastCard
    if (!lastCard) return

    hostBroadcast({
      type: 'turn-start',
      playerPeerId: peerId,
      lastCard,
      deadline: timestamp() + TURN_SECONDS * 1000,
    })

    timerRef.current = setTimeout(() => {
      hostHandleTimeout(peerId)
    }, TURN_SECONDS * 1000)
  }

  // ── Connection wiring ──

  const wireHostConn = useCallback((conn: AnyDataConnection) => {
    conn.on('data', (raw: unknown) => {
      const msg = raw as ToHostMsg
      if (!msg?.type) return

      if (msg.type === 'hello') {
        clientConnsRef.current.set(msg.peerId, conn)
        const newPlayers = [...playersRef.current, { peerId: msg.peerId, name: msg.name }]
        setPlayers(newPlayers)
        hostBroadcast({ type: 'player-list', players: newPlayers })
        hostBroadcast({ type: 'chat', name: 'System', text: `${msg.name} joined` })
        setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: 'System', text: `${msg.name} joined`, self: false }])
      } else if (msg.type === 'chat') {
        hostBroadcast({ type: 'chat', name: msg.name, text: msg.text })
        setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: msg.name, text: msg.text, self: false }])
      } else if (msg.type === 'submit-card') {
        hostHandleSubmit(conn.peer, msg.cardId, msg.cardName)
      }
    })

    conn.on('close', () => {
      const peerId = conn.peer
      clientConnsRef.current.delete(peerId)
      const name = playersRef.current.find((p) => p.peerId === peerId)?.name ?? peerId
      const newPlayers = playersRef.current.filter((p) => p.peerId !== peerId)
      setPlayers(newPlayers)
      hostBroadcast({ type: 'player-left', peerId, name })
      hostBroadcast({ type: 'player-list', players: newPlayers })
      setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: 'System', text: `${name} left`, self: false }])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wireClientConn = useCallback((conn: AnyDataConnection) => {
    conn.on('data', (raw: unknown) => {
      const msg = raw as ToClientMsg
      if (!msg?.type) return

      if (msg.type === 'player-list') {
        setPlayers(msg.players)
      } else if (msg.type === 'player-joined') {
        setPlayers((prev) => [...prev, msg.player])
        setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: 'System', text: `${msg.player.name} joined`, self: false }])
      } else if (msg.type === 'player-left') {
        setPlayers((prev) => prev.filter((p) => p.peerId !== msg.peerId))
        setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: 'System', text: `${msg.name} left`, self: false }])
      } else if (msg.type === 'chat') {
        setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: msg.name, text: msg.text, self: msg.name === myNameRef.current }])
      } else if (msg.type === 'game-start') {
        hostGameRef.current.lastCard = msg.firstCard
        hostGameRef.current.playerOrder = msg.playerOrder
        setChain([])
        setLives(msg.lives)
        setWinner(null)
        setPhase('game')
        setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: 'System', text: 'Game started!', self: false }])
      } else if (msg.type === 'turn-start') {
        setCurrentPlayer(msg.playerPeerId)
        setTurnDeadline(msg.deadline)
        setFeedback(null)
        hostGameRef.current.lastCard = msg.lastCard
      } else if (msg.type === 'chain-correct') {
        const name = playersRef.current.find((p) => p.peerId === msg.playerPeerId)?.name ?? msg.playerPeerId
        setChain((prev) => [...prev, { cardId: msg.cardId, cardName: msg.cardName, playerPeerId: msg.playerPeerId, playerName: name }])
        setFeedback({ correct: true, cardName: msg.cardName })
        setTimeout(() => setFeedback(null), 1500)
        setTurnDeadline(null)
        setCurrentPlayer(null)
      } else if (msg.type === 'chain-wrong') {
        setLives(msg.lives)
        setFeedback({ correct: false })
        setTimeout(() => setFeedback(null), 1500)
        setTurnDeadline(null)
        setCurrentPlayer(null)
      } else if (msg.type === 'game-over') {
        setWinner(msg.winner)
        setLives(msg.lives)
        setPhase('gameover')
        clearTimer()
      }
    })

    conn.on('close', () => {
      setPhase('setup')
      setPeerError('Disconnected from host')
    })
  }, [])

  // ── Host start / Join ──

  const startHost = useCallback(() => {
    setPeerError(null)
    setIsHost(true)
    isHostRef.current = true

    if (window.location.hostname === 'localhost') {
      const localPeer = createLocalPeer()
      peerRef.current = localPeer as unknown as Peer
      localPeer.on('open', (id: unknown) => {
        const pid = id as string
        setMyPeerId(pid)
        myPeerIdRef.current = pid
      })
      localPeer.on('connection', (conn: unknown) => {
        const c = conn as AnyDataConnection
        c.on('open', () => wireHostConn(c))
      })
      return
    }

    const peer = new Peer({ config: { iceServers: ICE_SERVERS } })
    peerRef.current = peer
    peer.on('open', (id) => {
      setMyPeerId(id)
      myPeerIdRef.current = id
    })
    peer.on('error', (err) => setPeerError(`Connection error: ${err.message}`))
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        wireHostConn(conn as unknown as AnyDataConnection)
      })
    })
  }, [wireHostConn])

  const joinHost = useCallback(() => {
    if (!joinId.trim()) return
    setPeerError(null)
    setIsHost(false)
    myPeerIdRef.current = joinId.trim() + '_guest'

    if (window.location.hostname === 'localhost') {
      const localPeer = createLocalPeer()
      const conn = localPeer.connect(joinId.trim())
      conn.on('open', () => {
        hostConnRef.current = conn
        wireClientConn(conn)
        conn.send({ type: 'hello', name, peerId: myPeerIdRef.current })
        setPhase('lobby')
      })
      return
    }

    const peer = new Peer({ config: { iceServers: ICE_SERVERS } })
    peerRef.current = peer
    peer.on('open', () => {
      const conn = peer.connect(joinId.trim(), { reliable: true })
      conn.on('open', () => {
        hostConnRef.current = conn as unknown as AnyDataConnection
        wireClientConn(conn as unknown as AnyDataConnection)
        ;(conn as unknown as AnyDataConnection).send({ type: 'hello', name, peerId: myPeerIdRef.current })
        setPhase('lobby')
      })
      conn.on('error', (err) => setPeerError(`Failed to connect: ${err.message}`))
    })
    peer.on('error', (err) => setPeerError(`Connection error: ${err.message}`))
  }, [joinId, name, wireClientConn])

  // ── Game actions ──

  const hostStartGame = () => {
    const allPlayers = playersRef.current
    if (allPlayers.length < 2) return

    const order = allPlayers.map((p) => p.peerId)
    hostGameRef.current.playerOrder = order
    hostGameRef.current.currentIdx = 0
    hostGameRef.current.usedCardIds.clear()

    const startCard = pickStartingCard(cards)
    hostGameRef.current.lastCard = { id: startCard.id, name: startCard.name }
    hostGameRef.current.usedCardIds.add(startCard.id)

    const initialLives: Record<string, number> = {}
    order.forEach((p) => { initialLives[p] = MAX_LIVES })

    setChain([{ cardId: startCard.id, cardName: startCard.name, playerPeerId: '', playerName: 'Start' }])
    setLives(initialLives)
    setWinner(null)
    setFeedback(null)
    setPhase('game')

    hostBroadcast({
      type: 'game-start',
      firstCard: { id: startCard.id, name: startCard.name },
      playerOrder: order,
      lives: initialLives,
    })

    setTimeout(() => hostStartTurn(order[0]), 1000)
  }

  const submitCard = (cardName: string) => {
    const card = cards.find((c) => c.name === cardName)
    if (!card) return
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)

    if (isHost) {
      hostHandleSubmit(myPeerIdRef.current, card.id, card.name)
    } else if (hostConnRef.current) {
      hostConnRef.current.send({ type: 'submit-card', cardId: card.id, cardName: card.name })
    }
  }

  const sendChat = () => {
    const text = chatInput.trim()
    if (!text) return
    setChatInput('')
    const msg = { type: 'chat' as const, name, text }
    if (isHost) {
      hostBroadcast(msg)
    } else if (hostConnRef.current) {
      hostConnRef.current.send(msg)
    }
    setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name, text, self: true }])
  }

  const handleScoreSubmit = (entryName: string) => {
    addScore('chainLink', entryName, finalScore)
    setShowScoreEntry(false)
  }

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.length >= 2) {
      const lower = value.toLowerCase()
      setSearchResults(cardNames.filter((n) => n.toLowerCase().includes(lower)).slice(0, 8))
      setSearchOpen(true)
    } else {
      setSearchResults([])
      setSearchOpen(false)
    }
  }

  useEffect(() => {
    return () => {
      clearTimer()
      peerRef.current?.destroy()
    }
  }, [])

  const isMyTurn = currentPlayer === myPeerId && phase === 'game'
  const canStartGame = isHost && players.length >= 2 && players.length <= MAX_PLAYERS

  // Countdown: update display seconds every 500ms from deadline
  useEffect(() => {
    if (!turnDeadline) return
    const update = () => {
      setTurnDisplaySeconds(Math.max(0, Math.ceil((turnDeadline - timestamp()) / 1000)))
    }
    update()
    const id = setInterval(update, 500)
    return () => clearInterval(id)
  }, [turnDeadline])

  // ── Setup ──
  if (phase === 'setup') {
    const handleNameSubmit = () => {
      if (!name.trim()) return
      localStorage.setItem('cl-player-name', name.trim())
      setPhase('lobby')
    }

    return (
      <div className="cl-lobby">
        <h2 className="cl-lobby__title">Chain Link</h2>
        <div className="cl-lobby__form">
          <div className="cl-lobby__section">
            <label className="cl-lobby__label">Your name</label>
            <input
              className="pvp-lobby__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit() }}
              placeholder="Enter your name…"
              maxLength={16}
              autoFocus
            />
          </div>
          {myPeerId ? (
            <div className="cl-lobby__section">
              <p className="cl-lobby__label">Your Room ID</p>
              <div className="cl-lobby__id-row">
                <span className="cl-lobby__id">{myPeerId}</span>
                <button
                  className="cl-lobby__copy-btn"
                  onClick={() => { navigator.clipboard.writeText(myPeerId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="cl-lobby__hint">Share this ID — friends use it to join your room.</p>
              {canStartGame && (
                <button className="hol-btn" style={{ marginTop: '0.75rem', width: '100%' }} onClick={hostStartGame}>
                  Start Game ({players.length} players)
                </button>
              )}
            </div>
          ) : (
            <div className="cl-lobby__section">
              <button className="hol-btn" style={{ width: '100%' }} onClick={startHost} disabled={!name.trim()}>
                Host Game
              </button>
            </div>
          )}

          <div className="cl-lobby__divider">or</div>

          <div className="cl-lobby__section">
            <label className="cl-lobby__label">Join a room</label>
            <div className="cl-lobby__id-row">
              <input
                className="pvp-lobby__input pvp-lobby__input--wide"
                value={joinId}
                onChange={(e) => setJoinId(e.target.value)}
                placeholder="Paste room ID…"
                onKeyDown={(e) => { if (e.key === 'Enter') joinHost() }}
              />
              <button className="hol-btn" onClick={joinHost} disabled={!joinId.trim() || !name.trim()}>
                Join
              </button>
            </div>
          </div>

          {peerError && <p className="cl-lobby__error">{peerError}</p>}
        </div>
      </div>
    )
  }

  // ── Waiting for host to start ──
  if (phase === 'lobby' && !isHost) {
    return (
      <div className="cl-lobby">
        <h2 className="cl-lobby__title">Chain Link</h2>
        <p className="cl-lobby__you">Waiting for host to start the game…</p>
        <ul className="cl-player-list">
          {players.map((p) => (
            <li key={p.peerId} className="cl-player-row">
              <span className="cl-dot cl-dot--online" />
              <span className="cl-player-row__name">{p.name}</span>
              {p.peerId === players[0]?.peerId && <span className="cl-tag cl-tag--host">Host</span>}
            </li>
          ))}
        </ul>
        <div className="cl-sidebar-chat">
          <div className="cl-chat-messages">
            {chatMessages.map((m) => (
              <div key={m.id} className={`cl-chat-msg${m.name === 'System' ? ' cl-chat-msg--system' : m.self ? ' cl-chat-msg--self' : ''}`}>
                {m.name !== 'System' && <span className="cl-chat-msg__name">{m.name}</span>}
                <span className="cl-chat-msg__text">{m.text}</span>
              </div>
            ))}
          </div>
          <div className="cl-chat-input-row">
            <input
              className="cl-chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
              placeholder="Chat…"
            />
            <button className="hol-btn" onClick={sendChat} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Send</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Game / Game Over ──
  return (
    <div className="cl-game">
      <div className="cl-game-header">
        <span className="cl-game-header__title">Chain Link</span>
        <div className="cl-game-header__lives">
          {players.map((p) => (
            <div key={p.peerId} className={`cl-life-chip${(lives[p.peerId] ?? 0) <= 0 ? ' cl-life-chip--dead' : ''}${currentPlayer === p.peerId ? ' cl-life-chip--active' : ''}`}>
              <span className="cl-life-chip__name">{p.name}</span>
              <span className="cl-life-chip__hearts">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <span key={i} className={i < (lives[p.peerId] ?? 0) ? 'cl-heart' : 'cl-heart cl-heart--empty'}>♥</span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {turnDeadline && isMyTurn && (
        <div className="cl-turn-bar">
          <div
            className={`cl-turn-bar__fill${turnDisplaySeconds <= 10 ? ' cl-turn-bar__fill--urgent' : ''}`}
            style={{ width: `${(turnDisplaySeconds / TURN_SECONDS) * 100}%` }}
          />
        </div>
      )}

      {feedback && (
        <div className={`cl-feedback${feedback.correct ? ' cl-feedback--correct' : ' cl-feedback--wrong'}`}>
          {feedback.correct
            ? `✓ ${feedback.cardName} — Chain link! ${lastSharedProps.length > 0 ? `(${lastSharedProps.join(', ')})` : ''}`
            : '✗ Wrong card or no shared property'}
        </div>
      )}

      <div className="cl-chain-area">
        <div className="cl-chain-list">
          {chain.map((entry, i) => (
            <div key={i} className="cl-chain-entry">
              <img
                className="cl-chain-entry__img"
                src={`https://images.ygoprodeck.com/images/cards_cropped/${entry.cardId}.jpg`}
                alt={entry.cardName}
              />
              <div className="cl-chain-entry__info">
                <span className="cl-chain-entry__name">{entry.cardName}</span>
                <span className="cl-chain-entry__player">{entry.playerName || 'Start'}</span>
              </div>
              {i < chain.length - 1 && currentPlayer && isMyTurn && (
                <span className="cl-chain-arrow">→</span>
              )}
            </div>
          ))}
        </div>
        {currentPlayer && isMyTurn && (
          <div className="cl-chain-prompt">
            <span className="cl-chain-prompt__label">
              Name a card that shares Attribute, Race, Archetype, or Type with:
            </span>
            <span className="cl-chain-prompt__last">{chain[chain.length - 1]?.cardName}</span>
          </div>
        )}
      </div>

      {phase === 'gameover' && winner && (
        <div className="cl-gameover-banner">
          <span className="cl-gameover-banner__text">{winner} wins!</span>
          {showScoreEntry ? (
            <ScoreEntry score={finalScore} onSubmit={handleScoreSubmit} onSkip={() => setShowScoreEntry(false)} />
          ) : (
            <button className="hol-btn" onClick={() => { setPhase('setup'); setIsHost(false); setWinner(null) }}>Leave</button>
          )}
        </div>
      )}

      {isMyTurn && phase === 'game' && (
        <div className="cl-search-area">
          <div className="card-search">
            <input
              className="card-search-input"
              placeholder="Search a card to link…"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Enter' && searchResults.length > 0) submitCard(searchResults[0]) }}
              autoComplete="off"
            />
            {searchOpen && searchResults.length > 0 && (
              <ul className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0 }}>
                {searchResults.map((n) => (
                  <li key={n} className="search-dropdown-item" onMouseDown={() => submitCard(n)}>
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {phase === 'game' && !isMyTurn && (
        <div className="cl-waiting">
          {currentPlayer
            ? `Waiting for ${players.find((p) => p.peerId === currentPlayer)?.name ?? '...'}…`
            : 'Waiting for next turn…'}
        </div>
      )}

      <div className="cl-sidebar-chat">
        <div className="cl-chat-messages">
          {chatMessages.map((m) => (
            <div key={m.id} className={`cl-chat-msg${m.name === 'System' ? ' cl-chat-msg--system' : m.self ? ' cl-chat-msg--self' : ''}`}>
              {m.name !== 'System' && <span className="cl-chat-msg__name">{m.name}</span>}
              <span className="cl-chat-msg__text">{m.text}</span>
            </div>
          ))}
        </div>
        <div className="cl-chat-input-row">
          <input
            className="cl-chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendChat() }}
            placeholder="Chat…"
          />
          <button className="hol-btn" onClick={sendChat} style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Send</button>
        </div>
      </div>
    </div>
  )
}
