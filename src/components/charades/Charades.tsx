import { useRef, useState, useCallback, useEffect, type ReactElement } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import { useAppSelector } from '../../hooks/hooks'
import { createLocalPeer } from '../../multiplayer/transport'
import type { LocalConnection } from '../../multiplayer/transport'
import {
  ICE_SERVERS,
  MIN_PLAYERS_CZ,
  MAX_PLAYERS_CZ,
  TURNS_PER_TEAM,
  ROUND_DURATION_MS,
  type AnyDataConnection,
  type Team,
  type CharadesPlayer,
  type ChatMessage,
  type TurnCardResult,
  type LoggedCard,
  type CharadesGameState,
  type ToHostMsg,
  type ToClientMsg,
} from './charadesTypes'

const STORAGE_KEY = 'cz-player-name'

const INIT_GAME: CharadesGameState = {
  turnNumber: 0,
  totalTurns: TURNS_PER_TEAM * 2,
  activeTeam: 'red',
  describerId: '',
  phase: 'prep',
  turnDeadline: null,
  scoreRed: 0,
  scoreBlue: 0,
  turnCorrect: 0,
  turnSkipped: 0,
  lastTurnResults: [],
  winner: null,
}

type LobbyPhase = 'setup' | 'name-entry' | 'lobby' | 'room' | 'game'

