import { useRef, useState, useCallback, useEffect, type ReactElement } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import { useAppSelector } from '../../hooks/hooks'
import { createLocalPeer } from '../../multiplayer/transport'
import type { LocalConnection } from '../../multiplayer/transport'
import {
  ICE_SERVERS,
  MAX_PLAYERS_CN,
  type AnyDataConnection,
  type Team,
  type BoardCell,
  type CodenamesPlayer,
  type ChatMessage,
  type GuessHistoryEntry,
  type ToHostMsg,
  type ToClientMsg,
} from './codenamesTypes'
import { generateBoard, teamRemainingCount, RED_COUNT, BLUE_COUNT } from './codenamesUtils'

// ── Constants ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cn-player-name'

// ── Game state ─────────────────────────────────────────────────────────────────

type GamePhase = 'waiting-for-clue' | 'guessing' | 'game-over'

interface GameState {
  board: BoardCell[]
  activeTeam: Team
  phase: GamePhase
  currentClueWord: string | null
  currentClueCount: number
  guessesLeft: number
  redRemaining: number
  blueRemaining: number
  winner: Team | null
  winReason: 'found-all' | 'assassin' | null
}

const INIT_GAME: GameState = {
  board: [],
  activeTeam: 'red',
  phase: 'waiting-for-clue',
  currentClueWord: null,
  currentClueCount: 0,
  guessesLeft: 0,
  redRemaining: RED_COUNT,
  blueRemaining: BLUE_COUNT,
  winner: null,
  winReason: null,
}

type LobbyPhase = 'setup' | 'name-entry' | 'lobby' | 'room' | 'game'

let chatIdSeq = 0

// ── Component ──────────────────────────────────────────────────────────────────

