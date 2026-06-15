import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import Fuse from 'fuse.js'
import { useAppSelector } from '../../hooks'
import { generateCategories, cardMatchesCategory } from './categoryUtils'
import type { Category, GuessRecord } from './categoryUtils'
import {
  ICE_SERVERS,
  MAX_PLAYERS,
  type PlayerInfo,
  type ChatMessage,
  type ToHostMsg,
  type ToClientMsg,
} from './network'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_LIVES = 3
const LOCAL_PEER_ID = '__local__'

// ── Game state ────────────────────────────────────────────────────────────────

interface GameState {
  phase: 'category-selection' | 'guessing' | 'game-over'
  lives: Record<string, number>
  currentLeader: string | null
  categories: Category[]
  selectedCategory: Category | null
  guesserOrder: string[]
  currentGuesserIdx: number
  correctGuesses: GuessRecord[]
  usedCardIds: number[]
  winner: string | null
  wrongFlash: string | null
}

const INIT_GAME_STATE: GameState = {
  phase: 'category-selection',
  lives: {},
  currentLeader: null,
  categories: [],
  selectedCategory: null,
  guesserOrder: [],
  currentGuesserIdx: 0,
  correctGuesses: [],
  usedCardIds: [],
  winner: null,
  wrongFlash: null,
}

type LobbyPhase = 'setup' | 'mode-select' | 'lobby' | 'room' | 'game'

let chatIdSeq = 0

// ── Component ─────────────────────────────────────────────────────────────────

