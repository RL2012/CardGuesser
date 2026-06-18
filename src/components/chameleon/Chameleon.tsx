import { useRef, useState, useCallback, useEffect, type ReactElement } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import { useAppSelector } from '../../hooks/hooks'
import { createLocalPeer } from '../../multiplayer/transport'
import type { LocalConnection } from '../../multiplayer/transport'
import {
  ICE_SERVERS,
  MAX_PLAYERS_CH,
  MIN_PLAYERS_CH,
  type AnyDataConnection,
  type ChameleonPlayer,
  type ChatMessage,
  type PlayerWord,
  type ChameleonGameState,
  type ToHostMsg,
  type ToClientMsg,
} from './chameleonTypes'
import { addScore } from '../../services/leaderboard'

const STORAGE_KEY = 'ch-player-name'

const INIT_GAME: ChameleonGameState = {
  round: 0,
  totalRounds: 3,
  phase: 'reveal',
  topic: '',
  secretWord: '',
  gridWords: [],
  secretWordIndex: -1,
  chameleonId: '',
  words: [],
  votes: [],
  chameleonGuess: null,
  chameleonCorrect: null,
  currentSpeakerIndex: 0,
  speakingOrder: [],
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

// ── Topic/secret word generation from card data ────────────────────────────

type CardLike = { frameType: string; attribute: string; race: string; atk: number | null; level: number; name: string; views: number }

function makeTopics(): { label: string; filter: (c: CardLike) => boolean }[] {
  return [
    { label: 'DARK monsters', filter: (c) => c.attribute === 'DARK' },
    { label: 'LIGHT monsters', filter: (c) => c.attribute === 'LIGHT' },
    { label: 'FIRE monsters', filter: (c) => c.attribute === 'FIRE' },
    { label: 'WATER monsters', filter: (c) => c.attribute === 'WATER' },
    { label: 'EARTH monsters', filter: (c) => c.attribute === 'EARTH' },
    { label: 'WIND monsters', filter: (c) => c.attribute === 'WIND' },
    { label: 'DRAGON monsters', filter: (c) => c.race === 'Dragon' },
    { label: 'SPELLCASTER monsters', filter: (c) => c.race === 'Spellcaster' },
    { label: 'WARRIOR monsters', filter: (c) => c.race === 'Warrior' },
    { label: 'FIEND monsters', filter: (c) => c.race === 'Fiend' },
    { label: 'ZOMBIE monsters', filter: (c) => c.race === 'Zombie' },
    { label: 'MACHINE monsters', filter: (c) => c.race === 'Machine' },
    { label: 'Normal Monsters', filter: (c) => c.frameType === 'normal' },
    { label: 'Effect Monsters', filter: (c) => c.frameType === 'effect' },
    { label: 'Fusion Monsters', filter: (c) => c.frameType === 'fusion' },
    { label: 'Synchro Monsters', filter: (c) => c.frameType === 'synchro' },
    { label: 'XYZ Monsters', filter: (c) => c.frameType === 'xyz' },
    { label: 'Link Monsters', filter: (c) => c.frameType === 'link' },
    { label: 'Level 4 monsters', filter: (c) => c.level === 4 },
    { label: 'Level 7+ monsters', filter: (c) => c.level >= 7 },
  ]
}

export default function Chameleon(): ReactElement {
  const { cards } = useAppSelector((s) => s.cards)

  const [name, setName] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [lobbyPhase, setLobbyPhase] = useState<LobbyPhase>('setup')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [players, setPlayers] = useState<ChameleonPlayer[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [gameState, setGameState] = useState<ChameleonGameState>(INIT_GAME)
  const [myWord, setMyWord] = useState('')
  const [myTurn, setMyTurn] = useState(false)

  // ── Refs ────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const peerRef = useRef<any>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const clientConnsRef = useRef<Map<string, AnyDataConnection>>(new Map())
  const hostConnRef = useRef<AnyDataConnection | null>(null)
  const playersRef = useRef<ChameleonPlayer[]>([])
  const gameStateRef = useRef<ChameleonGameState>(INIT_GAME)
  const inGameRef = useRef(false)
  const cardsRef = useRef(cards)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const roundFinalizedRef = useRef(false)

  useEffect(() => { cardsRef.current = cards }, [cards])

  function addChat(msg: Omit<ChatMessage, 'id'>) {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: chatIdSeq++ }]
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 0)
      return next
    })
  }

  // ── Network helpers ─────────────────────────────────────────────────────

  function broadcast(msg: ToClientMsg, skipPeerId?: string) {
    clientConnsRef.current.forEach((conn, id) => {
      if (id !== skipPeerId) conn.send(msg)
    })
  }

  function broadcastAndApply(msg: ToClientMsg) {
    broadcast(msg)
    applyMsg(msg)
  }

  // ── Host: topic generation ──────────────────────────────────────────────

  function generateTopicAndWord(): { topic: string; gridWords: string[]; secretWordIndex: number; secretWord: string } {
    const monsters = cardsRef.current.filter((c) => c.atk !== null) as unknown as CardLike[]
    const topics = makeTopics()
    const chosen = topics[Math.floor(Math.random() * topics.length)]
    const matching = monsters.filter(chosen.filter)
    if (matching.length < 16) return generateTopicAndWord()
    const top100 = [...matching].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 100)
    const grid = shuffle(top100).slice(0, 16).map((c) => c.name)
    const secretWordIndex = Math.floor(Math.random() * 16)
    return { topic: chosen.label, gridWords: grid, secretWordIndex, secretWord: grid[secretWordIndex] }
  }

  // ── Host: game logic ────────────────────────────────────────────────────

  function hostStartGame() {
    setPeerError(null)
    const totalRounds = Math.min(playersRef.current.length, 4)
    inGameRef.current = true
    const gs = { ...INIT_GAME, totalRounds }
    gameStateRef.current = gs
    setGameState(gs)
    broadcast({ type: 'game-started', totalRounds })
    setLobbyPhase('game')
    setTimeout(() => hostStartRound(), 600)
  }

  function hostStartRound() {
    roundFinalizedRef.current = false
    const { topic, gridWords, secretWordIndex, secretWord } = generateTopicAndWord()
    const playerIds = playersRef.current.map((p) => p.peerId)
    const chameleonId = playerIds[Math.floor(Math.random() * playerIds.length)]
    const speakingOrder = shuffle(playerIds)

    clientConnsRef.current.forEach((conn, peerId) => {
      conn.send({
        type: 'round-started',
        topic,
        yourRole: peerId === chameleonId ? 'chameleon' : 'player',
        secretWord: peerId === chameleonId ? '' : secretWord,
        gridWords,
        secretWordIndex: peerId === chameleonId ? -1 : secretWordIndex,
        speakingOrder,
      } satisfies ToClientMsg)
    })

    const hostIsChameleon = myPeerIdRef.current === chameleonId
    applyMsg({
      type: 'round-started',
      topic,
      yourRole: hostIsChameleon ? 'chameleon' : 'player',
      secretWord: hostIsChameleon ? '' : secretWord,
      gridWords,
      secretWordIndex: hostIsChameleon ? -1 : secretWordIndex,
      speakingOrder,
    })

    const gs: ChameleonGameState = {
      ...gameStateRef.current,
      round: gameStateRef.current.round + 1,
      phase: 'speaking',
      topic,
      secretWord,
      gridWords,
      secretWordIndex,
      chameleonId,
      words: [],
      votes: [],
      chameleonGuess: null,
      chameleonCorrect: null,
      currentSpeakerIndex: 0,
      speakingOrder,
      winner: null,
    }
    gameStateRef.current = gs
    setGameState(gs)
    setMyWord('')
    setMyTurn(speakingOrder[0] === myPeerIdRef.current)
  }

  function hostHandleWord(peerId: string, word: string) {
    const gs = gameStateRef.current
    if (gs.phase !== 'speaking') return
    const currentSpeaker = gs.speakingOrder[gs.currentSpeakerIndex]
    if (currentSpeaker !== peerId) return

    const player = playersRef.current.find((p) => p.peerId === peerId)
    if (!player) return
    const pw: PlayerWord = { peerId, name: player.name, word }

    const words = [...gs.words, pw]
    const nextIndex = gs.currentSpeakerIndex + 1
    const order = gs.speakingOrder

    broadcastAndApply({ type: 'word-submitted', peerId, name: player.name, word })

    if (nextIndex >= order.length) {
      const updated: ChameleonGameState = { ...gs, words, phase: 'speaking', currentSpeakerIndex: nextIndex }
      gameStateRef.current = updated
      setGameState(updated)
      setMyTurn(false)
      broadcastAndApply({ type: 'speaking-done', words })
      setTimeout(() => hostStartVoting(), 1500)
      return
    }

    const nextSpeakerId = order[nextIndex]
    const nextName = playersRef.current.find((p) => p.peerId === nextSpeakerId)?.name ?? ''
    const next: ChameleonGameState = { ...gs, words, currentSpeakerIndex: nextIndex }
    gameStateRef.current = next
    setGameState(next)
    setMyTurn(myPeerIdRef.current === nextSpeakerId)

    if (nextSpeakerId !== myPeerIdRef.current) {
      clientConnsRef.current.get(nextSpeakerId)?.send({
        type: 'your-turn',
        speakerName: nextName,
      } satisfies ToClientMsg)
    }
  }

  function hostStartVoting() {
    const gs = gameStateRef.current
    const updated: ChameleonGameState = { ...gs, phase: 'voting', votes: [] }
    gameStateRef.current = updated
    setGameState(updated)
    broadcastAndApply({ type: 'voting-started' })
  }

  function hostHandleVote(voterId: string, targetId: string) {
    const gs = gameStateRef.current
    if (gs.phase !== 'voting') return
    if (gs.votes.some((v) => v.voterId === voterId)) return

    const votes = [...gs.votes, { voterId, targetId }]
    broadcastAndApply({ type: 'vote-cast', voterId })

    if (votes.length >= playersRef.current.length) {
      const updated: ChameleonGameState = { ...gs, votes, phase: 'results' }
      gameStateRef.current = updated
      setGameState(updated)
      broadcastAndApply({
        type: 'voting-done',
        votes,
        chameleonId: gs.chameleonId,
        secretWord: gs.secretWord,
        gridWords: gs.gridWords,
        secretWordIndex: gs.secretWordIndex,
      })
    } else {
      const updated: ChameleonGameState = { ...gs, votes }
      gameStateRef.current = updated
      setGameState(updated)
    }
  }

  function hostHandleChameleonGuess(peerId: string, guess: string) {
    const gs = gameStateRef.current
    if (peerId !== gs.chameleonId) return
    const lowered = guess.trim().toLowerCase()
    const correct = lowered === gs.secretWord.trim().toLowerCase()
    const updated: ChameleonGameState = { ...gs, chameleonGuess: guess, chameleonCorrect: correct }
    gameStateRef.current = updated
    setGameState(updated)
    broadcastAndApply({ type: 'chameleon-guess-result', correct, guess })
  }

  function hostFinishRound() {
    if (roundFinalizedRef.current) return
    roundFinalizedRef.current = true

    const gs = gameStateRef.current
    const wasChameleonCaught =
      gs.votes.filter((v) => v.targetId === gs.chameleonId).length >
      gs.votes.filter((v) => v.targetId !== gs.chameleonId).length

    const chameleonWins = !wasChameleonCaught || gs.chameleonCorrect === true

    const updatedPlayers = playersRef.current.map((p) => {
      if (chameleonWins && p.peerId === gs.chameleonId) return { ...p, score: p.score + 3 }
      if (!chameleonWins && p.peerId !== gs.chameleonId) return { ...p, score: p.score + 1 }
      return p
    })

    playersRef.current = updatedPlayers
    setPlayers([...updatedPlayers])

    broadcastAndApply({ type: 'round-over', scores: updatedPlayers })

    if (gs.round >= gs.totalRounds) {
      setTimeout(() => {
        const sorted = [...updatedPlayers].sort((a, b) => b.score - a.score)
        broadcastAndApply({ type: 'game-over', scores: sorted })
        const top = sorted[0]
        if (top && top.peerId === myPeerIdRef.current) {
          addScore('chameleon', myNameRef.current, top.score)
        }
      }, 2000)
    } else {
      setTimeout(() => hostStartRound(), 2500)
    }
  }

  // ── Client: apply messages from host ────────────────────────────────────

  function applyMsg(msg: ToClientMsg) {
    if (msg.type === 'welcome') {
      playersRef.current = msg.players
      setPlayers([...msg.players])
      return
    }
    if (msg.type === 'player-joined') {
      const exists = playersRef.current.find((p) => p.peerId === msg.player.peerId)
      if (!exists) {
        playersRef.current = [...playersRef.current, msg.player]
      }
      setPlayers([...playersRef.current])
      addChat({ name: '', text: `${msg.player.name} joined.`, self: false })
      return
    }
    if (msg.type === 'player-left') {
      playersRef.current = playersRef.current.filter((p) => p.peerId !== msg.peerId)
      setPlayers([...playersRef.current])
      addChat({ name: '', text: `${msg.name} left.`, self: false })
      return
    }
    if (msg.type === 'chat') {
      addChat({ name: msg.name, text: msg.text, self: false })
      return
    }
    if (msg.type === 'game-started') {
      const gs = { ...INIT_GAME, totalRounds: msg.totalRounds }
      gameStateRef.current = gs
      setGameState(gs)
      setLobbyPhase('game')
      return
    }
    if (msg.type === 'round-started') {
      const gs: ChameleonGameState = {
        ...gameStateRef.current,
        phase: 'speaking',
        topic: msg.topic,
        secretWord: msg.secretWord,
        gridWords: msg.gridWords,
        secretWordIndex: msg.secretWordIndex,
        chameleonId: '',
        words: [],
        votes: [],
        chameleonGuess: null,
        chameleonCorrect: null,
        currentSpeakerIndex: 0,
        speakingOrder: msg.speakingOrder,
        winner: null,
      }
      gameStateRef.current = gs
      setGameState(gs)
      setMyWord('')
      setMyTurn(msg.speakingOrder[0] === myPeerIdRef.current)
      return
    }
    if (msg.type === 'your-turn') {
      setMyTurn(true)
      return
    }
    if (msg.type === 'word-submitted') {
      const gs = gameStateRef.current
      gameStateRef.current = {
        ...gs,
        words: [...gs.words, { peerId: msg.peerId, name: msg.name, word: msg.word }],
        currentSpeakerIndex: gs.currentSpeakerIndex + 1,
      }
      setGameState(gameStateRef.current)
      setMyTurn(false)
      return
    }
    if (msg.type === 'speaking-done') {
      const gs = gameStateRef.current
      gameStateRef.current = { ...gs, words: msg.words }
      setGameState(gameStateRef.current)
      setMyTurn(false)
      return
    }
    if (msg.type === 'voting-started') {
      const gs = gameStateRef.current
      gameStateRef.current = { ...gs, phase: 'voting', votes: [] }
      setGameState(gameStateRef.current)
      return
    }
    if (msg.type === 'vote-cast') {
      const gs = gameStateRef.current
      const existing = gs.votes.filter((v) => v.voterId !== msg.voterId)
      gameStateRef.current = { ...gs, votes: [...existing, { voterId: msg.voterId, targetId: '' }] }
      setGameState(gameStateRef.current)
      return
    }
    if (msg.type === 'voting-done') {
      const gs = gameStateRef.current
      gameStateRef.current = {
        ...gs,
        phase: 'results',
        votes: msg.votes,
        chameleonId: msg.chameleonId,
        secretWord: msg.secretWord,
        gridWords: msg.gridWords,
        secretWordIndex: msg.secretWordIndex,
      }
      setGameState(gameStateRef.current)
      roundFinalizedRef.current = false
      return
    }
    if (msg.type === 'chameleon-guess-result') {
      const gs = gameStateRef.current
      gameStateRef.current = { ...gs, chameleonGuess: msg.guess, chameleonCorrect: msg.correct }
      setGameState(gameStateRef.current)
      return
    }
    if (msg.type === 'round-over') {
      playersRef.current = msg.scores
      setPlayers([...msg.scores])
      return
    }
    if (msg.type === 'game-over') {
      playersRef.current = msg.scores
      setPlayers([...msg.scores])
      const gs = { ...gameStateRef.current, winner: msg.scores[0]?.name ?? null }
      gameStateRef.current = gs
      setGameState(gs)
      const me = msg.scores.find((p) => p.peerId === myPeerIdRef.current)
      if (me && me.score > 0) {
        addScore('chameleon', myNameRef.current, me.score)
      }
      return
    }
    if (msg.type === 'back-to-lobby') {
      inGameRef.current = false
      gameStateRef.current = INIT_GAME
      setGameState(INIT_GAME)
      setLobbyPhase('room')
      setMyWord('')
      setMyTurn(false)
      return
    }
    if (msg.type === 'player-disconnected-reset') {
      inGameRef.current = false
      gameStateRef.current = INIT_GAME
      setGameState(INIT_GAME)
      setLobbyPhase('room')
      addChat({ name: '', text: `${msg.name} disconnected. The game has been reset.`, self: false })
      setMyWord('')
      setMyTurn(false)
      return
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────

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
    setPlayers([])
    setChatMessages([])
    setMyPeerId(null)
    setPeerError(null)
    setIsHost(false)
    isHostRef.current = false
    setMyWord('')
    setMyTurn(false)
  }

  // ── Network wiring ──────────────────────────────────────────────────────

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
        const newPlayer: ChameleonPlayer = { peerId: conn.peer, name: msg.name, score: 0 }
        playersRef.current = [...playersRef.current, newPlayer]
        setPlayers([...playersRef.current])
        conn.send({ type: 'welcome', players: playersRef.current } satisfies ToClientMsg)
        broadcast({ type: 'player-joined', player: newPlayer } satisfies ToClientMsg, conn.peer)
        addChat({ name: '', text: `${msg.name} joined the room.`, self: false })
      }
      if (msg.type === 'submit-word') hostHandleWord(conn.peer, msg.word)
      if (msg.type === 'submit-vote') hostHandleVote(conn.peer, msg.targetId)
      if (msg.type === 'chameleon-guess') hostHandleChameleonGuess(conn.peer, msg.word)
      if (msg.type === 'ready-for-next') hostFinishRound()
      if (msg.type === 'chat') {
        broadcast({ type: 'chat', name: msg.name, text: msg.text } satisfies ToClientMsg, conn.peer)
        addChat({ name: msg.name, text: msg.text, self: false })
      }
    })

    conn.on('close', () => {
      const leaving = playersRef.current.find((p) => p.peerId === conn.peer)
      clientConnsRef.current.delete(conn.peer)
      if (leaving) {
        if (inGameRef.current) {
          inGameRef.current = false
          gameStateRef.current = INIT_GAME
          setGameState(INIT_GAME)
          setLobbyPhase('room')
          broadcast({ type: 'player-disconnected-reset', name: leaving.name } satisfies ToClientMsg)
          addChat({ name: '', text: `${leaving.name} disconnected. The game has been reset.`, self: false })
        } else {
          playersRef.current = playersRef.current.filter((p) => p.peerId !== conn.peer)
          setPlayers([...playersRef.current])
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

  // ── UI handlers ─────────────────────────────────────────────────────────

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
    const payload = { name: myNameRef.current, text }
    if (isHostRef.current) broadcast({ type: 'chat', ...payload })
    else hostConnRef.current?.send({ type: 'chat', ...payload } satisfies ToHostMsg)
    addChat({ ...payload, self: true })
    setChatInput('')
  }

  function handleStartGame() {
    if (!isHostRef.current) return
    const total = playersRef.current.length
    if (total < MIN_PLAYERS_CH) {
      setPeerError(`Need at least ${MIN_PLAYERS_CH} players to start.`)
      return
    }
    hostStartGame()
  }

  function handleSubmitWord(e: React.FormEvent) {
    e.preventDefault()
    const word = myWord.trim()
    if (!word) return
    if (isHostRef.current) {
      hostHandleWord(myPeerIdRef.current, word)
    } else {
      hostConnRef.current?.send({ type: 'submit-word', word } satisfies ToHostMsg)
    }
    setMyWord('')
  }

  function handleSubmitVote(peerId: string) {
    if (isHostRef.current) {
      hostHandleVote(myPeerIdRef.current, peerId)
    } else {
      hostConnRef.current?.send({ type: 'submit-vote', targetId: peerId } satisfies ToHostMsg)
    }
  }

  function handleChameleonGuess(e: React.FormEvent) {
    e.preventDefault()
    const word = myWord.trim()
    if (!word) return
    if (isHostRef.current) {
      hostHandleChameleonGuess(myPeerIdRef.current, word)
    } else {
      hostConnRef.current?.send({ type: 'chameleon-guess', word } satisfies ToHostMsg)
    }
    setMyWord('')
  }

  function handleReadyForNext() {
    if (isHostRef.current) {
      hostFinishRound()
    } else {
      hostConnRef.current?.send({ type: 'ready-for-next' } satisfies ToHostMsg)
    }
  }

  function handleBackToLobby() {
    inGameRef.current = false
    gameStateRef.current = INIT_GAME
    setGameState(INIT_GAME)
    setMyWord('')
    setMyTurn(false)
    if (isHostRef.current) {
      broadcast({ type: 'back-to-lobby' })
    }
    setLobbyPhase('room')
  }

  // ── Derived state ───────────────────────────────────────────────────────

  const gs = gameState
  const amIChameleon = gs.chameleonId === myPeerId
  const iHaveVoted = gs.votes.some((v) => v.voterId === myPeerId)
  const chameleonPlayer = players.find((p) => p.peerId === gs.chameleonId)
  const chameleonWasCaught =
    gs.votes.filter((v) => v.targetId === gs.chameleonId).length >
    gs.votes.filter((v) => v.targetId !== gs.chameleonId).length
  const myVoteTarget = gs.votes.find((v) => v.voterId === myPeerId)?.targetId
  const needsChameleonGuess = amIChameleon && chameleonWasCaught && gs.chameleonGuess === null
  const resultsReady =
    gs.phase === 'results' &&
    (!needsChameleonGuess || gs.chameleonGuess !== null) &&
    !roundFinalizedRef.current

  // ── Render ──────────────────────────────────────────────────────────────

  if (lobbyPhase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chameleon</h2>
        <p className="pvp-lobby__hint">
          One player is the secret Chameleon who doesn't know the hidden card — everyone else knows the card. Take turns saying one word to prove you know it, then vote out the imposter!
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
        const hostPlayer: ChameleonPlayer = { peerId: id, name: n, score: 0 }
        playersRef.current = [hostPlayer]
        setPlayers([hostPlayer])
      })
      peer.on('connection', (conn: AnyDataConnection | LocalConnection) => {
        if (!isHostRef.current || clientConnsRef.current.size >= MAX_PLAYERS_CH - 1) {
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
        <h2 className="pvp-lobby__title">Chameleon — Enter Name</h2>
        <form className="pvp-lobby__form" onSubmit={(e) => { e.preventDefault(); handleNameContinue() }}>
          <label className="pvp-lobby__label" htmlFor="ch-name">Your name</label>
          <input
            id="ch-name"
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
        <button className="pvp-lobby__copy-btn" onClick={() => setLobbyPhase('setup')}>Back</button>
      </div>
    )
  }

  if (lobbyPhase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Chameleon</h2>
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
        <button className="pvp-lobby__copy-btn" onClick={() => { resetToSetup(); setLobbyPhase('setup') }}>Back</button>
      </div>
    )
  }

  if (lobbyPhase === 'room') {
    const total = players.length
    const canStart = isHost && total >= MIN_PLAYERS_CH

    return (
      <div className="pvp-room" style={{ flexDirection: 'column', maxWidth: 680 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Chameleon — Lobby</h2>
          <button className="pvp-lobby__copy-btn" onClick={resetToSetup}>Leave</button>
        </div>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <p className="pvp-lobby__hint">
          Code: <code style={{ userSelect: 'all' }}>{myPeerId}</code>
          {' '}<button className="pvp-lobby__copy-btn" onClick={() => {
            if (myPeerId) navigator.clipboard.writeText(myPeerId).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
          }}>{copied ? 'Copied!' : 'Copy'}</button>
        </p>

        <ul className="pvp-lobby__player-list">
          {players.map((p) => (
            <li key={p.peerId} className="pvp-lobby__player-row">
              <span className="pvp-lobby__dot pvp-lobby__dot--online" />
              <span className="pvp-lobby__player-name">{p.name}{p.peerId === myPeerId ? ' (you)' : ''}</span>
              {p.score > 0 && <span className="pvp-lobby__tag">{p.score} pts</span>}
            </li>
          ))}
          {players.length === 0 && <li className="pvp-lobby__player-row pvp-lobby__player-row--empty">No players yet</li>}
        </ul>

        {isHost && (
          <>
            <button className="hol-btn" style={{ marginTop: '1rem' }} disabled={!canStart} onClick={handleStartGame}>
              Start Game
            </button>
            {!canStart && (
              <p className="pvp-lobby__hint" style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Need at least {MIN_PLAYERS_CH} players to start
                {total > 0 && ` — ${total} player${total !== 1 ? 's' : ''} so far`}
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

  // ── Game view ──────────────────────────────────────────────────────────

  return (
    <div className="ch-game">
      <div className="ch-header">
        <div className="ch-header__round">
          Round {gs.round} / {gs.totalRounds}
        </div>
        <div className="ch-header__topic">
          Topic: <strong>{gs.topic}</strong>
        </div>
        {/* 4x4 word grid */}
        {gs.gridWords.length === 16 && (
          <div className="ch-grid">
            {gs.gridWords.map((word, i) => {
              const isSecret = i === gs.secretWordIndex
              const showSecret = !amIChameleon || gs.phase === 'results'
              return (
                <div
                  key={i}
                  className={`ch-grid__cell${showSecret && isSecret ? ' ch-grid__cell--secret' : ''}`}
                >
                  {word}
                </div>
              )
            })}
          </div>
        )}
        {gs.phase === 'reveal' && (
          <div className="ch-header__role">
            {amIChameleon
              ? "You are the Chameleon! You don't know which word is the secret."
              : `The secret word is highlighted above.`
            }
          </div>
        )}
        {gs.phase !== 'reveal' && !amIChameleon && (
          <div className="ch-header__role ch-header__role--secret">
            You know the secret word — give good clues!
          </div>
        )}
        {gs.phase !== 'reveal' && amIChameleon && (
          <div className="ch-header__role">
            You are the <strong>Chameleon</strong> — blend in!
          </div>
        )}
      </div>

      <div className="ch-body">
        <div className="ch-main">
          {/* Reveal phase */}
          {gs.phase === 'reveal' && (
            <div className="ch-phase-panel">
              <p className="ch-phase-panel__desc">
                {amIChameleon
                  ? 'You are the Chameleon. Study the 16 words above and pay attention to what others say — try to blend in!'
                  : 'The secret word is highlighted in the grid above. Take turns saying one word that relates to it.'}
              </p>
            </div>
          )}

          {/* Speaking phase */}
          {gs.phase === 'speaking' && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Speaking Phase</h3>
              <div className="ch-words-list">
                {gs.words.map((pw, i) => (
                  <div key={i} className="ch-word-entry">
                    <span className="ch-word-entry__name">{pw.name}</span>
                    <span className="ch-word-entry__word">"{pw.word}"</span>
                  </div>
                ))}
                {myTurn && (
                  <form className="ch-word-form" onSubmit={handleSubmitWord}>
                    <input
                      className="pvp-lobby__input"
                      type="text"
                      value={myWord}
                      onChange={(e) => setMyWord(e.target.value)}
                      placeholder="Say one word…"
                      maxLength={32}
                      autoFocus
                    />
                    <button className="hol-btn" type="submit" disabled={!myWord.trim()}>
                      Submit
                    </button>
                  </form>
                )}
                {!myTurn && gs.words.length < players.length && (
                  <p className="ch-waiting">
                    Waiting for {gs.speakingOrder[gs.currentSpeakerIndex]
                      ? players.find((p) => p.peerId === gs.speakingOrder[gs.currentSpeakerIndex])?.name ?? 'next player'
                      : 'next player'} to speak…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Voting phase */}
          {gs.phase === 'voting' && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Vote — Who is the Chameleon?</h3>
              <div className="ch-vote-grid">
                {players.map((p) => (
                  <button
                    key={p.peerId}
                    className={`ch-vote-btn${iHaveVoted ? ' ch-vote-btn--disabled' : ''}${myVoteTarget === p.peerId ? ' ch-vote-btn--selected' : ''}`}
                    onClick={() => !iHaveVoted && handleSubmitVote(p.peerId)}
                    disabled={iHaveVoted}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              {iHaveVoted && <p className="ch-waiting">Vote submitted! Waiting for others…</p>}
              {!iHaveVoted && <p className="ch-waiting">Click a player name to vote</p>}
            </div>
          )}

          {/* Results phase */}
          {gs.phase === 'results' && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Results</h3>

              <div className="ch-reveal">
                <p className="ch-reveal__secret">The secret word was: <strong>{gs.secretWord}</strong></p>
                <p className="ch-reveal__chameleon">
                  The Chameleon was: <strong className="ch-reveal__chameleon-name">{chameleonPlayer?.name ?? 'Unknown'}</strong>
                </p>
                {!amIChameleon && (
                  <p className="ch-reveal__result">
                    {chameleonWasCaught ? 'The Chameleon was caught!' : 'The Chameleon got away!'}
                  </p>
                )}
              </div>

              {/* Vote breakdown */}
              <div className="ch-vote-breakdown" style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {players.map((p) => {
                  const votesFor = gs.votes.filter((v) => v.targetId === p.peerId).length
                  return <div key={p.peerId}>{p.name}: {votesFor} vote{votesFor !== 1 ? 's' : ''}</div>
                })}
              </div>

              {/* Chameleon guess */}
              {needsChameleonGuess && (
                <form className="ch-word-form" onSubmit={handleChameleonGuess} style={{ marginTop: '1rem' }}>
                  <p className="ch-waiting">You were caught! Guess the secret word to still win:</p>
                  <input
                    className="pvp-lobby__input"
                    type="text"
                    value={myWord}
                    onChange={(e) => setMyWord(e.target.value)}
                    placeholder="Guess the secret word…"
                    maxLength={64}
                    autoFocus
                  />
                  <button className="hol-btn" type="submit" disabled={!myWord.trim()}>Guess</button>
                </form>
              )}

              {gs.chameleonGuess !== null && (
                <p className={`ch-guess-result${gs.chameleonCorrect ? ' ch-guess-result--correct' : ' ch-guess-result--wrong'}`}>
                  {amIChameleon ? 'Your' : `${chameleonPlayer?.name ?? 'Chameleon'}'s`} guess: "{gs.chameleonGuess}"
                  {gs.chameleonCorrect ? ' — Correct!' : ' — Wrong!'}
                </p>
              )}

              {resultsReady && (
                <div className="ch-round-winner">
                  {(!chameleonWasCaught || gs.chameleonCorrect)
                    ? 'The Chameleon wins the round!'
                    : 'The players win the round!'}
                </div>
              )}

              {/* Scores */}
              <div className="ch-scores" style={{ marginTop: '1rem' }}>
                {[...players].sort((a, b) => b.score - a.score).map((p) => (
                  <div key={p.peerId} className="ch-score-row">
                    <span className="ch-score-row__name">{p.name}{p.peerId === myPeerId ? ' (you)' : ''}</span>
                    <span className="ch-score-row__pts">{p.score} pts</span>
                  </div>
                ))}
              </div>

              {/* Next/Finish button — host only */}
              {isHost && gs.winner === null && resultsReady && (
                <button className="hol-btn" style={{ marginTop: '1rem' }} onClick={handleReadyForNext}>
                  {gs.round < gs.totalRounds ? 'Next Round' : 'Finish Game'}
                </button>
              )}
              {!isHost && gs.winner === null && resultsReady && (
                <p className="ch-waiting">Waiting for host to continue…</p>
              )}
            </div>
          )}

          {/* Game over */}
          {gs.winner !== null && (
            <div className="ch-phase-panel">
              <h3 className="ch-phase-panel__title">Game Over!</h3>
              <p className="ch-winner">
                Winner: <strong>{gs.winner}</strong>
              </p>
              <div className="ch-scores" style={{ marginTop: '1rem' }}>
                {[...players].sort((a, b) => b.score - a.score).map((p) => (
                  <div key={p.peerId} className="ch-score-row">
                    <span className="ch-score-row__name">{p.name}{p.peerId === myPeerId ? ' (you)' : ''}</span>
                    <span className="ch-score-row__pts">{p.score} pts</span>
                  </div>
                ))}
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
            {players.map((p) => (
              <div key={p.peerId} className="ch-sidebar__player">
                {p.name}{p.peerId === myPeerId ? ' ★' : ''} — {p.score} pts
              </div>
            ))}
          </div>

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
              <button className="hol-btn" type="submit" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