let chatIdSeq = 0

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function Charades(): ReactElement {
  const { cards } = useAppSelector((s) => s.cards)

  // Lobby state
  const [name, setName] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>('setup')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [players, setPlayers] = useState<CharadesPlayer[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  // Game state
  const [gameState, setGameState] = useState<CharadesGameState>(INIT_GAME)
  const [myCard, setMyCard] = useState<{ id: number; word: string } | null>(null)
  const [cardLog, setCardLog] = useState<LoggedCard[]>([])
  const [, setCountdownTick] = useState(0)

  // Refs for stable access inside event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const clientConnsRef = useRef<Map<string, AnyDataConnection>>(new Map())
  const hostConnRef = useRef<AnyDataConnection | null>(null)
  const playersRef = useRef<CharadesPlayer[]>([])
  const gameStateRef = useRef<CharadesGameState>(INIT_GAME)
  const inGameRef = useRef(false)
  const cardsRef = useRef(cards)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const turnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Host-only authoritative scratch data
  const hostGameRef = useRef<{
    teamOrder: Record<Team, string[]>
    teamTurnCount: Record<Team, number>
    deck: { id: number; name: string }[]
    deckPos: number
    currentCard: { id: number; name: string } | null
    turnResults: TurnCardResult[]
  }>({
    teamOrder: { red: [], blue: [] },
    teamTurnCount: { red: 0, blue: 0 },
    deck: [],
    deckPos: 0,
    currentCard: null,
    turnResults: [],
  })

  useEffect(() => { cardsRef.current = cards }, [cards])

  // Re-render every 500 ms while the guessing timer is running so the countdown stays live
  useEffect(() => {
    if (gameState.phase !== 'guessing') return
    const id = setInterval(() => setCountdownTick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [gameState.phase])

  // ── Player helpers ─────────────────────────────────────────────────────────────

  function myPlayer(): CharadesPlayer | undefined {
    return playersRef.current.find((p) => p.peerId === myPeerIdRef.current)
  }

  function upsertPlayer(p: CharadesPlayer) {
    const idx = playersRef.current.findIndex((x) => x.peerId === p.peerId)
    if (idx >= 0) {
      playersRef.current = [...playersRef.current.slice(0, idx), p, ...playersRef.current.slice(idx + 1)]
    } else {
      playersRef.current = [...playersRef.current, p]
    }
    setPlayers([...playersRef.current])
  }

  function removePlayer(peerId: string) {
    playersRef.current = playersRef.current.filter((p) => p.peerId !== peerId)
    setPlayers([...playersRef.current])
  }

  function addChat(msg: Omit<ChatMessage, 'id'>) {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: chatIdSeq++ }]
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
      return next
    })
  }

  // ── Network helpers ────────────────────────────────────────────────────────────

  function broadcast(msg: ToClientMsg, skipPeerId?: string) {
    clientConnsRef.current.forEach((conn, id) => {
      if (id !== skipPeerId) conn.send(msg)
    })
  }

  function broadcastAndApply(msg: ToClientMsg) {
    broadcast(msg)
    applyMsg(msg)
  }

  // A message meant for exactly one player (their card) — never shown to anyone else.
  function sendToPlayer(peerId: string, msg: ToClientMsg) {
    if (peerId === myPeerIdRef.current) {
      applyMsg(msg)
    } else {
      clientConnsRef.current.get(peerId)?.send(msg)
    }
  }

  // ── Host: assign new player to a team ─────────────────────────────────────────

  function hostAssignPlayer(peerId: string, name: string): CharadesPlayer {
    const reds = playersRef.current.filter((p) => p.team === 'red').length
    const blues = playersRef.current.filter((p) => p.team === 'blue').length
    const team: Team = reds <= blues ? 'red' : 'blue'
    return { peerId, name, team }
  }

  function hostPickTeam(peerId: string, team: Team) {
    const p = playersRef.current.find((x) => x.peerId === peerId)
    if (!p || p.team === team) return
    upsertPlayer({ ...p, team })
    broadcastAndApply({ type: 'player-updated', peerId, team })
  }

  // ── Host: deck management ───────────────────────────────────────────────────────

  function hostDrawCard(): { id: number; name: string } {
    const hg = hostGameRef.current
    if (hg.deckPos >= hg.deck.length) {
      hg.deck = shuffle(cardsRef.current.map((c) => ({ id: c.id, name: c.name })))
      hg.deckPos = 0
    }
    const card = hg.deck[hg.deckPos]
    hg.deckPos += 1
    return card
  }

  // ── Host: turn timer ────────────────────────────────────────────────────────────

  function clearTurnTimer() {
    if (turnTimerRef.current !== null) {
      clearTimeout(turnTimerRef.current)
      turnTimerRef.current = null
    }
  }

  function startTurnTimer() {
    clearTurnTimer()
    turnTimerRef.current = setTimeout(() => {
      if (gameStateRef.current.phase === 'guessing') hostFinishTurn()
    }, ROUND_DURATION_MS)
  }

  // ── Host: game logic ───────────────────────────────────────────────────────────

  function hostStartGame() {
    setPeerError(null)
    const reds = playersRef.current.filter((p) => p.team === 'red').map((p) => p.peerId)
    const blues = playersRef.current.filter((p) => p.team === 'blue').map((p) => p.peerId)
    const hg = hostGameRef.current
    hg.teamOrder = { red: shuffle(reds), blue: shuffle(blues) }
    hg.teamTurnCount = { red: 0, blue: 0 }
    hg.deck = shuffle(cardsRef.current.map((c) => ({ id: c.id, name: c.name })))
    hg.deckPos = 0
    hg.currentCard = null
    hg.turnResults = []

    const totalTurns = TURNS_PER_TEAM * 2
    const gs: CharadesGameState = { ...INIT_GAME, totalTurns }
    gameStateRef.current = gs
    setGameState(gs)
    setMyCard(null)
    setCardLog([])
    inGameRef.current = true
    broadcast({ type: 'game-started', totalTurns })
    setLobbyPhase('game')
    setTimeout(() => hostStartTurn(), 400)
  }

  function hostStartTurn() {
    const prev = gameStateRef.current
    const turnNumber = prev.turnNumber + 1
    const activeTeam: Team = turnNumber % 2 === 1 ? 'red' : 'blue'
    const hg = hostGameRef.current
    const order = hg.teamOrder[activeTeam]
    const idx = order.length > 0 ? hg.teamTurnCount[activeTeam] % order.length : 0
    const describerId = order[idx] ?? ''
    hg.teamTurnCount[activeTeam] += 1

    const card = hostDrawCard()
    hg.currentCard = card
    hg.turnResults = []

    const describerName = playersRef.current.find((p) => p.peerId === describerId)?.name ?? ''

    broadcastAndApply({
      type: 'turn-prep',
      turnNumber,
      activeTeam,
      describerId,
      describerName,
      scoreRed: prev.scoreRed,
      scoreBlue: prev.scoreBlue,
    })
    sendToPlayer(describerId, { type: 'your-card', id: card.id, word: card.name })
  }

  function hostStartGuessing(peerId: string) {
    const gs = gameStateRef.current
    if (gs.phase !== 'prep' || peerId !== gs.describerId) return
    // eslint-disable-next-line react-hooks/purity -- host-only event handler, never runs during render
    const turnDeadline = Date.now() + ROUND_DURATION_MS
    broadcastAndApply({ type: 'guessing-started', turnDeadline })
    startTurnTimer()
  }

  function hostHandleCard(peerId: string, result: 'correct' | 'skipped') {
    const gs = gameStateRef.current
    if (gs.phase !== 'guessing' || peerId !== gs.describerId) return
    const hg = hostGameRef.current
    const card = hg.currentCard
    if (!card) return

    hg.turnResults = [...hg.turnResults, { word: card.name, result }]
    const turnCorrect = gs.turnCorrect + (result === 'correct' ? 1 : 0)
    const turnSkipped = gs.turnSkipped + (result === 'skipped' ? 1 : 0)
    const scoreRed = gs.scoreRed + (result === 'correct' && gs.activeTeam === 'red' ? 1 : 0)
    const scoreBlue = gs.scoreBlue + (result === 'correct' && gs.activeTeam === 'blue' ? 1 : 0)
    broadcastAndApply({ type: 'card-progress', result, turnCorrect, turnSkipped, scoreRed, scoreBlue })

    const nextCard = hostDrawCard()
    hg.currentCard = nextCard
    sendToPlayer(gs.describerId, { type: 'next-card', id: nextCard.id, word: nextCard.name })
  }

  function hostFinishTurn() {
    clearTurnTimer()
    const gs = gameStateRef.current
    if (gs.phase !== 'guessing') return
    const hg = hostGameRef.current
    const lastTurnResults = hg.turnResults
    broadcastAndApply({
      type: 'turn-ended',
      turnNumber: gs.turnNumber,
      activeTeam: gs.activeTeam,
      scoreRed: gs.scoreRed,
      scoreBlue: gs.scoreBlue,
      lastTurnResults,
    })

    setTimeout(() => {
      if (!inGameRef.current) return
      const latest = gameStateRef.current
      if (latest.phase !== 'turn-over') return
      if (latest.turnNumber >= latest.totalTurns) hostFinishGame()
      else hostStartTurn()
    }, 3000)
  }

  function hostFinishGame() {
    const gs = gameStateRef.current
    const winner: Team | null = gs.scoreRed === gs.scoreBlue ? null : gs.scoreRed > gs.scoreBlue ? 'red' : 'blue'
    inGameRef.current = false
    broadcastAndApply({ type: 'game-over', scoreRed: gs.scoreRed, scoreBlue: gs.scoreBlue, winner })
  }

  // ── Client: apply messages from host ──────────────────────────────────────────

  function applyMsg(msg: ToClientMsg) {
    const gs = gameStateRef.current

    if (msg.type === 'welcome') {
      playersRef.current = msg.players
      setPlayers([...msg.players])
      return
    }
    if (msg.type === 'player-joined') {
      upsertPlayer(msg.player)
      addChat({ name: '', text: `${msg.player.name} joined.`, self: false })
      return
    }
    if (msg.type === 'player-left') {
      removePlayer(msg.peerId)
      addChat({ name: '', text: `${msg.name} left.`, self: false })
      return
    }
    if (msg.type === 'player-updated') {
      const p = playersRef.current.find((x) => x.peerId === msg.peerId)
      if (p) upsertPlayer({ ...p, team: msg.team })
      return
    }
    if (msg.type === 'chat') {
      addChat({ name: msg.name, text: msg.text, self: false })
      return
    }
    if (msg.type === 'game-started') {
      const next: CharadesGameState = { ...INIT_GAME, totalTurns: msg.totalTurns }
      gameStateRef.current = next
      setGameState(next)
      setMyCard(null)
      setCardLog([])
      inGameRef.current = true
      setLobbyPhase('game')
      return
    }
    if (msg.type === 'turn-prep') {
      const next: CharadesGameState = {
        ...gs,
        turnNumber: msg.turnNumber,
        activeTeam: msg.activeTeam,
        describerId: msg.describerId,
        phase: 'prep',
        turnDeadline: null,
        turnCorrect: 0,
        turnSkipped: 0,
        lastTurnResults: [],
        scoreRed: msg.scoreRed,
        scoreBlue: msg.scoreBlue,
      }
      gameStateRef.current = next
      setGameState(next)
      setMyCard(null)
      return
    }
    if (msg.type === 'your-card' || msg.type === 'next-card') {
      setMyCard({ id: msg.id, word: msg.word })
      return
    }
    if (msg.type === 'guessing-started') {
      const next: CharadesGameState = { ...gs, phase: 'guessing', turnDeadline: msg.turnDeadline }
      gameStateRef.current = next
      setGameState(next)
      return
    }
    if (msg.type === 'card-progress') {
      const next: CharadesGameState = {
        ...gs,
        turnCorrect: msg.turnCorrect,
        turnSkipped: msg.turnSkipped,
        scoreRed: msg.scoreRed,
        scoreBlue: msg.scoreBlue,
      }
      gameStateRef.current = next
      setGameState(next)
      return
    }
    if (msg.type === 'turn-ended') {
      const next: CharadesGameState = {
        ...gs,
        phase: 'turn-over',
        scoreRed: msg.scoreRed,
        scoreBlue: msg.scoreBlue,
        lastTurnResults: msg.lastTurnResults,
      }
      gameStateRef.current = next
      setGameState(next)
      setMyCard(null)
      setCardLog((prev) => [
        ...prev,
        ...msg.lastTurnResults.map((r) => ({ ...r, turnNumber: msg.turnNumber, team: msg.activeTeam })),
      ])
      return
    }
    if (msg.type === 'game-over') {
      const next: CharadesGameState = { ...gs, phase: 'game-over', scoreRed: msg.scoreRed, scoreBlue: msg.scoreBlue, winner: msg.winner }
      gameStateRef.current = next
      setGameState(next)
      inGameRef.current = false
      return
    }
    if (msg.type === 'back-to-lobby') {
      inGameRef.current = false
      gameStateRef.current = INIT_GAME
      setGameState(INIT_GAME)
      setMyCard(null)
      setCardLog([])
      setLobbyPhase('room')
      return
    }
    if (msg.type === 'player-disconnected-reset') {
      inGameRef.current = false
      clearTurnTimer()
      gameStateRef.current = INIT_GAME
      setGameState(INIT_GAME)
      setMyCard(null)
      setCardLog([])
      setLobbyPhase('room')
      addChat({ name: '', text: `${msg.name} disconnected. The game has been reset.`, self: false })
      return
    }
  }

  // ── Reset helpers (declared before wiring callbacks to avoid hoisting lint errors) ──

  function resetToSetup() {
    inGameRef.current = false
    clearTurnTimer()
    peerRef.current?.destroy()
    peerRef.current = null
    hostConnRef.current = null
    clientConnsRef.current.clear()
    myPeerIdRef.current = ''
    playersRef.current = []
    gameStateRef.current = INIT_GAME
    setLobbyPhase('setup')
    setGameState(INIT_GAME)
    setMyCard(null)
    setCardLog([])
    setPlayers([])
    setChatMessages([])
    setMyPeerId(null)
    setPeerError(null)
    setIsHost(false)
    isHostRef.current = false
  }

  // ── Network wiring ─────────────────────────────────────────────────────────────

  const wireClientConn = useCallback((conn: AnyDataConnection) => {
    clientConnsRef.current.set(conn.peer, conn)

    conn.on('data', (raw) => {
      const msg = raw as ToHostMsg
      if (msg.type === 'hello') {
        if (inGameRef.current) {
          conn.send({ type: 'game-in-progress' } satisfies ToClientMsg)
          setTimeout(() => conn.close(), 200)
          return
        }
        const newPlayer = hostAssignPlayer(conn.peer, msg.name)
        upsertPlayer(newPlayer)
        conn.send({ type: 'welcome', players: playersRef.current } satisfies ToClientMsg)
        broadcast({ type: 'player-joined', player: newPlayer } satisfies ToClientMsg, conn.peer)
        addChat({ name: '', text: `${msg.name} joined the room.`, self: false })
      }
      if (msg.type === 'pick-team') {
        hostPickTeam(conn.peer, msg.team)
      }
      if (msg.type === 'start-guessing') {
        hostStartGuessing(conn.peer)
      }
      if (msg.type === 'skip-card') {
        hostHandleCard(conn.peer, 'skipped')
      }
      if (msg.type === 'got-it') {
        hostHandleCard(conn.peer, 'correct')
      }
      if (msg.type === 'chat') {
        broadcast({ type: 'chat', name: msg.name, text: msg.text } satisfies ToClientMsg, conn.peer)
        addChat({ name: msg.name, text: msg.text, self: false })
      }
    })

    conn.on('close', () => {
      const leaving = playersRef.current.find((p) => p.peerId === conn.peer)
      clientConnsRef.current.delete(conn.peer)
      removePlayer(conn.peer)
      if (leaving) {
        if (inGameRef.current) {
          inGameRef.current = false
          clearTurnTimer()
          gameStateRef.current = INIT_GAME
          setGameState(INIT_GAME)
          setMyCard(null)
          setCardLog([])
          setLobbyPhase('room')
          broadcast({ type: 'player-disconnected-reset', name: leaving.name } satisfies ToClientMsg)
          addChat({ name: '', text: `${leaving.name} disconnected. The game has been reset.`, self: false })
        } else {
          broadcast({ type: 'player-left', peerId: conn.peer, name: leaving.name } satisfies ToClientMsg)
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
      conn.send({ type: 'hello', name: myNameRef.current } satisfies ToHostMsg)
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

  // ── UI handlers ────────────────────────────────────────────────────────────────

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

  function handlePickTeam(team: Team) {
    const me = myPlayer()
    if (!me || me.team === team) return
    if (isHostRef.current) {
      hostPickTeam(myPeerIdRef.current, team)
    } else {
      hostConnRef.current?.send({ type: 'pick-team', team } satisfies ToHostMsg)
    }
  }

  function handleSendChat(e: React.FormEvent) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const payload = { name: myNameRef.current, text }
    if (isHostRef.current) broadcast({ type: 'chat', ...payload })
    else hostConnRef.current?.send({ type: 'chat', ...payload } satisfies ToHostMsg)
    addChat({ ...payload, self: true })
    setChatInput('')
  }

  function handleStartGame() {
    if (!isHostRef.current) return
    const total = playersRef.current.length
    const reds = playersRef.current.filter((p) => p.team === 'red')
    const blues = playersRef.current.filter((p) => p.team === 'blue')
    if (total < MIN_PLAYERS_CZ) {
      setPeerError(`Need at least ${MIN_PLAYERS_CZ} players to start.`)
      return
    }
    if (reds.length < 2 || blues.length < 2) {
      setPeerError('Each team needs at least 2 players (a describer and a guesser).')
      return
    }
    setPeerError(null)
    hostStartGame()
  }

  function handleStartGuessing() {
    if (isHostRef.current) {
      hostStartGuessing(myPeerIdRef.current)
    } else {
      hostConnRef.current?.send({ type: 'start-guessing' } satisfies ToHostMsg)
    }
  }

  function handleSkip() {
    if (isHostRef.current) {
      hostHandleCard(myPeerIdRef.current, 'skipped')
    } else {
      hostConnRef.current?.send({ type: 'skip-card' } satisfies ToHostMsg)
    }
  }

  function handleGotIt() {
    if (isHostRef.current) {
      hostHandleCard(myPeerIdRef.current, 'correct')
    } else {
      hostConnRef.current?.send({ type: 'got-it' } satisfies ToHostMsg)
    }
  }

  function handleBackToLobby() {
    inGameRef.current = false
    clearTurnTimer()
    gameStateRef.current = INIT_GAME
    setGameState(INIT_GAME)
    setMyCard(null)
    setCardLog([])
    if (isHostRef.current) {
      broadcast({ type: 'back-to-lobby' })
    }
    setLobbyPhase('room')
  }

  // ── Derived state ──────────────────────────────────────────────────────────────

  const gs = gameState
  const me = players.find((p) => p.peerId === myPeerId) ?? null
  const amIDescriber = gs.describerId === myPeerId
  const amOnActiveTeam = me?.team === gs.activeTeam
  const describerPlayer = players.find((p) => p.peerId === gs.describerId)
  const secondsLeft = gs.turnDeadline !== null
    // eslint-disable-next-line react-hooks/purity -- countdown tick re-renders every 500ms to refresh this
    ? Math.max(0, Math.ceil((gs.turnDeadline - Date.now()) / 1000))
    : null
  const teamLabel = (t: Team) => (t === 'red' ? 'Red' : 'Blue')

  // ── Render phases ──────────────────────────────────────────────────────────────

  if (lobbyPhase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Charades: Yu-Gi-Oh!</h2>
        <p className="pvp-lobby__hint">
          Two teams take turns describing a random card over voice chat — no saying the name! Skip
          cards you can't describe, mark one as guessed to score a point for your team. 60 seconds
          per turn, 3 turns each.
        </p>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <button className="hol-btn" onClick={() => { setPeerError(null); setLobbyPhase('name-entry') }}>
          Play Multiplayer
        </button>
      </div>
    )
  }

  if (lobbyPhase === 'name-entry') {
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
        const hostPlayer = hostAssignPlayer(id, n)
        playersRef.current = [hostPlayer]
        setPlayers([hostPlayer])
      })
      peer.on('connection', (conn: AnyDataConnection | LocalConnection) => {
        if (!isHostRef.current || clientConnsRef.current.size >= MAX_PLAYERS_CZ - 1) {
          conn.close()
          return
        }
        wireClientConn(conn as AnyDataConnection)
        if (!inGameRef.current) setLobbyPhase('room')
      })
      peer.on('error', (err: Error) => setPeerError(err.message))
      setLobbyPhase('lobby')
    }
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Charades — Enter Name</h2>
        <form className="pvp-lobby__form" onSubmit={(e) => { e.preventDefault(); handleNameContinue() }}>
          <label className="pvp-lobby__label" htmlFor="cz-name">Your name</label>
          <input
            id="cz-name"
            className="pvp-lobby__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name…"
            maxLength={24}
            autoFocus
          />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>Continue</button>
        </form>
        <button className="pvp-lobby__copy-btn" onClick={() => setLobbyPhase('setup')}>← Back</button>
      </div>
    )
  }

  if (lobbyPhase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Charades</h2>
        <p className="pvp-lobby__you">You: <strong>{name}</strong></p>
        {!myPeerId && <p className="pvp-lobby__hint">Connecting to network…</p>}
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        {myPeerId && (
          <>
            <section className="pvp-lobby__section">
              <p className="pvp-lobby__label">Your game code — share with friends:</p>
              <div className="pvp-lobby__id-row">
                <code className="pvp-lobby__id">{myPeerId}</code>
                <button className="pvp-lobby__copy-btn" onClick={() => {
                  navigator.clipboard.writeText(myPeerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
                }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </section>
            <section className="pvp-lobby__section">
              <form onSubmit={handleJoin}>
                <p className="pvp-lobby__label">Join a game:</p>
                <div className="pvp-lobby__id-row">
                  <input
                    className="pvp-lobby__input pvp-lobby__input--wide"
                    type="text"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    placeholder="Paste host's code…"
                  />
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

  if (lobbyPhase === 'room') {
    const reds = players.filter((p) => p.team === 'red')
    const blues = players.filter((p) => p.team === 'blue')
    const total = players.length
    const canStart = isHost && total >= MIN_PLAYERS_CZ && reds.length >= 2 && blues.length >= 2

    return (
      <div className="pvp-room" style={{ flexDirection: 'column', maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Charades — Lobby</h2>
          <button className="pvp-lobby__copy-btn" onClick={resetToSetup}>Leave</button>
        </div>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <p className="pvp-lobby__hint">
          Code: <code style={{ userSelect: 'all' }}>{myPeerId}</code>
          {' '}<button className="pvp-lobby__copy-btn" onClick={() => {
            if (myPeerId) navigator.clipboard.writeText(myPeerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
          }}>{copied ? 'Copied!' : 'Copy'}</button>
        </p>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {(['red', 'blue'] as Team[]).map((team) => {
            const teamPlayers = players.filter((p) => p.team === team)
            return (
              <div key={team} className={`cn-team-col cn-team-col--${team}`}>
                <div className="cn-team-col__header">{team === 'red' ? 'Red Team' : 'Blue Team'}</div>
                <ul className="pvp-lobby__player-list">
                  {teamPlayers.map((p) => (
                    <li key={p.peerId} className="pvp-lobby__player-row">
                      <span className="pvp-lobby__dot pvp-lobby__dot--online" />
                      <span className="pvp-lobby__player-name">{p.name}{p.peerId === myPeerId ? ' (you)' : ''}</span>
                    </li>
                  ))}
                  {teamPlayers.length === 0 && <li className="pvp-lobby__player-row pvp-lobby__player-row--empty">No players</li>}
                </ul>
                {me?.team !== team && (
                  <button className="pvp-lobby__copy-btn" style={{ marginTop: '0.5rem' }} onClick={() => handlePickTeam(team)}>
                    Join {team === 'red' ? 'Red' : 'Blue'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {isHost && (
          <>
            <button className="hol-btn cn-start-btn" disabled={!canStart} onClick={handleStartGame}>
              Start Game
            </button>
            {!canStart && (
              <p className="pvp-lobby__hint" style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Need at least {MIN_PLAYERS_CZ} players, with at least 2 on each team to start
                {total > 0 && ` — ${total} player${total !== 1 ? 's' : ''} so far`}
              </p>
            )}
          </>
        )}
        {!isHost && <p className="pvp-lobby__hint">Waiting for host to start…</p>}

        {/* Chat */}
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

  // ── Game view ──────────────────────────────────────────────────────────────────

  return (
    <div className="ch-game cz-game">
      <div className="cn-header">
        <div className="cn-header__scores">
          <span className="cn-score cn-score--red">{gs.scoreRed} Red</span>
          <span className="cn-header__sep">·</span>
          <span className="cn-score cn-score--blue">{gs.scoreBlue} Blue</span>
        </div>
        <div className={`cn-header__turn cn-header__turn--${gs.activeTeam}`}>
          {gs.phase === 'game-over'
            ? gs.winner
              ? `${teamLabel(gs.winner)} wins!`
              : "It's a tie!"
            : `Turn ${gs.turnNumber} / ${gs.totalTurns} — ${teamLabel(gs.activeTeam)}'s turn`
          }
        </div>
      </div>

      <div className="ch-body">
        <div className="ch-main">
          {/* Prep phase */}
          {gs.phase === 'prep' && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Get Ready</h3>
              {amIDescriber ? (
                <>
                  <p className="ch-phase-panel__desc">
                    You're describing for {teamLabel(gs.activeTeam)}! Over voice chat, describe the
                    card below to your teammates without saying its name. Hit Skip to pass on a card,
                    or Got It! once your team guesses correctly. You'll have 60 seconds once you start.
                  </p>
                  {myCard && (
                    <div className="cz-card-preview">
                      <img
                        className="cz-card-preview__img"
                        src={`https://images.ygoprodeck.com/${myCard.id}.jpg`}
                        alt=""
                      />
                      <div className="cz-card-preview__name">{myCard.word}</div>
                    </div>
                  )}
                  <button className="hol-btn" style={{ marginTop: '1rem' }} onClick={handleStartGuessing}>
                    Start Guessing Round
                  </button>
                </>
              ) : amOnActiveTeam ? (
                <p className="ch-waiting">
                  {describerPlayer?.name ?? 'Your teammate'} is getting ready to describe a card —
                  listen up and get ready to guess!
                </p>
              ) : (
                <p className="ch-waiting">
                  {teamLabel(gs.activeTeam)} ({describerPlayer?.name ?? '…'}) is getting ready for
                  their turn…
                </p>
              )}
            </div>
          )}

          {/* Guessing phase */}
          {gs.phase === 'guessing' && (
            <div className="ch-phase-panel">
              <div className="cz-timer-row">
                <span className={`cc-turn-timer${secondsLeft !== null && secondsLeft <= 10 ? ' cc-turn-timer--urgent' : ''}`}>
                  {secondsLeft ?? 0}s
                </span>
                <span className="cz-timer-row__tally">
                  ✓ {gs.turnCorrect} · ⏭ {gs.turnSkipped}
                </span>
              </div>
              <div className="cc-turn-timer-bar">
                <div
                  className={`cc-turn-timer-bar__fill${secondsLeft !== null && secondsLeft <= 10 ? ' cc-turn-timer-bar__fill--urgent' : ''}`}
                  style={{ width: `${((secondsLeft ?? 0) / (ROUND_DURATION_MS / 1000)) * 100}%` }}
                />
              </div>

              {amIDescriber && myCard ? (
                <>
                  <div className="cz-card-preview cz-card-preview--active">
                    <img
                      className="cz-card-preview__img"
                      src={`https://images.ygoprodeck.com/${myCard.id}.jpg`}
                      alt=""
                    />
                    <div className="cz-card-preview__name">{myCard.word}</div>
                  </div>
                  <div className="cz-action-row">
                    <button className="cz-skip-btn" onClick={handleSkip}>Skip</button>
                    <button className="cz-gotit-btn" onClick={handleGotIt}>Got It! ✓</button>
                  </div>
                </>
              ) : (
                <p className="ch-waiting">
                  {describerPlayer?.name ?? 'Your describer'} is describing a card for{' '}
                  {teamLabel(gs.activeTeam)} — {gs.turnCorrect} guessed, {gs.turnSkipped} skipped so far.
                </p>
              )}
            </div>
          )}

          {/* Turn over */}
          {gs.phase === 'turn-over' && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Turn Over!</h3>
              <p className="ch-phase-panel__desc">
                {teamLabel(gs.activeTeam)} scored {gs.lastTurnResults.filter((r) => r.result === 'correct').length} point
                {gs.lastTurnResults.filter((r) => r.result === 'correct').length !== 1 ? 's' : ''} this turn.
              </p>
              {gs.lastTurnResults.length > 0 && (
                <ul className="cz-turn-results">
                  {gs.lastTurnResults.map((r, i) => (
                    <li key={i} className={`cz-turn-results__item${r.result === 'correct' ? ' cz-turn-results__item--correct' : ' cz-turn-results__item--skipped'}`}>
                      <span>{r.word}</span>
                      <span>{r.result === 'correct' ? '✓' : '⏭'}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="ch-waiting" style={{ marginTop: '1rem' }}>
                {gs.turnNumber < gs.totalTurns ? 'Next turn starting…' : 'Finishing game…'}
              </p>
            </div>
          )}

          {/* Game over */}
          {gs.phase === 'game-over' && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Game Over!</h3>
              <div className={`cn-winner${gs.winner ? ` cn-winner--${gs.winner}` : ''}`}>
                {gs.winner ? `${teamLabel(gs.winner)} wins!` : "It's a tie!"}
              </div>
              <div className="ch-scores" style={{ marginTop: '1rem' }}>
                <div className="ch-score-row">
                  <span className="ch-score-row__name">Red</span>
                  <span className="ch-score-row__pts">{gs.scoreRed} pts</span>
                </div>
                <div className="ch-score-row">
                  <span className="ch-score-row__name">Blue</span>
                  <span className="ch-score-row__pts">{gs.scoreBlue} pts</span>
                </div>
              </div>
              <button className="hol-btn" style={{ marginTop: '1rem' }} onClick={handleBackToLobby}>
                Back to Lobby
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="ch-sidebar">
          <div className="ch-sidebar__section">
            <div className="ch-sidebar__heading">Players</div>
            {(['red', 'blue'] as Team[]).map((team) => (
              <div key={team} className={`cn-sidebar__team cn-sidebar__team--${team}`}>
                <span className="cn-sidebar__team-label">{teamLabel(team)}</span>
                {players.filter((p) => p.team === team).map((p) => (
                  <div key={p.peerId} className="cn-sidebar__player">
                    {p.name}{p.peerId === myPeerId ? ' ★' : ''}{p.peerId === gs.describerId ? ' 🗣️' : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {cardLog.length > 0 && (
            <div className="ch-sidebar__section">
              <div className="ch-sidebar__heading">Card Log</div>
              <ul className="cz-card-log">
                {cardLog.map((entry, i) => (
                  <li key={i} className={`cz-card-log__item${entry.result === 'correct' ? ' cz-card-log__item--correct' : ' cz-card-log__item--skipped'}`}>
                    <span className={`cz-card-log__dot cz-card-log__dot--${entry.team}`} />
                    <span className="cz-card-log__word">{entry.word}</span>
                    <span className="cz-card-log__icon">{entry.result === 'correct' ? '✓' : '⏭'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pvp-chat ch-sidebar__chat">
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
              <button className="hol-btn" type="submit" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>→</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
