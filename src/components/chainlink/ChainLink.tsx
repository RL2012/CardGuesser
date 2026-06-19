import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Peer, { type DataConnection } from 'peerjs'
import { useAppSelector } from '../../hooks/hooks'
import ScoreEntry from '../ScoreEntry'
import { addScore } from '../../services/leaderboard'
import { cardsShareProperty, getSharedProperties, pickStartingCard } from './chainlinkUtils'
import { createLocalPeer } from '../../multiplayer/transport'
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

// ── Constants ────────────────────────────────────────────────────────────
const STORAGE_KEY = 'cl-player-name'

interface ChatMessage {
  id: number
  name: string
  text: string
  self: boolean
}

type LobbyPhase = 'setup' | 'name-entry' | 'lobby' | 'room' | 'game'

let chatIdSeq = 0

function ts(): number {
  return Date.now()
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ChainLink() {
  const cards = useAppSelector((s) => s.cards.cards)
  const cardNames = useMemo(() => cards.map((c) => c.name), [cards])

  // ── Lobby state ──
  const [name, setName] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>('setup')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  // ── Game state ──
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

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchRect, setSearchRect] = useState<DOMRect | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // ── Refs ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const clientConnsRef = useRef<Map<string, AnyDataConnection>>(new Map())
  const hostConnRef = useRef<AnyDataConnection | null>(null)
  const playersRef = useRef<PlayerInfo[]>([])
  const inGameRef = useRef(false)
  const cardsRef = useRef(cards)
  const chainRef = useRef<ChainEntry[]>([])
  const livesRef = useRef<Record<string, number>>({})
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hostGameRef = useRef({
    playerOrder: [] as string[],
    currentIdx: 0,
    usedCardIds: new Set<number>(),
    lastCard: null as { id: number; name: string } | null,
  })

  useEffect(() => { cardsRef.current = cards }, [cards])
  useEffect(() => { playersRef.current = players }, [players])

  const updateChain = (val: ChainEntry[] | ((prev: ChainEntry[]) => ChainEntry[])) => {
    if (typeof val === 'function') {
      setChain((prev) => {
        const next = val(prev)
        chainRef.current = next
        return next
      })
    } else {
      chainRef.current = val
      setChain(val)
    }
  }
  const updateLives = (val: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    if (typeof val === 'function') {
      setLives((prev) => {
        const next = val(prev)
        livesRef.current = next
        return next
      })
    } else {
      livesRef.current = val
      setLives(val)
    }
  }

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  // ── Chat ────────────────────────────────────────────────────────────────

  function addChat(msg: Omit<ChatMessage, 'id'>) {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: chatIdSeq++ }]
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
      return next
    })
  }

  // ── Broadcast ───────────────────────────────────────────────────────────

  function broadcast(msg: ToClientMsg, skipPeerId?: string) {
    clientConnsRef.current.forEach((conn, id) => {
      if (id !== skipPeerId) conn.send(msg)
    })
  }

  // ── Host helpers ────────────────────────────────────────────────────────

  function upsertPlayer(player: PlayerInfo) {
    const { current } = playersRef
    const idx = current.findIndex((p) => p.peerId === player.peerId)
    const next = idx >= 0 ? Object.assign([...current], { [idx]: player }) : [...current, player]
    playersRef.current = next
    setPlayers(next)
  }

  function removePlayer(peerId: string) {
    const next = playersRef.current.filter((p) => p.peerId !== peerId)
    playersRef.current = next
    setPlayers(next)
  }

  // ── Host game logic ─────────────────────────────────────────────────────

  const hostHandleTimeout = (peerId: string) => {
    if (hostGameRef.current.playerOrder[hostGameRef.current.currentIdx] !== peerId) return
    const newLives = { ...livesRef.current }
    newLives[peerId] = Math.max(0, (newLives[peerId] ?? MAX_LIVES) - 1)
    updateLives(newLives)
    broadcast({ type: 'chain-wrong', playerPeerId: peerId, lives: newLives, nextPlayerPeerId: '', deadline: 0, cardId: null, cardName: null })
    setFeedback({ correct: false })
    setTimeout(() => { setFeedback(null); hostAdvancePlayer() }, 1500)
  }

  const hostHandleSubmit = (peerId: string, cardId: number, cardName: string) => {
    if (hostGameRef.current.playerOrder[hostGameRef.current.currentIdx] !== peerId) return
    if (hostGameRef.current.usedCardIds.has(cardId)) { hostHandleTimeout(peerId); return }
    const lastCardId = hostGameRef.current.lastCard?.id
    const lastCard = lastCardId ? cardsRef.current.find((c) => c.id === lastCardId) : null
    const card = cardsRef.current.find((c) => c.id === cardId)
    if (!card || !lastCard || !cardsShareProperty(lastCard, card)) { hostHandleTimeout(peerId); return }
    clearTimer()
    hostGameRef.current.usedCardIds.add(cardId)
    hostGameRef.current.lastCard = { id: cardId, name: cardName }
    const pn = playersRef.current.find((p) => p.peerId === peerId)?.name ?? peerId
    const newChain = [...chainRef.current, { cardId, cardName, playerPeerId: peerId, playerName: pn }]
    updateChain(newChain)
    broadcast({ type: 'chain-correct', playerPeerId: peerId, cardId, cardName, nextPlayerPeerId: '', deadline: 0, chainLength: newChain.length })
    setLastSharedProps(getSharedProperties(lastCard, card))
    setFeedback({ correct: true, cardName })
    setTimeout(() => { setFeedback(null); hostAdvancePlayer() }, 1500)
  }

  const hostAdvancePlayer = () => {
    const order = hostGameRef.current.playerOrder
    const curLives = livesRef.current
    const alive = order.filter((p) => (curLives[p] ?? 0) > 0)
    if (alive.length <= 1) {
      const w = alive[0]
      const winnerName = playersRef.current.find((p) => p.peerId === w)?.name ?? w
      setWinner(winnerName)
      broadcast({ type: 'game-over', winner: winnerName, chain: chainRef.current.map((c) => ({ cardName: c.cardName, playerName: c.playerName })), lives: curLives })
      if (w === myPeerIdRef.current) { setFinalScore(chainRef.current.length * 10 + 50); setShowScoreEntry(true) }
      clearTimer()
      return
    }
    let next = (hostGameRef.current.currentIdx + 1) % order.length
    let nid = order[next]
    let tries = 0
    while ((curLives[nid] ?? 0) <= 0 && tries < order.length) { next = (next + 1) % order.length; nid = order[next]; tries++ }
    hostGameRef.current.currentIdx = next
    hostStartTurn(nid)
  }

  const hostStartTurn = (peerId: string) => {
    clearTimer()
    setTurnDeadline(ts() + TURN_SECONDS * 1000)
    setTurnDisplaySeconds(TURN_SECONDS)
    setCurrentPlayer(peerId)
    const lastCard = hostGameRef.current.lastCard
    if (!lastCard) return
    broadcast({ type: 'turn-start', playerPeerId: peerId, lastCard, deadline: ts() + TURN_SECONDS * 1000 })
    timerRef.current = setTimeout(() => { hostHandleTimeout(peerId) }, TURN_SECONDS * 1000)
  }

  // ── Connection wiring ───────────────────────────────────────────────────

  const wireClientConn = useCallback((conn: AnyDataConnection) => {
    conn.on('data', (raw) => {
      const msg = raw as ToHostMsg
      if (msg.type === 'hello') {
        if (inGameRef.current) {
          conn.send({ type: 'game-in-progress' } satisfies ToClientMsg)
          setTimeout(() => conn.close(), 200)
          return
        }
        const newPlayer: PlayerInfo = { peerId: msg.peerId, name: msg.name }
        upsertPlayer(newPlayer)
        clientConnsRef.current.set(msg.peerId, conn)
        conn.send({ type: 'player-list', players: playersRef.current } satisfies ToClientMsg)
        broadcast({ type: 'player-joined', player: newPlayer } satisfies ToClientMsg, msg.peerId)
        addChat({ name: '', text: `${msg.name} joined the room.`, self: false })
      }
      if (msg.type === 'chat') {
        broadcast({ type: 'chat', name: msg.name, text: msg.text } satisfies ToClientMsg, conn.peer)
        addChat({ name: msg.name, text: msg.text, self: false })
      }
      if (msg.type === 'submit-card') {
        hostHandleSubmit(conn.peer, msg.cardId, msg.cardName)
      }
    })

    conn.on('close', () => {
      const pid = conn.peer
      const leaving = playersRef.current.find((p) => p.peerId === pid)
      clientConnsRef.current.delete(pid)
      removePlayer(pid)
      if (leaving) {
        if (inGameRef.current) {
          inGameRef.current = false
          setLobbyPhase('room')
          broadcast({ type: 'player-disconnected-reset', name: leaving.name } satisfies ToClientMsg)
          addChat({ name: '', text: `${leaving.name} disconnected. The game has been reset.`, self: false })
        } else {
          broadcast({ type: 'player-left', peerId: pid, name: leaving.name } satisfies ToClientMsg)
          addChat({ name: '', text: `${leaving.name} left the room.`, self: false })
        }
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.on('error', (err: any) => setPeerError(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wireHostConn = useCallback((conn: AnyDataConnection) => {
    hostConnRef.current = conn
    let rejectedReason: string | null = null
    const connTimeout = setTimeout(() => {
      if (conn.open === false && (conn as DataConnection).peerConnection?.connectionState !== 'connected') {
        setPeerError('Connection timed out. Check the host code and try again.')
        conn.close()
      }
    }, 10_000)

    conn.on('open', () => {
      clearTimeout(connTimeout)
      conn.send({ type: 'hello', name: myNameRef.current, peerId: myPeerIdRef.current } satisfies ToHostMsg)
    })
    conn.on('data', (raw) => {
      const msg = raw as ToClientMsg
      if (msg.type === 'game-in-progress') {
        rejectedReason = 'That game is already in progress.'
        return
      }
      applyMsg(msg)
    })
    conn.on('close', () => {
      clearTimeout(connTimeout)
      if (rejectedReason) {
        hostConnRef.current = null
        isHostRef.current = true
        setIsHost(true)
        setLobbyPhase('lobby')
        setPeerError(rejectedReason)
        return
      }
      resetToSetup()
      setPeerError('The host disconnected.')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.on('error', (err: any) => {
      clearTimeout(connTimeout)
      setPeerError(err.message)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply message (guest) ───────────────────────────────────────────────

  function applyMsg(msg: ToClientMsg) {
    if (msg.type === 'player-list') {
      setPlayers(msg.players)
    } else if (msg.type === 'player-joined') {
      upsertPlayer(msg.player)
      addChat({ name: '', text: `${msg.player.name} joined the room.`, self: false })
    } else if (msg.type === 'player-left') {
      removePlayer(msg.peerId)
      addChat({ name: '', text: `${msg.name} left the room.`, self: false })
    } else if (msg.type === 'chat') {
      addChat({ name: msg.name, text: msg.text, self: false })
    } else if (msg.type === 'game-start') {
      hostGameRef.current.lastCard = msg.firstCard
      hostGameRef.current.playerOrder = msg.playerOrder
      updateChain([])
      updateLives(msg.lives)
      setWinner(null)
      setLobbyPhase('game')
      addChat({ name: '', text: 'Game started!', self: false })
    } else if (msg.type === 'turn-start') {
      setCurrentPlayer(msg.playerPeerId)
      setTurnDeadline(msg.deadline)
      setFeedback(null)
      hostGameRef.current.lastCard = msg.lastCard
    } else if (msg.type === 'chain-correct') {
      const nm = playersRef.current.find((p) => p.peerId === msg.playerPeerId)?.name ?? msg.playerPeerId
      updateChain((prev) => [...prev, { cardId: msg.cardId, cardName: msg.cardName, playerPeerId: msg.playerPeerId, playerName: nm }])
      setFeedback({ correct: true, cardName: msg.cardName })
      setTimeout(() => setFeedback(null), 1500)
      setTurnDeadline(null)
      setCurrentPlayer(null)
    } else if (msg.type === 'chain-wrong') {
      updateLives(msg.lives)
      setFeedback({ correct: false })
      setTimeout(() => setFeedback(null), 1500)
      setTurnDeadline(null)
      setCurrentPlayer(null)
    } else if (msg.type === 'game-over') {
      setWinner(msg.winner)
      updateLives(msg.lives)
      cleanUpGame()
      addChat({ name: '', text: `${msg.winner} wins!`, self: false })
    } else if (msg.type === 'player-disconnected-reset') {
      addChat({ name: '', text: `${msg.name} disconnected. The game has been reset.`, self: false })
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  function resetToSetup() {
    inGameRef.current = false
    peerRef.current?.destroy()
    peerRef.current = null
    hostConnRef.current = null
    clientConnsRef.current.clear()
    myPeerIdRef.current = ''
    playersRef.current = []
    clearTimer()
    setLobbyPhase('setup')
    setPlayers([])
    setChatMessages([])
    setMyPeerId(null)
    setPeerError(null)
    setIsHost(false)
    isHostRef.current = false
    updateChain([])
    updateLives({})
    setCurrentPlayer(null)
    setTurnDeadline(null)
    setFeedback(null)
    setWinner(null)
    setShowScoreEntry(false)
  }

  function cleanUpGame() {
    clearTimer()
    setLobbyPhase('game')  // keep in game phase for game-over display
    setCurrentPlayer(null)
    setTurnDeadline(null)
  }

  function handleNameContinue() {
    const n = name.trim()
    if (!n) return
    localStorage.setItem(STORAGE_KEY, n)
    myNameRef.current = n
    isHostRef.current = true
    setIsHost(true)
    const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peer: any = isLocalDev ? createLocalPeer() : new Peer({ config: { iceServers: ICE_SERVERS } })
    peerRef.current = peer
    peer.on('open', (id: string) => {
      myPeerIdRef.current = id
      setMyPeerId(id)
      const hostPlayer: PlayerInfo = { peerId: id, name: n }
      upsertPlayer(hostPlayer)
    })
    peer.on('connection', (conn: AnyDataConnection) => {
      if (!isHostRef.current || clientConnsRef.current.size >= MAX_PLAYERS - 1) {
        conn.close()
        return
      }
      wireClientConn(conn)
      if (!inGameRef.current) setLobbyPhase('room')
    })
    peer.on('error', (err: Error) => setPeerError(err.message))
    setLobbyPhase('lobby')
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const id = joinId.trim()
    if (!id || !peerRef.current) return
    setPeerError(null)
    isHostRef.current = false
    setIsHost(false)
    playersRef.current = []
    setPlayers([])
    wireHostConn(peerRef.current.connect(id))
    setLobbyPhase('room')
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    setChatInput('')
    if (isHost) {
      broadcast({ type: 'chat', name: myNameRef.current, text } satisfies ToClientMsg)
      addChat({ name: myNameRef.current, text, self: true })
    } else if (hostConnRef.current) {
      hostConnRef.current.send({ type: 'chat', name: myNameRef.current, text } satisfies ToHostMsg)
      addChat({ name: myNameRef.current, text, self: true })
    }
  }

  function hostStartGame() {
    const order = [myPeerIdRef.current, ...playersRef.current.map((p) => p.peerId)]
    hostGameRef.current = { playerOrder: order, currentIdx: 0, usedCardIds: new Set(), lastCard: null }
    const startCard = pickStartingCard(cardsRef.current)
    hostGameRef.current.lastCard = { id: startCard.id, name: startCard.name }
    hostGameRef.current.usedCardIds.add(startCard.id)
    const initialLives: Record<string, number> = {}
    order.forEach((p) => { initialLives[p] = MAX_LIVES })
    updateChain([{ cardId: startCard.id, cardName: startCard.name, playerPeerId: '', playerName: 'Start' }])
    updateLives(initialLives)
    setWinner(null)
    setFeedback(null)
    inGameRef.current = true
    setLobbyPhase('game')
    broadcast({ type: 'game-start', firstCard: { id: startCard.id, name: startCard.name }, playerOrder: order, lives: initialLives })
    setTimeout(() => hostStartTurn(order[0]), 1000)
  }

  function submitCard(cardName: string) {
    const card = cardsRef.current.find((c) => c.name === cardName)
    if (!card) return
    setSearchQuery('')
    setSearchResults([])
    setSearchOpen(false)
    if (isHost) {
      hostHandleSubmit(myPeerIdRef.current, card.id, card.name)
    } else if (hostConnRef.current) {
      hostConnRef.current.send({ type: 'submit-card', cardId: card.id, cardName: card.name } satisfies ToHostMsg)
    }
  }

  function handleSearch(value: string) {
    setSearchQuery(value)
    if (value.length >= 2) {
      setSearchResults(cardNames.filter((n) => n.toLowerCase().includes(value.toLowerCase())).slice(0, 8))
      setSearchOpen(true)
    } else {
      setSearchResults([])
      setSearchOpen(false)
    }
  }

  function handleScoreSubmit(entryName: string) {
    addScore('chainLink', entryName, finalScore)
    setShowScoreEntry(false)
  }

  // ── Countdown ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!turnDeadline) return
    const update = () => setTurnDisplaySeconds(Math.max(0, Math.ceil((turnDeadline - ts()) / 1000)))
    update()
    const id = setInterval(update, 500)
    return () => clearInterval(id)
  }, [turnDeadline])

  useEffect(() => { return () => { clearTimer(); peerRef.current?.destroy() } }, [])

  // ── Derived ─────────────────────────────────────────────────────────────

  const isMyTurn = currentPlayer === myPeerId && lobbyPhase === 'game'
  const canStart = isHost && players.length >= 2

  // ═══════════════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── setup ───────────────────────────────────────────────────────────────
  if (lobbyPhase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chain Link</h2>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <p className="pvp-lobby__hint">
          Multiplayer chain-building game. Players take turns naming a Yu-Gi-Oh! card that shares a property — attribute, race, archetype, or type — with the previous card. Break the chain and lose a life. Last player standing wins!
        </p>
        <button className="hol-btn" onClick={() => setLobbyPhase('name-entry')} style={{ marginTop: '1rem' }}>
          Play Multiplayer
        </button>
      </div>
    )
  }

  // ── name-entry ──────────────────────────────────────────────────────────
  if (lobbyPhase === 'name-entry') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chain Link — Enter Name</h2>
        <form className="pvp-lobby__form" onSubmit={(e) => { e.preventDefault(); handleNameContinue() }}>
          <label className="pvp-lobby__label" htmlFor="cl-name">Your name</label>
          <input id="cl-name" className="pvp-lobby__input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter your name…" maxLength={24} autoFocus />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>Continue</button>
        </form>
        <button className="pvp-lobby__copy-btn" onClick={() => setLobbyPhase('setup')}>← Back</button>
      </div>
    )
  }

  // ── lobby ───────────────────────────────────────────────────────────────
  if (lobbyPhase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chain Link</h2>
        <p className="pvp-lobby__you">You: <strong>{name}</strong></p>
        {!myPeerId && <p className="pvp-lobby__hint">Connecting to network…</p>}
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        {myPeerId && (
          <>
            <section className="pvp-lobby__section">
              <p className="pvp-lobby__label">Your game code — share with friends:</p>
              <div className="pvp-lobby__id-row">
                <code className="pvp-lobby__id">{myPeerId}</code>
                <button className="pvp-lobby__copy-btn" onClick={() => { navigator.clipboard.writeText(myPeerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </section>
            <section className="pvp-lobby__section">
              <form onSubmit={handleJoin}>
                <p className="pvp-lobby__label">Join a game:</p>
                <div className="pvp-lobby__id-row">
                  <input className="pvp-lobby__input pvp-lobby__input--wide" type="text" value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Paste host's code…" />
                  <button className="hol-btn" type="submit" disabled={!joinId.trim()}>Join</button>
                </div>
              </form>
            </section>
          </>
        )}
        <button className="pvp-lobby__copy-btn" onClick={() => { resetToSetup(); setLobbyPhase('setup') }}>← Back</button>
      </div>
    )
  }

  // ── room ────────────────────────────────────────────────────────────────
  if (lobbyPhase === 'room') {
    return (
      <div className="pvp-room" style={{ flexDirection: 'column', maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Chain Link — Lobby</h2>
          <button className="pvp-lobby__copy-btn" onClick={resetToSetup}>Leave</button>
        </div>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <p className="pvp-lobby__hint">
          Code: <code style={{ userSelect: 'all' }}>{myPeerId}</code>
          {' '}<button className="pvp-lobby__copy-btn" onClick={() => { if (myPeerId) navigator.clipboard.writeText(myPeerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }}>{copied ? 'Copied!' : 'Copy'}</button>
        </p>
        <ul className="pvp-lobby__player-list">
          {players.map((p) => (
            <li key={p.peerId} className="pvp-lobby__player-row">
              <span className="pvp-lobby__dot pvp-lobby__dot--online" />
              <span className="pvp-lobby__player-name">{p.name}</span>
              {p.peerId === myPeerId && <span className="pvp-lobby__tag" style={{ color: 'var(--success)', borderColor: 'var(--success)' }}>YOU</span>}
            </li>
          ))}
          {players.length === 0 && <li className="pvp-lobby__player-row pvp-lobby__player-row--empty">No players</li>}
        </ul>
        {isHost && (
          <>
            <button className="hol-btn" disabled={!canStart} onClick={hostStartGame} style={{ width: '100%' }}>
              Start Game
            </button>
            {!canStart && (
              <p className="pvp-lobby__hint" style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Need at least 2 players to start
                {players.length > 0 && ` — ${players.length} player${players.length !== 1 ? 's' : ''} so far`}
              </p>
            )}
          </>
        )}
        {!isHost && <p className="pvp-lobby__hint">Waiting for host to start…</p>}

        <div className="pvp-chat" style={{ marginTop: '1rem', minHeight: 180 }}>
          <div className="pvp-chat__messages">
            {chatMessages.map((m) => (
              <div key={m.id} className={`pvp-chat__msg${m.name === '' ? ' pvp-chat__msg--system' : m.self ? ' pvp-chat__msg--self' : ''}`}>
                {m.name && <span className="pvp-chat__msg-name">{m.name}</span>}
                <span className="pvp-chat__msg-text">{m.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className="pvp-chat__input-row" onSubmit={handleSendChat}>
            <input className="pvp-chat__input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Chat…" />
            <button className="hol-btn" type="submit" style={{ padding: '0.375rem 0.875rem', fontSize: '0.875rem' }}>Send</button>
          </form>
        </div>
      </div>
    )
  }

  // ── Game over ───────────────────────────────────────────────────────────
  if (winner && lobbyPhase === 'game') {
    return (
      <div className="pvp-room" style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', padding: '2rem' }}>
        <h2 style={{ fontSize: '2rem', margin: 0 }}>Game Over</h2>
        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)', margin: 0 }}>{winner} wins!</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', maxHeight: '300px', overflowY: 'auto', width: '100%', maxWidth: '480px' }}>
          {chain.map((entry, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', width: '100%' }}>
              <img style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} src={`https://images.ygoprodeck.com/images/cards_cropped/${entry.cardId}.jpg`} alt={entry.cardName} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{entry.cardName}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{entry.playerName || 'Start'}</span>
              </div>
            </div>
          ))}
        </div>
        {showScoreEntry ? (
          <ScoreEntry score={finalScore} onSubmit={handleScoreSubmit} onSkip={() => setShowScoreEntry(false)} />
        ) : (
          <button className="hol-btn" onClick={resetToSetup}>Leave</button>
        )}
      </div>
    )
  }

  // ── Game ────────────────────────────────────────────────────────────────
  return (
    <div className="pvp-room">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.625rem', alignItems: 'center', justifyContent: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Chain Link</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
            {players.map((p) => (
              <div key={p.peerId} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.25rem 0.625rem', background: 'var(--surface)', border: `1px solid ${currentPlayer === p.peerId ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '999px', fontSize: '0.8rem', opacity: (lives[p.peerId] ?? 0) <= 0 ? 0.4 : 1 }}>
                <span style={{ fontWeight: 600, fontSize: '0.75rem' }}>{p.name}</span>
                <span style={{ display: 'flex', gap: '0.1rem' }}>
                  {Array.from({ length: MAX_LIVES }).map((_, i) => (
                    <span key={i} style={{ color: i < (lives[p.peerId] ?? 0) ? '#ef4444' : 'var(--border)', opacity: i < (lives[p.peerId] ?? 0) ? 1 : 0.5, fontSize: '0.85rem' }}>♥</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {turnDeadline && (
          <div style={{ height: '4px', background: 'var(--border)', flexShrink: 0, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: turnDisplaySeconds <= 10 ? 'var(--error)' : 'var(--accent)', width: `${(turnDisplaySeconds / TURN_SECONDS) * 100}%`, transition: 'width 0.5s linear' }} />
          </div>
        )}

        {feedback && (
          <div style={{ textAlign: 'center', padding: '0.625rem', fontSize: '0.95rem', fontWeight: 600, background: feedback.correct ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: feedback.correct ? '#22c55e' : '#ef4444' }}>
            {feedback.correct ? `✓ ${feedback.cardName} — Chain link! ${lastSharedProps.length > 0 ? `(${lastSharedProps.join(', ')})` : ''}` : '✗ Wrong card or no shared property'}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
          {chain.map((entry, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', width: '100%', maxWidth: '480px' }}>
              <img style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} src={`https://images.ygoprodeck.com/images/cards_cropped/${entry.cardId}.jpg`} alt={entry.cardName} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{entry.cardName}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{entry.playerName || 'Start'}</span>
              </div>
            </div>
          ))}
        </div>

        {isMyTurn && (
          <>
            <div style={{ textAlign: 'center', padding: '0.5rem 1rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Name a card sharing Attribute, Race, Archetype, or Type with:</span>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>{chain[chain.length - 1]?.cardName}</span>
            </div>
            <div style={{ padding: '0.5rem 1rem', flexShrink: 0 }}>
              <div className="card-search" style={{ maxWidth: '440px', margin: '0 auto' }}>
                <input ref={searchRef} className="card-search-input" placeholder="Search a card…" value={searchQuery} onChange={(e) => handleSearch(e.target.value)} onFocus={() => { if (searchResults.length > 0) { setSearchRect(searchRef.current?.getBoundingClientRect() ?? null); setSearchOpen(true) } }} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onKeyDown={(e) => { if (e.key === 'Enter' && searchResults.length > 0) submitCard(searchResults[0]) }} autoComplete="off" />
                {searchOpen && searchResults.length > 0 && searchRect && createPortal(
                  <ul className="search-dropdown" style={{
                    position: 'fixed',
                    left: searchRect.left,
                    width: searchRect.width,
                    ...(searchRect.bottom + searchResults.length * 42 > window.innerHeight
                      ? { bottom: window.innerHeight - searchRect.top + 2 }
                      : { top: searchRect.bottom + 2 }),
                  }}>
                    {searchResults.map((n) => <li key={n} className="search-dropdown-item" onMouseDown={() => submitCard(n)}>{n}</li>)}
                  </ul>,
                  document.body
                )}
              </div>
            </div>
          </>
        )}

        {!isMyTurn && <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.95rem' }}>{currentPlayer ? `Waiting for ${players.find((p) => p.peerId === currentPlayer)?.name ?? '...'}…` : 'Waiting for next turn…'}</div>}
      </div>

      <div className="pvp-chat" style={{ flex: '0 0 280px', borderLeft: '1px solid var(--border)', borderRadius: 0 }}>
        <div className="pvp-chat__messages">
          {chatMessages.map((m) => (
            <div key={m.id} className={`pvp-chat__msg${m.name === '' ? ' pvp-chat__msg--system' : m.self ? ' pvp-chat__msg--self' : ''}`}>
              {m.name && <span className="pvp-chat__msg-name">{m.name}</span>}
              <span className="pvp-chat__msg-text">{m.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form className="pvp-chat__input-row" onSubmit={handleSendChat}>
          <input className="pvp-chat__input" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Chat…" />
          <button className="hol-btn" type="submit" style={{ padding: '0.375rem 0.875rem', fontSize: '0.875rem' }}>Send</button>
        </form>
      </div>
    </div>
  )
}