export default function CardCategories() {
  const { cards } = useAppSelector(s => s.cards)

  // Lobby / connection state
  const [name, setName] = useState('')
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>('setup')
  const [isSolo, setIsSolo] = useState(false)
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [hostLeft, setHostLeft] = useState(false)
  const [isHost, setIsHost] = useState(false)

  // Game state
  const [gameState, setGameState] = useState<GameState>(INIT_GAME_STATE)
  const [soloScore, setSoloScore] = useState(0)
  const [soloRoundWon, setSoloRoundWon] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDropdownRect = useRef<DOMRect | null>(null)

  // Refs for stable access inside event handlers
  const peerRef = useRef<Peer | null>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const isSoloRef = useRef(false)
  const clientConnsRef = useRef<Map<string, DataConnection>>(new Map())
  const hostConnRef = useRef<DataConnection | null>(null)
  const playersRef = useRef<PlayerInfo[]>([])
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const cardsRef = useRef(cards)
  const gameStateRef = useRef<GameState>(INIT_GAME_STATE)

  cardsRef.current = cards

  // Scroll chat to bottom
  const scrollChat = () => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }

  // Host-only authoritative game data
  const hostGameRef = useRef({
    activePlayers: [] as string[],
    leaderQueue: [] as string[],
    guesserOrder: [] as string[],
    guesserIdx: 0,
    usedCardIds: new Set<number>(),
  })

  // ── Fuzzy search ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(searchQuery), 250)
    return () => clearTimeout(id)
  }, [searchQuery])

  // Monsters only — spells/traps are never valid answers for any category
  const fuse = useMemo(() => new Fuse(cards.filter(c => c.atk !== null), {
    keys: ['name'], threshold: 0.35, minMatchCharLength: 2, distance: 200,
  }), [cards])

  const searchResults = useMemo(() => {
    if (debouncedQuery.length < 2) return []
    const cat = gameState.selectedCategory
    if (cat?.archetype) {
      const norm = (s: string) => s.toLowerCase().replace(/[\s\-']/g, '')
      if (norm(debouncedQuery).includes(norm(cat.archetype))) return []
    }
    const used = new Set(gameStateRef.current.usedCardIds)
    return fuse.search(debouncedQuery, { limit: 10 }).map(r => r.item).filter(c => !used.has(c.id))
  }, [fuse, debouncedQuery, gameState.selectedCategory])

  // ── Player helpers ────────────────────────────────────────────────────────────

  function playerName(peerId: string): string {
    if (peerId === myPeerIdRef.current) return myNameRef.current
    return playersRef.current.find(p => p.peerId === peerId)?.name ?? peerId.slice(0, 6)
  }

  function addPlayer(info: PlayerInfo) {
    if (playersRef.current.some(p => p.peerId === info.peerId)) return
    playersRef.current = [...playersRef.current, info]
    setPlayers([...playersRef.current])
  }

  function removePlayer(peerId: string) {
    playersRef.current = playersRef.current.filter(p => p.peerId !== peerId)
    setPlayers([...playersRef.current])
  }

  function addChat(msg: Omit<ChatMessage, 'id'>) {
    setChatMessages(prev => { const next = [...prev, { ...msg, id: chatIdSeq++ }]; scrollChat(); return next })
  }

  // ── Network helpers (no-ops in solo mode) ─────────────────────────────────────

  function broadcast(msg: ToClientMsg, skipPeerId?: string) {
    if (isSoloRef.current) return
    clientConnsRef.current.forEach((conn, id) => { if (id !== skipPeerId) conn.send(msg) })
  }

  // Send to all clients + apply to host's own state
  function broadcastGame(msg: ToClientMsg) {
    broadcast(msg)
    applyGameMsg(msg)
  }

  // ── Game state reducer ────────────────────────────────────────────────────────

  function applyGameMsg(msg: ToClientMsg) {
    let next: GameState = gameStateRef.current

    if (msg.type === 'game-start') {
      setLobbyPhase('game')
      return
    }

    if (msg.type === 'round-start') {
      next = {
        ...next,
        phase: 'category-selection',
        currentLeader: msg.leader,
        categories: msg.categories,
        selectedCategory: null,
        correctGuesses: [],
        usedCardIds: [],
        guesserOrder: [],
        currentGuesserIdx: 0,
        lives: msg.lives,
        wrongFlash: null,
        winner: null,
      }
    } else if (msg.type === 'guessing-start') {
      next = { ...next, phase: 'guessing', selectedCategory: msg.category, guesserOrder: msg.guesserOrder, currentGuesserIdx: 0 }
      setSearchQuery('')
      setSearchOpen(false)
    } else if (msg.type === 'guess-correct') {
      const newGuess: GuessRecord = { peerId: msg.guesser, cardId: msg.cardId, cardName: msg.cardName }
      next = {
        ...next,
        correctGuesses: [...next.correctGuesses, newGuess],
        usedCardIds: [...next.usedCardIds, msg.cardId],
        currentGuesserIdx: msg.nextGuesserIdx,
        wrongFlash: null,
      }
      setSearchQuery('')
      setSearchOpen(false)
    } else if (msg.type === 'guess-wrong') {
      next = { ...next, lives: msg.lives, wrongFlash: msg.guesser }
      setSearchQuery('')
      setSearchOpen(false)
      setTimeout(() => {
        setGameState(gs => ({ ...gs, wrongFlash: null }))
        gameStateRef.current = { ...gameStateRef.current, wrongFlash: null }
      }, 1800)
    } else if (msg.type === 'game-over') {
      next = { ...next, phase: 'game-over', winner: msg.winner }
    } else {
      return
    }

    gameStateRef.current = next
    setGameState(next)
  }

  // ── Host game logic (shared by solo + multiplayer) ────────────────────────────

  function hostStartGame() {
    const allIds = [myPeerIdRef.current, ...playersRef.current.map(p => p.peerId)]
    const lives = Object.fromEntries(allIds.map(id => [id, MAX_LIVES]))
    hostGameRef.current = {
      activePlayers: [...allIds],
      leaderQueue: [...allIds].sort(() => Math.random() - 0.5),
      guesserOrder: [],
      guesserIdx: 0,
      usedCardIds: new Set(),
    }
    gameStateRef.current = { ...INIT_GAME_STATE, lives }
    setGameState(gameStateRef.current)
    broadcast({ type: 'game-start' })
    setLobbyPhase('game')
    hostStartRound()
  }

  function hostStartRound() {
    const hg = hostGameRef.current
    const active = hg.activePlayers

    // Multiplayer: last player standing wins
    if (!isSoloRef.current && active.length <= 1) {
      broadcastGame({ type: 'game-over', winner: active[0] ?? '' })
      return
    }

    if (hg.leaderQueue.length === 0) {
      hg.leaderQueue = [...active].sort(() => Math.random() - 0.5)
    }

    let leader: string | undefined
    while (hg.leaderQueue.length > 0) {
      const candidate = hg.leaderQueue.shift()!
      if (active.includes(candidate)) { leader = candidate; break }
    }
    if (!leader) leader = active[Math.floor(Math.random() * active.length)]

    hg.usedCardIds = new Set()
    hg.guesserOrder = []
    hg.guesserIdx = 0

    const cats = generateCategories(cardsRef.current)
    const lives = { ...gameStateRef.current.lives }
    broadcastGame({ type: 'round-start', leader, categories: cats, lives })
  }

  function hostPickCategory(idx: number) {
    const cat = gameStateRef.current.categories[idx]
    if (!cat) return

    const active = hostGameRef.current.activePlayers
    const startIdx = Math.floor(Math.random() * active.length)
    const order = [...active.slice(startIdx), ...active.slice(0, startIdx)]
    hostGameRef.current.guesserOrder = order
    hostGameRef.current.guesserIdx = 0
    broadcastGame({ type: 'guessing-start', category: cat, guesserOrder: order })
  }

  function hostProcessGuess(guesserPeerId: string, cardId: number) {
    const gs = gameStateRef.current
    const hg = hostGameRef.current
    if (gs.phase !== 'guessing' || !gs.selectedCategory) return
    if (!isSoloRef.current && hg.guesserOrder[hg.guesserIdx] !== guesserPeerId) return
    if (hg.usedCardIds.has(cardId)) { hostHandleWrong(guesserPeerId); return }

    const card = cardsRef.current.find(c => c.id === cardId)
    if (!card || !cardMatchesCategory(card, gs.selectedCategory)) {
      hostHandleWrong(guesserPeerId)
      return
    }

    hg.usedCardIds.add(cardId)
    const nextIdx = isSoloRef.current ? 0 : (hg.guesserIdx + 1) % hg.guesserOrder.length
    hg.guesserIdx = nextIdx
    broadcastGame({ type: 'guess-correct', guesser: guesserPeerId, cardId, cardName: card.name, nextGuesserIdx: nextIdx })

    // Solo: 3 correct guesses in a row = round won, award a point
    if (isSoloRef.current && gameStateRef.current.correctGuesses.length >= 3) {
      setSoloRoundWon(true)
      setTimeout(() => {
        setSoloRoundWon(false)
        setSoloScore(s => s + 1)
        soloStartNewRound()
      }, 1500)
    }
  }

  function hostHandleWrong(guesserPeerId: string) {
    const hg = hostGameRef.current
    const gs = gameStateRef.current
    const curLives = (gs.lives[guesserPeerId] ?? 1) - 1
    const newLives = { ...gs.lives, [guesserPeerId]: curLives }

    let eliminated: string | null = null
    if (curLives <= 0) {
      eliminated = guesserPeerId
      hg.activePlayers = hg.activePlayers.filter(id => id !== guesserPeerId)
      hg.leaderQueue = hg.leaderQueue.filter(id => id !== guesserPeerId)
    }

    broadcastGame({ type: 'guess-wrong', guesser: guesserPeerId, lives: newLives, eliminated })

    const active = hg.activePlayers
    const isGameOver = isSoloRef.current ? curLives <= 0 : active.length <= 1
    const delay = isGameOver ? 1800 : 2200
    setTimeout(() => {
      if (isGameOver) {
        broadcastGame({ type: 'game-over', winner: isSoloRef.current ? '' : (active[0] ?? '') })
      } else if (isSoloRef.current) {
        soloStartNewRound()
      } else {
        hostStartRound()
      }
    }, delay)
  }

  // ── Solo helpers ─────────────────────────────────────────────────────────────

  // Picks a random category and jumps straight to guessing — no category-selection screen in solo
  function soloStartNewRound() {
    hostGameRef.current.usedCardIds = new Set()
    const cats = generateCategories(cardsRef.current)
    const picked = cats[Math.floor(Math.random() * cats.length)]
    const next: GameState = {
      ...gameStateRef.current,
      phase: 'guessing',
      selectedCategory: picked,
      correctGuesses: [],
      usedCardIds: [],
      guesserOrder: [LOCAL_PEER_ID],
      currentGuesserIdx: 0,
      wrongFlash: null,
      winner: null,
    }
    gameStateRef.current = next
    setGameState(next)
    setSearchQuery('')
    setSearchOpen(false)
  }

  function startSolo(playerName: string) {
    myNameRef.current = playerName
    myPeerIdRef.current = LOCAL_PEER_ID
    isHostRef.current = true
    isSoloRef.current = true
    setMyPeerId(LOCAL_PEER_ID)
    setIsHost(true)
    setIsSolo(true)
    setSoloScore(0)
    setSoloRoundWon(false)
    playersRef.current = []
    setPlayers([])

    hostGameRef.current = {
      activePlayers: [LOCAL_PEER_ID],
      leaderQueue: [LOCAL_PEER_ID],
      guesserOrder: [LOCAL_PEER_ID],
      guesserIdx: 0,
      usedCardIds: new Set(),
    }
    gameStateRef.current = { ...INIT_GAME_STATE, lives: { [LOCAL_PEER_ID]: MAX_LIVES }, guesserOrder: [LOCAL_PEER_ID] }
    setLobbyPhase('game')
    soloStartNewRound()
  }

  // ── Network wiring (multiplayer only) ─────────────────────────────────────────

  const wireClientConn = useCallback((conn: DataConnection) => {
    clientConnsRef.current.set(conn.peer, conn)

    conn.on('data', raw => {
      const msg = raw as ToHostMsg

      if (msg.type === 'hello') {
        const hostInfo: PlayerInfo = { peerId: myPeerIdRef.current, name: myNameRef.current }
        conn.send({ type: 'player-list', players: [hostInfo, ...playersRef.current] } satisfies ToClientMsg)
        const player: PlayerInfo = { peerId: msg.peerId, name: msg.name }
        addPlayer(player)
        broadcast({ type: 'player-joined', player } satisfies ToClientMsg, conn.peer)
        addChat({ name: '', text: `${msg.name} joined the room.`, self: false })
      }
      if (msg.type === 'chat') {
        broadcast({ type: 'chat', name: msg.name, text: msg.text } satisfies ToClientMsg, conn.peer)
        addChat({ name: msg.name, text: msg.text, self: false })
      }
      if (msg.type === 'pick-category') {
        const gs = gameStateRef.current
        if (gs.phase === 'category-selection' && gs.currentLeader === conn.peer) hostPickCategory(msg.idx)
      }
      if (msg.type === 'submit-guess') {
        const gs = gameStateRef.current
        const hg = hostGameRef.current
        if (gs.phase === 'guessing' && hg.guesserOrder[hg.guesserIdx] === conn.peer) hostProcessGuess(conn.peer, msg.cardId)
      }
    })

    conn.on('close', () => {
      const leaving = playersRef.current.find(p => p.peerId === conn.peer)
      clientConnsRef.current.delete(conn.peer)
      removePlayer(conn.peer)
      if (leaving) {
        broadcast({ type: 'player-left', peerId: conn.peer, name: leaving.name } satisfies ToClientMsg)
        addChat({ name: '', text: `${leaving.name} left the room.`, self: false })
        if (gameStateRef.current.phase !== 'game-over') {
          const hg = hostGameRef.current
          hg.activePlayers = hg.activePlayers.filter(id => id !== conn.peer)
          hg.leaderQueue = hg.leaderQueue.filter(id => id !== conn.peer)
          if (hg.activePlayers.length <= 1) broadcastGame({ type: 'game-over', winner: hg.activePlayers[0] ?? '' })
          else if (gameStateRef.current.phase === 'guessing') {
            hg.guesserOrder = hg.guesserOrder.filter(id => id !== conn.peer)
            if (hg.guesserIdx >= hg.guesserOrder.length) hg.guesserIdx = 0
          }
        }
      }
    })

    conn.on('error', err => setPeerError(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wireHostConn = useCallback((conn: DataConnection) => {
    hostConnRef.current = conn
    conn.on('open', () => {
      conn.send({ type: 'hello', name: myNameRef.current, peerId: myPeerIdRef.current } satisfies ToHostMsg)
    })
    conn.on('data', raw => {
      const msg = raw as ToClientMsg
      if (msg.type === 'player-list') { playersRef.current = msg.players.filter(p => p.peerId !== myPeerIdRef.current); setPlayers([...playersRef.current]) }
      if (msg.type === 'player-joined') { addPlayer(msg.player); addChat({ name: '', text: `${msg.player.name} joined.`, self: false }) }
      if (msg.type === 'player-left') { removePlayer(msg.peerId); addChat({ name: '', text: `${msg.name} left.`, self: false }) }
      if (msg.type === 'chat') addChat({ name: msg.name, text: msg.text, self: false })
      const gameMsgTypes: ToClientMsg['type'][] = ['game-start', 'round-start', 'guessing-start', 'guess-correct', 'guess-wrong', 'game-over']
      if (gameMsgTypes.includes(msg.type)) applyGameMsg(msg)
    })
    conn.on('close', () => setHostLeft(true))
    conn.on('error', err => setPeerError(err.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── UI event handlers ─────────────────────────────────────────────────────────

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) setLobbyPhase('mode-select')
  }

  const handleHostMultiplayer = () => {
    myNameRef.current = name.trim()
    isHostRef.current = true
    isSoloRef.current = false
    setIsHost(true)
    setIsSolo(false)
    const peer = new Peer({ config: { iceServers: ICE_SERVERS } })
    peerRef.current = peer
    peer.on('open', id => { myPeerIdRef.current = id; setMyPeerId(id); setLobbyPhase('lobby') })
    peer.on('connection', conn => {
      if (!isHostRef.current || playersRef.current.length >= MAX_PLAYERS - 1) { conn.close(); return }
      wireClientConn(conn)
      setLobbyPhase('room')
    })
    peer.on('error', err => setPeerError(err.message))
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id || !peerRef.current) return
    isHostRef.current = false
    setIsHost(false)
    wireHostConn(peerRef.current.connect(id))
    setLobbyPhase('room')
  }

  const handleCopy = () => {
    if (!myPeerId) return
    navigator.clipboard.writeText(myPeerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const payload = { name: myNameRef.current, text }
    if (isHostRef.current) broadcast({ type: 'chat', ...payload })
    else hostConnRef.current?.send({ type: 'chat', ...payload } satisfies ToHostMsg)
    addChat({ ...payload, self: true })
    setChatInput('')
  }

  const handlePickCategory = (idx: number) => {
    if (isHostRef.current || isSoloRef.current) hostPickCategory(idx)
    else hostConnRef.current?.send({ type: 'pick-category', idx } satisfies ToHostMsg)
  }

  const handleSubmitGuess = (cardId: number) => {
    if (isHostRef.current || isSoloRef.current) hostProcessGuess(myPeerIdRef.current, cardId)
    else hostConnRef.current?.send({ type: 'submit-guess', cardId } satisfies ToHostMsg)
    setSearchQuery('')
    setSearchOpen(false)
  }

  function resetToLobby() {
    peerRef.current?.destroy()
    peerRef.current = null
    setLobbyPhase('setup')
    setGameState(INIT_GAME_STATE)
    gameStateRef.current = INIT_GAME_STATE
    setPlayers([])
    playersRef.current = []
    setChatMessages([])
    setMyPeerId(null)
    setIsSolo(false)
    isSoloRef.current = false
    setIsHost(false)
    isHostRef.current = false
    setSoloScore(0)
    setSoloRoundWon(false)
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  const allPlayers: PlayerInfo[] = [{ peerId: myPeerId ?? '', name }, ...players]
  const gs = gameState
  const iAmLeader = isSolo || gs.currentLeader === myPeerId
  const currentGuesserPeerId = gs.guesserOrder[gs.currentGuesserIdx]
  const iAmGuesser = isSolo || currentGuesserPeerId === myPeerId

  function renderLives(peerId: string) {
    const l = gs.lives[peerId] ?? MAX_LIVES
    return (
      <span className={`cc-hearts${l <= 0 ? ' cc-hearts--dead' : ''}`}>
        {'♥'.repeat(Math.max(0, l))}{'♡'.repeat(Math.max(0, MAX_LIVES - l))}
      </span>
    )
  }

  // ── Phases ────────────────────────────────────────────────────────────────────

  if (lobbyPhase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Card Categories</h2>
        <form className="pvp-lobby__form" onSubmit={handleNameSubmit}>
          <label className="pvp-lobby__label" htmlFor="cc-name">Your name</label>
          <input id="cc-name" className="pvp-lobby__input" type="text" value={name}
            onChange={e => setName(e.target.value)} placeholder="Enter your name…" maxLength={24} autoFocus />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>Continue</button>
        </form>
      </div>
    )
  }

  if (lobbyPhase === 'mode-select') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Card Categories</h2>
        <p className="pvp-lobby__you">Welcome, <strong>{name}</strong>!</p>
        <div className="cc-mode-select">
          <button className="cc-mode-btn" onClick={() => startSolo(name)}>
            <span className="cc-mode-btn__icon">🃏</span>
            <span className="cc-mode-btn__label">Solo</span>
            <span className="cc-mode-btn__desc">Play alone — pick categories and guess matching cards. 3 lives.</span>
          </button>
          <button className="cc-mode-btn" onClick={handleHostMultiplayer}>
            <span className="cc-mode-btn__icon">👥</span>
            <span className="cc-mode-btn__label">Multiplayer</span>
            <span className="cc-mode-btn__desc">Host a room and invite friends. Last player standing wins.</span>
          </button>
        </div>
        <button className="pvp-lobby__copy-btn" onClick={() => setLobbyPhase('setup')}>← Back</button>
      </div>
    )
  }

  if (lobbyPhase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Card Categories</h2>
        <p className="pvp-lobby__you">You: <strong>{name}</strong></p>
        {!myPeerId && <p className="pvp-lobby__hint">Connecting to network…</p>}
        {myPeerId && (
          <>
            <section className="pvp-lobby__section">
              <p className="pvp-lobby__label">Your game code — share with up to {MAX_PLAYERS - 1} friends:</p>
              <div className="pvp-lobby__id-row">
                <code className="pvp-lobby__id">{myPeerId}</code>
                <button className="pvp-lobby__copy-btn" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
              </div>
            </section>
            <div className="pvp-lobby__divider">or</div>
            <section className="pvp-lobby__section">
              <form onSubmit={handleJoin}>
                <p className="pvp-lobby__label">Join a friend's game:</p>
                <div className="pvp-lobby__id-row">
                  <input className="pvp-lobby__input pvp-lobby__input--wide" type="text" value={joinId}
                    onChange={e => setJoinId(e.target.value)} placeholder="Paste their game code…" />
                  <button className="hol-btn" type="submit" disabled={!joinId.trim()}>Join</button>
                </div>
              </form>
            </section>
          </>
        )}
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
      </div>
    )
  }

  if (lobbyPhase === 'room') {
    if (hostLeft) {
      return (
        <div className="pvp-lobby">
          <h2 className="pvp-lobby__title">Host disconnected</h2>
          <p className="pvp-lobby__hint">The host left the room.</p>
          <button className="hol-btn" onClick={() => {
            setHostLeft(false); setLobbyPhase('lobby'); setPlayers([])
            playersRef.current = []; setChatMessages([])
          }}>Back to lobby</button>
        </div>
      )
    }

    const isFull = allPlayers.length >= MAX_PLAYERS
    return (
      <div className="pvp-room">
        <aside className="pvp-room__sidebar">
          <h2 className="pvp-lobby__title">Room — {allPlayers.length}/{MAX_PLAYERS}</h2>
          {isHost && !isFull && myPeerId && (
            <div className="pvp-lobby__id-row">
              <code className="pvp-lobby__id">{myPeerId}</code>
              <button className="pvp-lobby__copy-btn" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
          )}
          <ul className="pvp-lobby__player-list">
            {allPlayers.map(p => (
              <li key={p.peerId} className="pvp-lobby__player-row">
                <span className="pvp-lobby__dot pvp-lobby__dot--online" />
                <span className="pvp-lobby__player-name">
                  {p.name}
                  {p.peerId === myPeerId && <span className="pvp-lobby__tag"> you</span>}
                  {isHost && p.peerId === myPeerId && <span className="pvp-lobby__tag pvp-lobby__tag--host"> host</span>}
                </span>
              </li>
            ))}
            {Array.from({ length: MAX_PLAYERS - allPlayers.length }).map((_, i) => (
              <li key={`empty-${i}`} className="pvp-lobby__player-row pvp-lobby__player-row--empty">
                <span className="pvp-lobby__dot" /><span>Waiting…</span>
              </li>
            ))}
          </ul>
          {isFull
            ? <p className="pvp-lobby__hint pvp-lobby__hint--ready">Room full!</p>
            : <p className="pvp-lobby__hint">Waiting for players…</p>}
          {isHost
            ? <button className="hol-btn cc-start-btn" onClick={hostStartGame}>Start Game</button>
            : <p className="pvp-lobby__hint">Waiting for host to start…</p>}
          {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        </aside>
        <div className="pvp-chat">
          <div className="pvp-chat__messages">
            {chatMessages.map(m =>
              m.name
                ? <div key={m.id} className={`pvp-chat__msg${m.self ? ' pvp-chat__msg--self' : ''}`}>
                    <span className="pvp-chat__msg-name">{m.name}</span>
                    <span className="pvp-chat__msg-text">{m.text}</span>
                  </div>
                : <div key={m.id} className="pvp-chat__msg pvp-chat__msg--system">{m.text}</div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form className="pvp-chat__input-row" onSubmit={handleSendChat}>
            <input className="pvp-chat__input" type="text" value={chatInput}
              onChange={e => setChatInput(e.target.value)} placeholder="Say something…" maxLength={200} />
            <button className="pvp-lobby__copy-btn" type="submit" disabled={!chatInput.trim()}>Send</button>
          </form>
        </div>
      </div>
    )
  }

  // ── Game phase ────────────────────────────────────────────────────────────────

  if (gs.phase === 'game-over') {
    const winnerName = gs.winner ? playerName(gs.winner) : null
    return (
      <div className="cc-gameover">
        <h2 className="cc-gameover__title">Game Over!</h2>
        {winnerName
          ? <p className="cc-gameover__winner">🏆 {winnerName} wins!</p>
          : <p className="cc-gameover__winner">No lives remaining!</p>}
        {isSolo && <p className="cc-gameover__score">Score: <strong>{soloScore}</strong> {soloScore === 1 ? 'point' : 'points'}</p>}
        <div className="cc-gameover__final-lives">
          {allPlayers.map(p => (
            <div key={p.peerId} className="cc-gameover__player">
              <span className="cc-gameover__player-name">{playerName(p.peerId)}</span>
              {renderLives(p.peerId)}
            </div>
          ))}
        </div>
        <button className="hol-btn" onClick={resetToLobby}>Play Again</button>
      </div>
    )
  }

  if (gs.phase === 'category-selection') {
    return (
      <div className="cc-category-phase">
        <div className="cc-lives-bar">
          {allPlayers.map(p => (
            <div key={p.peerId} className="cc-player-life">
              <span className="cc-player-life__name">{playerName(p.peerId)}</span>
              {renderLives(p.peerId)}
            </div>
          ))}
        </div>
        <p className="cc-category-phase__leader-line">
          {iAmLeader
            ? 'Pick a category to guess!'
            : <><strong>{gs.currentLeader ? playerName(gs.currentLeader) : '?'}</strong> is choosing a category…</>}
        </p>
        <div className="cc-category-list">
          {gs.categories.map((cat, i) => (
            <button key={i}
              className={`cc-category-btn${iAmLeader ? ' cc-category-btn--selectable' : ''}`}
              onClick={iAmLeader ? () => handlePickCategory(i) : undefined}
              disabled={!iAmLeader}>
              {cat.label}
            </button>
          ))}
          {gs.categories.length === 0 && <p className="pvp-lobby__hint">Generating categories…</p>}
        </div>
      </div>
    )
  }

  // Guessing phase
  const guessesByPlayer = new Map<string, GuessRecord[]>()
  for (const p of allPlayers) guessesByPlayer.set(p.peerId, gs.correctGuesses.filter(g => g.peerId === p.peerId))

  return (
    <div className="cc-game">
      <div className="cc-game__header">
        <p className="cc-game__category-label">{gs.selectedCategory?.label ?? ''}</p>
        {isSolo
          ? <p className="cc-game__status">
              Score: <strong>{soloScore}</strong> &nbsp;·&nbsp; {gs.correctGuesses.length}/3 guessed
            </p>
          : <p className="cc-game__status">
              {iAmGuesser ? 'Your turn — search for a matching card!' : `Waiting for ${playerName(currentGuesserPeerId ?? '')}…`}
            </p>}
      </div>

      {soloRoundWon && (
        <div className="cc-round-won-flash">
          ✓ Round complete! +1 point
        </div>
      )}

      {!soloRoundWon && gs.wrongFlash && (
        <div className="cc-wrong-flash">
          ✕ {isSolo ? 'Wrong!' : `${playerName(gs.wrongFlash)} guessed wrong`}
          {' — '}{gs.lives[gs.wrongFlash] ?? 0} {(gs.lives[gs.wrongFlash] ?? 0) === 1 ? 'life' : 'lives'} left
        </div>
      )}

      <div className="cc-columns">
        {allPlayers.map(p => {
          const isCurrentGuesser = isSolo || p.peerId === currentGuesserPeerId
          const guesses = guessesByPlayer.get(p.peerId) ?? []
          const isDead = (gs.lives[p.peerId] ?? MAX_LIVES) <= 0
          return (
            <div key={p.peerId} className={`cc-player-col${isCurrentGuesser ? ' cc-player-col--active' : ''}${isDead ? ' cc-player-col--eliminated' : ''}`}>
              <div className="cc-player-col__header">
                <div className="cc-player-col__name">{playerName(p.peerId)}</div>
                {renderLives(p.peerId)}
              </div>
              <div className="cc-player-col__guesses">
                {guesses.map(g => (
                  <div key={g.cardId} className="cc-guess-item">
                    <img src={`https://images.ygoprodeck.com/images/cards_cropped/${g.cardId}.jpg`}
                      alt={g.cardName} className="cc-guess-item__img" />
                    <span className="cc-guess-item__name">{g.cardName}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {iAmGuesser ? (
        <div className="cc-game__search">
          <p className="cc-game__search-hint">Category: <strong>{gs.selectedCategory?.label}</strong></p>
          <div className="card-search">
            <input ref={searchInputRef} className="card-search-input"
              placeholder="Search for a card name…" value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value)
                if (e.target.value.length >= 2) {
                  if (searchInputRef.current) searchDropdownRect.current = searchInputRef.current.getBoundingClientRect()
                  setSearchOpen(true)
                }
              }}
              onFocus={() => { if (searchInputRef.current) searchDropdownRect.current = searchInputRef.current.getBoundingClientRect(); setSearchOpen(true) }}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              autoFocus autoComplete="off" />
            {searchOpen && searchResults.length > 0 && searchDropdownRect.current && (
              <ul className="search-dropdown" style={{
                position: 'fixed',
                top: searchDropdownRect.current.bottom + 2,
                left: searchDropdownRect.current.left,
                width: searchDropdownRect.current.width,
              }}>
                {searchResults.map(card => (
                  <li key={card.id} className="search-dropdown-item" onMouseDown={() => handleSubmitGuess(card.id)}>
                    {card.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="cc-game__waiting">
          Waiting for <strong>{playerName(currentGuesserPeerId ?? '')}</strong> to guess a card…
        </div>
      )}
    </div>
  )
}