export default function Codenames(): ReactElement {
  const { cards } = useAppSelector((s) => s.cards)

  // Lobby state
  const [name, setName] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>('setup')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [players, setPlayers] = useState<CodenamesPlayer[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')

  // Game state
  const [gameState, setGameState] = useState<GameState>(INIT_GAME)
  const [clueInput, setClueInput] = useState('')
  const [clueCountInput, setClueCountInput] = useState('1')
  const [guessHistory, setGuessHistory] = useState<GuessHistoryEntry[]>([])

  // Refs for stable access inside event handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const clientConnsRef = useRef<Map<string, AnyDataConnection>>(new Map())
  const hostConnRef = useRef<AnyDataConnection | null>(null)
  const playersRef = useRef<CodenamesPlayer[]>([])
  const gameStateRef = useRef<GameState>(INIT_GAME)
  const inGameRef = useRef(false)
  const cardsRef = useRef(cards)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { cardsRef.current = cards }, [cards])

  // ── Player helpers ─────────────────────────────────────────────────────────────

  function myPlayer(): CodenamesPlayer | undefined {
    return playersRef.current.find((p) => p.peerId === myPeerIdRef.current)
  }

  function upsertPlayer(p: CodenamesPlayer) {
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

  function addHistoryEntry(entry: GuessHistoryEntry) {
    setGuessHistory((prev) => [...prev, entry])
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

  // ── Host: assign new player to a team ─────────────────────────────────────────

  function hostAssignPlayer(peerId: string, name: string): CodenamesPlayer {
    const reds = playersRef.current.filter((p) => p.team === 'red').length
    const blues = playersRef.current.filter((p) => p.team === 'blue').length
    const team: Team = reds <= blues ? 'red' : 'blue'
    const isSpymaster = !playersRef.current.some((p) => p.team === team && p.isSpymaster)
    return { peerId, name, team, isSpymaster }
  }

  // ── Host: update player role when they switch team / claim spymaster ──────────

  function hostPickTeam(peerId: string, team: Team) {
    const p = playersRef.current.find((x) => x.peerId === peerId)
    if (!p || p.team === team) return
    const isSpymaster = !playersRef.current.some((x) => x.team === team && x.isSpymaster)
    const updated: CodenamesPlayer = { ...p, team, isSpymaster }
    upsertPlayer(updated)
    broadcastAndApply({ type: 'player-updated', peerId, team, isSpymaster })
  }

  function hostClaimSpymaster(peerId: string) {
    const p = playersRef.current.find((x) => x.peerId === peerId)
    if (!p || p.isSpymaster) return
    // Demote existing spymaster on that team to operative
    const prev = playersRef.current.find((x) => x.team === p.team && x.isSpymaster)
    if (prev) {
      const demoted = { ...prev, isSpymaster: false }
      upsertPlayer(demoted)
      broadcastAndApply({ type: 'player-updated', peerId: prev.peerId, team: prev.team, isSpymaster: false })
    }
    const promoted = { ...p, isSpymaster: true }
    upsertPlayer(promoted)
    broadcastAndApply({ type: 'player-updated', peerId, team: p.team, isSpymaster: true })
  }

  // ── Host: game logic ───────────────────────────────────────────────────────────

  function hostStartGame() {
    const board = generateBoard(cardsRef.current, 'red')
    const redTotal = board.filter((c) => c.team === 'red').length
    const blueTotal = board.filter((c) => c.team === 'blue').length
    const gs: GameState = {
      ...INIT_GAME,
      board,
      activeTeam: 'red',
      redRemaining: redTotal,
      blueRemaining: blueTotal,
    }
    gameStateRef.current = gs
    setGameState(gs)
    setGuessHistory([])
    inGameRef.current = true
    broadcast({ type: 'game-started', board, activeTeam: 'red', redTotal, blueTotal })
    setLobbyPhase('game')
  }

  function hostGiveClue(word: string, count: number) {
    const gs = gameStateRef.current
    if (gs.phase !== 'waiting-for-clue') return
    const next: GameState = {
      ...gs,
      phase: 'guessing',
      currentClueWord: word,
      currentClueCount: count,
      guessesLeft: count + 1, // +1 bonus guess
    }
    gameStateRef.current = next
    setGameState(next)
    addHistoryEntry({ kind: 'clue', clueWord: word, clueCount: count, team: gs.activeTeam })
    broadcast({ type: 'clue-given', word, count })
  }

  function hostPickCard(pickerPeerId: string, index: number) {
    const gs = gameStateRef.current
    if (gs.phase !== 'guessing') return
    const pickerPlayer = playersRef.current.find((p) => p.peerId === pickerPeerId)
    if (!pickerPlayer || pickerPlayer.team !== gs.activeTeam || pickerPlayer.isSpymaster) return
    const cell = gs.board[index]
    if (!cell || cell.revealed) return

    const newBoard = gs.board.map((c, i) => (i === index ? { ...c, revealed: true } : c))
    const redRemaining = teamRemainingCount(newBoard, 'red')
    const blueRemaining = teamRemainingCount(newBoard, 'blue')

    // Check win/loss
    if (cell.team === 'assassin') {
      const winner: Team = gs.activeTeam === 'red' ? 'blue' : 'red'
      const endGs: GameState = { ...gs, board: newBoard, phase: 'game-over', winner, winReason: 'assassin', redRemaining, blueRemaining }
      gameStateRef.current = endGs
      setGameState(endGs)
      broadcastAndApply({ type: 'card-revealed', index, cellTeam: cell.team, guessesLeft: 0, redRemaining, blueRemaining })
      broadcastAndApply({ type: 'game-over', winner, reason: 'assassin' })
      return
    }

    if (cell.team === 'red' && redRemaining === 0) {
      const endGs: GameState = { ...gs, board: newBoard, phase: 'game-over', winner: 'red', winReason: 'found-all', redRemaining, blueRemaining }
      gameStateRef.current = endGs
      setGameState(endGs)
      broadcastAndApply({ type: 'card-revealed', index, cellTeam: cell.team, guessesLeft: 0, redRemaining, blueRemaining })
      broadcastAndApply({ type: 'game-over', winner: 'red', reason: 'found-all' })
      return
    }

    if (cell.team === 'blue' && blueRemaining === 0) {
      const endGs: GameState = { ...gs, board: newBoard, phase: 'game-over', winner: 'blue', winReason: 'found-all', redRemaining, blueRemaining }
      gameStateRef.current = endGs
      setGameState(endGs)
      broadcastAndApply({ type: 'card-revealed', index, cellTeam: cell.team, guessesLeft: 0, redRemaining, blueRemaining })
      broadcastAndApply({ type: 'game-over', winner: 'blue', reason: 'found-all' })
      return
    }

    // If guessed wrong team → end turn
    const guessesLeft = cell.team === gs.activeTeam ? gs.guessesLeft - 1 : 0
    const shouldEndTurn = guessesLeft === 0 || cell.team !== gs.activeTeam

    broadcastAndApply({ type: 'card-revealed', index, cellTeam: cell.team, guessesLeft, redRemaining, blueRemaining })

    if (shouldEndTurn) {
      const nextTeam: Team = gs.activeTeam === 'red' ? 'blue' : 'red'
      const turnGs: GameState = { ...gameStateRef.current, phase: 'waiting-for-clue', activeTeam: nextTeam, currentClueWord: null, currentClueCount: 0, guessesLeft: 0 }
      gameStateRef.current = turnGs
      setGameState(turnGs)
      broadcast({ type: 'turn-ended', activeTeam: nextTeam })
    }
  }

  function hostEndTurn(requesterPeerId: string) {
    const gs = gameStateRef.current
    if (gs.phase !== 'guessing') return
    const p = playersRef.current.find((x) => x.peerId === requesterPeerId)
    if (!p || p.team !== gs.activeTeam || p.isSpymaster) return
    const nextTeam: Team = gs.activeTeam === 'red' ? 'blue' : 'red'
    const next: GameState = { ...gs, phase: 'waiting-for-clue', activeTeam: nextTeam, currentClueWord: null, currentClueCount: 0, guessesLeft: 0 }
    gameStateRef.current = next
    setGameState(next)
    broadcastAndApply({ type: 'turn-ended', activeTeam: nextTeam })
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
      if (p) upsertPlayer({ ...p, team: msg.team, isSpymaster: msg.isSpymaster })
      return
    }
    if (msg.type === 'chat') {
      addChat({ name: msg.name, text: msg.text, self: false })
      return
    }
    if (msg.type === 'game-started') {
      const next: GameState = { ...INIT_GAME, board: msg.board, activeTeam: msg.activeTeam, redRemaining: msg.redTotal, blueRemaining: msg.blueTotal }
      gameStateRef.current = next
      setGameState(next)
      setGuessHistory([])
      setLobbyPhase('game')
      return
    }
    if (msg.type === 'clue-given') {
      addHistoryEntry({ kind: 'clue', clueWord: msg.word, clueCount: msg.count, team: gs.activeTeam })
      const next: GameState = { ...gs, phase: 'guessing', currentClueWord: msg.word, currentClueCount: msg.count, guessesLeft: msg.guessesLeft ?? msg.count + 1 }
      gameStateRef.current = next
      setGameState(next)
      return
    }
    if (msg.type === 'card-revealed') {
      addHistoryEntry({ kind: 'guess', cardWord: gs.board[msg.index]?.word ?? '', pickerTeam: gs.activeTeam, cellTeam: msg.cellTeam })
      const newBoard = gs.board.map((c, i) => i === msg.index ? { ...c, revealed: true } : c)
      const next: GameState = { ...gs, board: newBoard, guessesLeft: msg.guessesLeft, redRemaining: msg.redRemaining, blueRemaining: msg.blueRemaining }
      gameStateRef.current = next
      setGameState(next)
      return
    }
    if (msg.type === 'turn-ended') {
      const next: GameState = { ...gameStateRef.current, phase: 'waiting-for-clue', activeTeam: msg.activeTeam, currentClueWord: null, currentClueCount: 0, guessesLeft: 0 }
      gameStateRef.current = next
      setGameState(next)
      return
    }
    if (msg.type === 'game-over') {
      const next: GameState = { ...gameStateRef.current, phase: 'game-over', winner: msg.winner, winReason: msg.reason }
      gameStateRef.current = next
      setGameState(next)
      return
    }
    if (msg.type === 'back-to-lobby') {
      gameStateRef.current = INIT_GAME
      setGameState(INIT_GAME)
      setGuessHistory([])
      setLobbyPhase('room')
      setClueInput('')
      setClueCountInput('1')
      return
    }
    if (msg.type === 'player-disconnected-reset') {
      inGameRef.current = false
      gameStateRef.current = INIT_GAME
      setGameState(INIT_GAME)
      setGuessHistory([])
      setLobbyPhase('room')
      setClueInput('')
      setClueCountInput('1')
      addChat({ name: '', text: `${msg.name} disconnected. The game has been reset.`, self: false })
      return
    }
  }

  // ── Reset helpers (declared before wiring callbacks to avoid hoisting lint errors) ──

  function resetToSetup() {
    inGameRef.current = false
    peerRef.current?.destroy()
    peerRef.current = null
    hostConnRef.current = null
    clientConnsRef.current.clear()
    myPeerIdRef.current = ''
    playersRef.current = []
    gameStateRef.current = INIT_GAME
    setLobbyPhase('setup')
    setGameState(INIT_GAME)
    setGuessHistory([])
    setPlayers([])
    setChatMessages([])
    setMyPeerId(null)
    setPeerError(null)
    setIsHost(false)
    isHostRef.current = false
    setClueInput('')
    setClueCountInput('1')
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
      if (msg.type === 'claim-spymaster') {
        hostClaimSpymaster(conn.peer)
      }
      if (msg.type === 'give-clue') {
        const p = playersRef.current.find((x) => x.peerId === conn.peer)
        const gs = gameStateRef.current
        if (p && p.isSpymaster && p.team === gs.activeTeam && gs.phase === 'waiting-for-clue') {
          hostGiveClue(msg.word, msg.count)
        }
      }
      if (msg.type === 'pick-card') {
        hostPickCard(conn.peer, msg.index)
      }
      if (msg.type === 'end-turn') {
        hostEndTurn(conn.peer)
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
          gameStateRef.current = INIT_GAME
          setGameState(INIT_GAME)
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

  function handleClaimSpymaster() {
    if (isHostRef.current) {
      hostClaimSpymaster(myPeerIdRef.current)
    } else {
      hostConnRef.current?.send({ type: 'claim-spymaster' } satisfies ToHostMsg)
    }
  }

  function handleGiveClue(e: React.FormEvent) {
    e.preventDefault()
    const word = clueInput.trim()
    const count = Math.max(1, Math.min(9, parseInt(clueCountInput, 10) || 1))
    if (!word) return
    if (isHostRef.current) {
      hostGiveClue(word, count)
    } else {
      hostConnRef.current?.send({ type: 'give-clue', word, count } satisfies ToHostMsg)
    }
    setClueInput('')
    setClueCountInput('1')
  }

  function handlePickCard(index: number) {
    if (isHostRef.current) {
      hostPickCard(myPeerIdRef.current, index)
    } else {
      hostConnRef.current?.send({ type: 'pick-card', index } satisfies ToHostMsg)
    }
  }

  function handleEndTurn() {
    if (isHostRef.current) {
      hostEndTurn(myPeerIdRef.current)
    } else {
      hostConnRef.current?.send({ type: 'end-turn' } satisfies ToHostMsg)
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
    if (total < 4 || total % 2 !== 0) {
      setPeerError('Need at least 4 players and an even number to start.')
      return
    }
    const reds = playersRef.current.filter((p) => p.team === 'red')
    const blues = playersRef.current.filter((p) => p.team === 'blue')
    if (reds.length === 0 || blues.length === 0) {
      setPeerError('Need players on both teams to start.')
      return
    }
    setPeerError(null)
    hostStartGame()
  }

  function handleBackToLobby() {
    inGameRef.current = false
    gameStateRef.current = INIT_GAME
    setGameState(INIT_GAME)
    setClueInput('')
    setClueCountInput('1')
    if (isHostRef.current) {
      broadcast({ type: 'back-to-lobby' })
    }
    setLobbyPhase('room')
  }

  // ── Derived state ──────────────────────────────────────────────────────────────

  const me = players.find((p) => p.peerId === myPeerId) ?? null
  const gs = gameState
  const amISpymaster = me?.isSpymaster ?? false
  const amIActiveTeam = me?.team === gs.activeTeam
  const canIGiveClue = amISpymaster && amIActiveTeam && gs.phase === 'waiting-for-clue'
  const canIGuess = !amISpymaster && amIActiveTeam && gs.phase === 'guessing'

  // ── Cell rendering ─────────────────────────────────────────────────────────────

  function cellColor(cell: BoardCell): string {
    if (cell.revealed) {
      if (cell.team === 'red') return 'cn-cell--red-revealed'
      if (cell.team === 'blue') return 'cn-cell--blue-revealed'
      if (cell.team === 'assassin') return 'cn-cell--assassin-revealed'
      return 'cn-cell--neutral-revealed'
    }
    if (amISpymaster) {
      if (cell.team === 'red') return 'cn-cell--red-hint'
      if (cell.team === 'blue') return 'cn-cell--blue-hint'
      if (cell.team === 'assassin') return 'cn-cell--assassin-hint'
      return 'cn-cell--neutral-hint'
    }
    // Full board reveal at game end — unrevealed cells show their team color at full opacity
    if (gs.phase === 'game-over') {
      if (cell.team === 'red') return 'cn-cell--red-revealed'
      if (cell.team === 'blue') return 'cn-cell--blue-revealed'
      if (cell.team === 'assassin') return 'cn-cell--assassin-revealed'
      return 'cn-cell--neutral-revealed'
    }
    return ''
  }

  // ── Render phases ──────────────────────────────────────────────────────────────

  if (lobbyPhase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Codenames: Yu-Gi-Oh!</h2>
        <p className="pvp-lobby__hint">A Spymaster gives clues to help their team identify cards on the board. First team to reveal all their cards wins.</p>
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
        upsertPlayer(hostPlayer)
      })
      peer.on('connection', (conn: AnyDataConnection | LocalConnection) => {
        if (!isHostRef.current || clientConnsRef.current.size >= MAX_PLAYERS_CN - 1) {
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
        <h2 className="pvp-lobby__title">Codenames — Enter Name</h2>
        <form className="pvp-lobby__form" onSubmit={(e) => { e.preventDefault(); handleNameContinue() }}>
          <label className="pvp-lobby__label" htmlFor="cn-name">Your name</label>
          <input
            id="cn-name"
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
        <h2 className="pvp-lobby__title">Codenames</h2>
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
    const canStart = isHost && total >= 4 && total % 2 === 0 && reds.length > 0 && blues.length > 0

    return (
      <div className="pvp-room" style={{ flexDirection: 'column', maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Codenames — Lobby</h2>
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
                      <span className={`pvp-lobby__dot pvp-lobby__dot--online`} />
                      <span className="pvp-lobby__player-name">{p.name}{p.peerId === myPeerId ? ' (you)' : ''}</span>
                      {p.isSpymaster && <span className="pvp-lobby__tag cn-tag--spy">Spymaster</span>}
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
        {me && !me.isSpymaster && (
          <button className="pvp-lobby__copy-btn" onClick={handleClaimSpymaster}>
            Become Spymaster for {me.team === 'red' ? 'Red' : 'Blue'}
          </button>
        )}
        {isHost && (
          <>
            <button className="hol-btn cn-start-btn" disabled={!canStart} onClick={handleStartGame}>
              Start Game
            </button>
            {!canStart && (
              <p className="pvp-lobby__hint" style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Need at least 4 players (even number) to start
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

  const teamLabel = (t: Team) => t === 'red' ? 'Red' : 'Blue'

  return (
    <div className="cn-game">
      {/* Header */}
      <div className="cn-header">
        <div className="cn-header__scores">
          <span className="cn-score cn-score--red">{gs.redRemaining} Red</span>
          <span className="cn-header__sep">·</span>
          <span className="cn-score cn-score--blue">{gs.blueRemaining} Blue</span>
        </div>
        <div className={`cn-header__turn cn-header__turn--${gs.activeTeam}`}>
          {gs.phase === 'game-over'
            ? `${teamLabel(gs.winner!)} wins!${gs.winReason === 'assassin' ? ' (Assassin!)' : ''}`
            : gs.phase === 'waiting-for-clue'
              ? `${teamLabel(gs.activeTeam)}'s Spymaster — give a clue`
              : `${teamLabel(gs.activeTeam)} guessing`
          }
        </div>
        {gs.phase === 'guessing' && gs.currentClueWord && (
          <div className="cn-clue-display">
            Clue: <strong>{gs.currentClueWord}</strong> · {gs.currentClueCount}
            <span className="cn-clue-display__guesses"> ({gs.guessesLeft} guess{gs.guessesLeft !== 1 ? 'es' : ''} left)</span>
          </div>
        )}
        <div className="cn-header__role">
          {me && <span>{me.team === 'red' ? '🔴' : '🔵'} {me.name} — {me.isSpymaster ? 'Spymaster' : 'Operative'}</span>}
        </div>
      </div>

      <div className="cn-body">
        {/* Board */}
        <div className="cn-board">
          {gs.board.map((cell, i) => {
            const isClickable = canIGuess && !cell.revealed
            return (
              <button
                key={i}
                className={`cn-cell ${cellColor(cell)}${isClickable ? ' cn-cell--clickable' : ''}${cell.revealed ? ' cn-cell--revealed' : ''}`}
                onClick={() => isClickable && handlePickCard(i)}
                disabled={!isClickable}
              >
                <span className="cn-cell__word">{cell.word}</span>
                {cell.revealed && cell.team === 'assassin' && <span className="cn-cell__icon">💀</span>}
              </button>
            )
          })}
        </div>

        {/* Sidebar */}
        <div className="cn-sidebar">
          {/* Players */}
          <div className="cn-sidebar__section">
            <div className="cn-sidebar__heading">Players</div>
            {(['red', 'blue'] as Team[]).map((team) => (
              <div key={team} className={`cn-sidebar__team cn-sidebar__team--${team}`}>
                <span className="cn-sidebar__team-label">{teamLabel(team)}</span>
                {players.filter((p) => p.team === team).map((p) => (
                  <div key={p.peerId} className="cn-sidebar__player">
                    {p.name}{p.peerId === myPeerId ? ' ★' : ''}{p.isSpymaster ? ' 🕵️' : ''}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Controls */}
          {gs.phase !== 'game-over' && (
            <div className="cn-sidebar__section">
              {canIGiveClue && (
                <form className="cn-clue-form" onSubmit={handleGiveClue}>
                  <div className="cn-sidebar__heading">Give Clue</div>
                  <input
                    className="pvp-lobby__input"
                    type="text"
                    value={clueInput}
                    onChange={(e) => setClueInput(e.target.value)}
                    placeholder="One word…"
                    maxLength={32}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Count:</label>
                    <input
                      className="pvp-lobby__input"
                      type="number"
                      min={1}
                      max={9}
                      value={clueCountInput}
                      onChange={(e) => setClueCountInput(e.target.value)}
                      style={{ width: 60 }}
                    />
                    <button className="hol-btn" type="submit" disabled={!clueInput.trim()} style={{ padding: '0.3rem 0.875rem', fontSize: '0.875rem' }}>
                      Give Clue
                    </button>
                  </div>
                </form>
              )}
              {canIGuess && (
                <button className="pvp-lobby__copy-btn" onClick={handleEndTurn} style={{ marginTop: '0.5rem', width: '100%' }}>
                  End Turn
                </button>
              )}
              {!amIActiveTeam && gs.phase === 'waiting-for-clue' && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  Waiting for {teamLabel(gs.activeTeam)} Spymaster…
                </p>
              )}
              {!amIActiveTeam && gs.phase === 'guessing' && (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                  {teamLabel(gs.activeTeam)} is guessing…
                </p>
              )}
            </div>
          )}

          {gs.phase === 'game-over' && (
            <div className="cn-sidebar__section">
              <div className={`cn-winner cn-winner--${gs.winner}`}>
                {teamLabel(gs.winner!)} wins!
                {gs.winReason === 'assassin' && <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Assassin revealed!</div>}
              </div>
              <button className="hol-btn" style={{ marginTop: '1rem', width: '100%' }} onClick={handleBackToLobby}>
                Back to Lobby
              </button>
            </div>
          )}

          {/* Guess History */}
          {guessHistory.length > 0 && (
            <div className="cn-sidebar__section">
              <div className="cn-sidebar__heading">History</div>
              <div className="cn-history">
                {guessHistory.map((entry, i) => {
                  if (entry.kind === 'clue') {
                    return (
                      <div key={i} className="cn-history__clue">
                        <span className={`cn-history__dot cn-history__dot--${entry.team}`} />
                        <span className="cn-history__clue-text">
                          "{entry.clueWord}" <span className="cn-history__clue-count">({entry.clueCount})</span>
                        </span>
                      </div>
                    )
                  }
                  const isCorrect = entry.cellTeam === entry.pickerTeam
                  const resultText = isCorrect ? '✓'
                    : entry.cellTeam === 'assassin' ? '💀'
                    : entry.cellTeam === 'neutral' ? '—'
                    : entry.cellTeam === 'red' ? 'R' : 'B'
                  const resultColor = isCorrect ? '#22c55e'
                    : entry.cellTeam === 'assassin' ? '#9ca3af'
                    : entry.cellTeam === 'neutral' ? '#6b7280'
                    : entry.cellTeam === 'red' ? '#ef4444' : '#3b82f6'
                  return (
                    <div key={i} className="cn-history__entry">
                      <span className="cn-history__entry-word">{entry.cardWord}</span>
                      <span className="cn-history__entry-result" style={{ color: resultColor }}>{resultText}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="pvp-chat cn-sidebar__chat">
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
