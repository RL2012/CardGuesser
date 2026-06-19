import { useRef, useState, useEffect, useMemo } from 'react'
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

function ts(): number {
  return Date.now()
}

let chatIdSeq = 0

export default function ChainLink() {
  const cards = useAppSelector((s) => s.cards.cards)
  const cardNames = useMemo(() => cards.map((c) => c.name), [cards])

  const [name, setName] = useState(() => localStorage.getItem('cl-player-name') ?? '')
  const [phase, setPhase] = useState<'name-entry' | 'lobby' | 'game' | 'gameover'>('name-entry')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [isHost, setIsHost] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ id: number; name: string; text: string; self: boolean }[]>([])
  const [chatInput, setChatInput] = useState('')

  const [chain, setChain] = useState<ChainEntry[]>([])
  const [lives, setLives] = useState<Record<string, number>>({})
  const [currentPlayer, setCurrentPlayer] = useState<string | null>(null)
  const [turnDisplaySeconds, setTurnDisplaySeconds] = useState(0)
  const [turnDeadline, setTurnDeadline] = useState<number | null>(null)
  const [lastSharedProps, setLastSharedProps] = useState<string[]>([])
  const [feedback, setFeedback] = useState<{ correct: boolean; cardName?: string } | null>(null)
  const [winner, setWinner] = useState<string | null>(null)
  const [showScoreEntry, setShowScoreEntry] = useState(false)
  const [finalScore, setFinalScore] = useState(0)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  const peerRef = useRef<Peer | null>(null)
  const hostConnRef = useRef<AnyDataConnection | null>(null)
  const clientConnsRef = useRef<Map<string, AnyDataConnection>>(new Map())
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostGameRef = useRef({
    playerOrder: [] as string[],
    currentIdx: 0,
    usedCardIds: new Set<number>(),
    lastCard: null as { id: number; name: string } | null,
  })

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const hostBroadcast = (msg: ToClientMsg) => {
    clientConnsRef.current.forEach((conn) => {
      try { conn.send(msg) } catch { /* ignore */ }
    })
  }

  const hostHandleTimeout = (peerId: string) => {
    if (hostGameRef.current.playerOrder[hostGameRef.current.currentIdx] !== peerId) return
    const newLives = { ...lives }
    newLives[peerId] = Math.max(0, (newLives[peerId] ?? MAX_LIVES) - 1)
    setLives(newLives)
    hostBroadcast({ type: 'chain-wrong', playerPeerId: peerId, lives: newLives, nextPlayerPeerId: '', deadline: 0, cardId: null, cardName: null })
    setFeedback({ correct: false })
    setTimeout(() => { setFeedback(null); hostAdvancePlayer() }, 1500)
  }

  const hostHandleSubmit = (peerId: string, cardId: number, cardName: string) => {
    if (hostGameRef.current.playerOrder[hostGameRef.current.currentIdx] !== peerId) return
    if (hostGameRef.current.usedCardIds.has(cardId)) { hostHandleTimeout(peerId); return }
    const card = cards.find((c) => c.id === cardId)
    const lastCardId = hostGameRef.current.lastCard?.id
    const lastCard = lastCardId ? cards.find((c) => c.id === lastCardId) : null
    if (!card || !lastCard || !cardsShareProperty(lastCard, card)) { hostHandleTimeout(peerId); return }
    clearTimer()
    hostGameRef.current.usedCardIds.add(cardId)
    hostGameRef.current.lastCard = { id: cardId, name: cardName }
    const playerName = players.find((p) => p.peerId === peerId)?.name ?? peerId
    const newChain = [...chain, { cardId, cardName, playerPeerId: peerId, playerName }]
    setChain(newChain)
    hostBroadcast({ type: 'chain-correct', playerPeerId: peerId, cardId, cardName, nextPlayerPeerId: '', deadline: 0, chainLength: newChain.length })
    const shared = getSharedProperties(lastCard, card)
    setLastSharedProps(shared)
    setFeedback({ correct: true, cardName })
    setTimeout(() => { setFeedback(null); hostAdvancePlayer() }, 1500)
  }

  const hostAdvancePlayer = () => {
    const order = hostGameRef.current.playerOrder
    const alive = order.filter((p) => (lives[p] ?? 0) > 0)
    if (alive.length <= 1) {
      const w = alive[0]
      const winnerName = players.find((p) => p.peerId === w)?.name ?? w
      setWinner(winnerName)
      setPhase('gameover')
      hostBroadcast({ type: 'game-over', winner: winnerName, chain: chain.map((c) => ({ cardName: c.cardName, playerName: c.playerName })), lives })
      if (w === myPeerId) { setFinalScore(chain.length * 10 + 50); setShowScoreEntry(true) }
      return
    }
    let next = (hostGameRef.current.currentIdx + 1) % order.length
    let nextPeerId = order[next]
    let tries = 0
    while ((lives[nextPeerId] ?? 0) <= 0 && tries < order.length) { next = (next + 1) % order.length; nextPeerId = order[next]; tries++ }
    hostGameRef.current.currentIdx = next
    hostStartTurn(nextPeerId)
  }

  const hostStartTurn = (peerId: string) => {
    clearTimer()
    setTurnDeadline(ts() + TURN_SECONDS * 1000)
    setTurnDisplaySeconds(TURN_SECONDS)
    setCurrentPlayer(peerId)
    const lastCard = hostGameRef.current.lastCard
    if (!lastCard) return
    hostBroadcast({ type: 'turn-start', playerPeerId: peerId, lastCard, deadline: ts() + TURN_SECONDS * 1000 })
    timerRef.current = setTimeout(() => { hostHandleTimeout(peerId) }, TURN_SECONDS * 1000)
  }

  // ── Connection wiring ──

  const wireHostConn = (conn: AnyDataConnection) => {
    conn.on('data', (raw: unknown) => {
      const msg = raw as ToHostMsg
      if (!msg?.type) return
      if (msg.type === 'hello') {
        clientConnsRef.current.set(msg.peerId, conn)
        const newPlayers = [...players, { peerId: msg.peerId, name: msg.name }]
        setPlayers(newPlayers)
        hostBroadcast({ type: 'player-list', players: newPlayers })
        addChat('System', `${msg.name} joined`, false)
      } else if (msg.type === 'chat') {
        hostBroadcast({ type: 'chat', name: msg.name, text: msg.text })
        addChat(msg.name, msg.text, false)
      } else if (msg.type === 'submit-card') {
        hostHandleSubmit(conn.peer, msg.cardId, msg.cardName)
      }
    })
    conn.on('close', () => {
      const pid = conn.peer
      clientConnsRef.current.delete(pid)
      const dropped = players.find((p) => p.peerId === pid)
      const newPlayers = players.filter((p) => p.peerId !== pid)
      setPlayers(newPlayers)
      hostBroadcast({ type: 'player-left', peerId: pid, name: dropped?.name ?? pid })
      hostBroadcast({ type: 'player-list', players: newPlayers })
      if (dropped) addChat('System', `${dropped.name} left`, false)
    })
  }

  const wireClientConn = (conn: AnyDataConnection) => {
    conn.on('data', (raw: unknown) => {
      const msg = raw as ToClientMsg
      if (!msg?.type) return
      if (msg.type === 'player-list') setPlayers(msg.players)
      else if (msg.type === 'player-joined') { setPlayers((p) => [...p, msg.player]); addChat('System', `${msg.player.name} joined`, false) }
      else if (msg.type === 'player-left') { setPlayers((p) => p.filter((x) => x.peerId !== msg.peerId)); addChat('System', `${msg.name} left`, false) }
      else if (msg.type === 'chat') addChat(msg.name, msg.text, msg.name === name)
      else if (msg.type === 'game-start') {
        hostGameRef.current.lastCard = msg.firstCard
        hostGameRef.current.playerOrder = msg.playerOrder
        setChain([]); setLives(msg.lives); setWinner(null); setPhase('game'); addChat('System', 'Game started!', false)
      } else if (msg.type === 'turn-start') { setCurrentPlayer(msg.playerPeerId); setTurnDeadline(msg.deadline); setFeedback(null); hostGameRef.current.lastCard = msg.lastCard }
      else if (msg.type === 'chain-correct') {
        const nm = players.find((p) => p.peerId === msg.playerPeerId)?.name ?? msg.playerPeerId
        setChain((prev) => [...prev, { cardId: msg.cardId, cardName: msg.cardName, playerPeerId: msg.playerPeerId, playerName: nm }])
        setFeedback({ correct: true, cardName: msg.cardName }); setTimeout(() => setFeedback(null), 1500)
        setTurnDeadline(null); setCurrentPlayer(null)
      } else if (msg.type === 'chain-wrong') { setLives(msg.lives); setFeedback({ correct: false }); setTimeout(() => setFeedback(null), 1500); setTurnDeadline(null); setCurrentPlayer(null) }
      else if (msg.type === 'game-over') { setWinner(msg.winner); setLives(msg.lives); setPhase('gameover'); clearTimer() }
    })
    conn.on('close', () => { setPhase('name-entry'); setPeerError('Disconnected from host') })
  }

  // ── Actions ──

  const handleHost = () => {
    if (!name.trim()) return
    localStorage.setItem('cl-player-name', name.trim())
    setPeerError(null)
    setIsHost(true)
    isHostRef.current = true
    myPeerIdRef.current = ''
    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peer: any = isLocalDev ? createLocalPeer() : new Peer({ config: { iceServers: ICE_SERVERS } })
    peerRef.current = peer
    peer.on('open', (id: string) => { myPeerIdRef.current = id; setMyPeerId(id); setPhase('lobby') })
    peer.on('connection', (conn: AnyDataConnection) => { wireHostConn(conn) })
    peer.on('error', (err: Error) => setPeerError(err.message))
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id || !peerRef.current) return
    setPeerError(null)
    isHostRef.current = false
    setIsHost(false)
    wireClientConn(peerRef.current.connect(id) as unknown as AnyDataConnection)
    setPhase('lobby')
  }

  const hostStartGame = () => {
    const allPlayers = players
    if (allPlayers.length < 1) return
    const order = [myPeerIdRef.current, ...allPlayers.map((p) => p.peerId)]
    hostGameRef.current.playerOrder = order
    hostGameRef.current.currentIdx = 0
    hostGameRef.current.usedCardIds.clear()
    const startCard = pickStartingCard(cards)
    hostGameRef.current.lastCard = { id: startCard.id, name: startCard.name }
    hostGameRef.current.usedCardIds.add(startCard.id)
    const initialLives: Record<string, number> = {}
    order.forEach((p) => { initialLives[p] = MAX_LIVES })
    setChain([{ cardId: startCard.id, cardName: startCard.name, playerPeerId: '', playerName: 'Start' }])
    setLives(initialLives); setWinner(null); setFeedback(null); setPhase('game')
    hostBroadcast({ type: 'game-start', firstCard: { id: startCard.id, name: startCard.name }, playerOrder: order, lives: initialLives })
    setTimeout(() => hostStartTurn(order[0]), 1000)
  }

  const submitCard = (cardName: string) => {
    const card = cards.find((c) => c.name === cardName)
    if (!card) return
    setSearchQuery(''); setSearchResults([]); setSearchOpen(false)
    if (isHost) hostHandleSubmit(myPeerIdRef.current, card.id, card.name)
    else if (hostConnRef.current) hostConnRef.current.send({ type: 'submit-card', cardId: card.id, cardName: card.name })
  }

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    setChatInput('')
    const msg = { type: 'chat' as const, name, text }
    if (isHost) hostBroadcast(msg)
    else if (hostConnRef.current) hostConnRef.current.send(msg)
    addChat(name, text, true)
  }

  const addChat = (from: string, text: string, self: boolean) => {
    setChatMessages((prev) => [...prev, { id: ++chatIdSeq, name: from, text, self }])
  }

  const handleScoreSubmit = (entryName: string) => {
    addScore('chainLink', entryName, finalScore)
    setShowScoreEntry(false)
  }

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (value.length >= 2) { setSearchResults(cardNames.filter((n) => n.toLowerCase().includes(value.toLowerCase())).slice(0, 8)); setSearchOpen(true) }
    else { setSearchResults([]); setSearchOpen(false) }
  }

  // ── Countdown ──

  useEffect(() => {
    if (!turnDeadline) return
    const update = () => setTurnDisplaySeconds(Math.max(0, Math.ceil((turnDeadline - ts()) / 1000)))
    update()
    const id = setInterval(update, 500)
    return () => clearInterval(id)
  }, [turnDeadline])

  useEffect(() => { return () => { clearTimer(); peerRef.current?.destroy() } }, [])

  const isMyTurn = currentPlayer === myPeerId && phase === 'game'
  const canStart = isHost && players.length >= 1 && players.length < MAX_PLAYERS

  // ── Name entry ──
  if (phase === 'name-entry') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chain Link</h2>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <form className="pvp-lobby__form" onSubmit={(e) => { e.preventDefault(); handleHost() }}>
          <label className="pvp-lobby__label" htmlFor="cl-name">Your name</label>
          <input id="cl-name" className="pvp-lobby__input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name…" maxLength={16} autoFocus />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>Host Game</button>
        </form>
      </div>
    )
  }

  // ── Lobby ──
  if (phase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chain Link</h2>
        <p className="pvp-lobby__you">You: <strong>{name}</strong></p>
        {!myPeerId && <p className="pvp-lobby__hint">Connecting to network…</p>}
        {myPeerId && (
          <>
            {isHost && (
              <section className="pvp-lobby__section">
                <p className="pvp-lobby__label">Your game code — share with friends:</p>
                <div className="pvp-lobby__id-row">
                  <code className="pvp-lobby__id">{myPeerId}</code>
                  <button className="pvp-lobby__copy-btn" onClick={() => { navigator.clipboard.writeText(myPeerId); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>{copied ? 'Copied!' : 'Copy'}</button>
                </div>
              </section>
            )}
            <div className="pvp-lobby__divider">or</div>
            <section className="pvp-lobby__section">
              <form onSubmit={handleJoin}>
                <p className="pvp-lobby__label">Join a friend's game:</p>
                <div className="pvp-lobby__id-row">
                  <input className="pvp-lobby__input pvp-lobby__input--wide" type="text" value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Paste their game code…" />
                  <button className="hol-btn" type="submit" disabled={!joinId.trim()}>Join</button>
                </div>
              </form>
            </section>
          </>
        )}
        <ul className="pvp-lobby__player-list">
          {players.map((p) => (
            <li key={p.peerId} className="pvp-lobby__player-row">
              <span className="pvp-lobby__dot pvp-lobby__dot--online" />
              <span className="pvp-lobby__player-name">{p.name}</span>
              <span className="pvp-lobby__tag pvp-lobby__tag--host">HOST</span>
            </li>
          ))}
          {players.length === 0 && <li className="pvp-lobby__player-row pvp-lobby__player-row--empty">Waiting for players…</li>}
        </ul>
        {canStart && <button className="hol-btn" onClick={hostStartGame} style={{ width: '100%' }}>Start Game ({players.length + 1} players)</button>}
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
      </div>
    )
  }

  // ── Game / Gameover ──
  return (
    <div className="pvp-room">
      <div className="cl-game-col">
        <div className="cl-game-header">
          <span className="cl-game-header__title">Chain Link</span>
          <div className="cl-lives-row">
            {[...(myPeerId ? [{ peerId: myPeerId, name }] : []), ...players].map((p) => (
              <div key={p.peerId} className={`cl-life-chip${(lives[p.peerId] ?? 0) <= 0 ? ' cl-life-chip--dead' : ''}${currentPlayer === p.peerId ? ' cl-life-chip--active' : ''}`}>
                <span className="cl-life-chip__name">{p.name}</span>
                <span className="cl-life-chip__hearts">{Array.from({ length: MAX_LIVES }).map((_, i) => <span key={i} className={i < (lives[p.peerId] ?? 0) ? 'cl-heart' : 'cl-heart cl-heart--empty'}>♥</span>)}</span>
              </div>
            ))}
          </div>
        </div>

        {turnDeadline && (
          <div className="cl-turn-bar">
            <div className={`cl-turn-bar__fill${turnDisplaySeconds <= 10 ? ' cl-turn-bar__fill--urgent' : ''}`} style={{ width: `${(turnDisplaySeconds / TURN_SECONDS) * 100}%` }} />
          </div>
        )}

        {feedback && (
          <div className={`cl-feedback${feedback.correct ? ' cl-feedback--correct' : ' cl-feedback--wrong'}`}>
            {feedback.correct ? `✓ ${feedback.cardName} — Chain link! ${lastSharedProps.length > 0 ? `(${lastSharedProps.join(', ')})` : ''}` : '✗ Wrong card or no shared property'}
          </div>
        )}

        <div className="cl-chain-list">
          {chain.map((entry, i) => (
            <div key={i} className="cl-chain-entry">
              <img className="cl-chain-entry__img" src={`https://images.ygoprodeck.com/images/cards_cropped/${entry.cardId}.jpg`} alt={entry.cardName} />
              <div className="cl-chain-entry__info">
                <span className="cl-chain-entry__name">{entry.cardName}</span>
                <span className="cl-chain-entry__player">{entry.playerName || 'Start'}</span>
              </div>
            </div>
          ))}
        </div>

        {isMyTurn && (
          <>
            <div className="cl-chain-prompt">
              <span className="cl-chain-prompt__label">Name a card sharing Attribute, Race, Archetype, or Type with:</span>
              <span className="cl-chain-prompt__last">{chain[chain.length - 1]?.cardName}</span>
            </div>
            <div className="cl-search-area">
              <div className="card-search" style={{ position: 'relative' }}>
                <input className="card-search-input" placeholder="Search a card…" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter' && searchResults.length > 0) submitCard(searchResults[0]) }} autoComplete="off" />
                {searchOpen && searchResults.length > 0 && (
                  <ul className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0 }}>
                    {searchResults.map((n) => <li key={n} className="search-dropdown-item" onMouseDown={() => submitCard(n)}>{n}</li>)}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {phase === 'game' && !isMyTurn && (
          <div className="cl-waiting">{currentPlayer ? `Waiting for ${players.find((p) => p.peerId === currentPlayer)?.name ?? '...'}…` : 'Waiting for next turn…'}</div>
        )}

        {phase === 'gameover' && winner && (
          <div className="cl-gameover">
            <span className="cl-gameover__winner">{winner} wins!</span>
            {showScoreEntry ? <ScoreEntry score={finalScore} onSubmit={handleScoreSubmit} onSkip={() => setShowScoreEntry(false)} /> : <button className="hol-btn" onClick={() => { setPhase('name-entry'); setIsHost(false); setWinner(null) }}>Leave</button>}
          </div>
        )}
      </div>

      <div className="pvp-chat">
        <div className="pvp-chat__messages">
          {chatMessages.map((m) => (
            <div key={m.id} className={`pvp-chat__msg${m.name === 'System' ? ' pvp-chat__msg--system' : m.self ? ' pvp-chat__msg--self' : ''}`}>
              {m.name !== 'System' && <span className="pvp-chat__msg-name">{m.name}</span>}
              <span className="pvp-chat__msg-text">{m.text}</span>
            </div>
          ))}
        </div>
        <form className="pvp-chat__input-row" onSubmit={sendChat}>
          <input className="pvp-chat__input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Chat…" />
          <button className="hol-btn" type="submit" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Send</button>
        </form>
      </div>
    </div>
  )
}
