import { useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'

const MAX_PLAYERS = 4

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  { urls: 'turn:openrelay.metered.ca:80',               username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443',              username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp',username: 'openrelayproject', credential: 'openrelayproject' },
]

interface PlayerInfo {
  peerId: string
  name: string
}

interface ChatMessage {
  id: number
  name: string  // empty = system message
  text: string
  self: boolean
}

// Non-host → host
type ToHostMsg =
  | { type: 'hello'; name: string; peerId: string }
  | { type: 'chat'; name: string; text: string }

// Host → non-host
type ToClientMsg =
  | { type: 'player-list'; players: PlayerInfo[] }
  | { type: 'player-joined'; player: PlayerInfo }
  | { type: 'player-left'; peerId: string; name: string }
  | { type: 'chat'; name: string; text: string }

type Phase = 'setup' | 'lobby' | 'room'

let chatIdSeq = 0

export default function PvpLobby() {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [myPeerId, setMyPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)
  const [players, setPlayers] = useState<PlayerInfo[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [hostLeft, setHostLeft] = useState(false)
  const [isHost, setIsHost] = useState(false)

  const peerRef = useRef<Peer | null>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const clientConnsRef = useRef<Map<string, DataConnection>>(new Map()) // host only
  const hostConnRef = useRef<DataConnection | null>(null)               // non-host only
  const playersRef = useRef<PlayerInfo[]>([])
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { return () => { peerRef.current?.destroy() } }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

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
    setChatMessages(prev => [...prev, { ...msg, id: chatIdSeq++ }])
  }

  // Host: relay a message to all clients, optionally skipping one
  function broadcast(msg: ToClientMsg, skipPeerId?: string) {
    clientConnsRef.current.forEach((conn, id) => {
      if (id !== skipPeerId) conn.send(msg)
    })
  }

  // Called by the host for each incoming client connection
  function wireClientConn(conn: DataConnection) {
    clientConnsRef.current.set(conn.peer, conn)

    conn.on('data', (raw) => {
      const msg = raw as ToHostMsg

      if (msg.type === 'hello') {
        // Send new player the current roster before adding them
        conn.send({ type: 'player-list', players: playersRef.current } satisfies ToClientMsg)
        const player: PlayerInfo = { peerId: msg.peerId, name: msg.name }
        addPlayer(player)
        broadcast({ type: 'player-joined', player } satisfies ToClientMsg, conn.peer)
        addChat({ name: '', text: `${msg.name} joined the room.`, self: false })
      }

      if (msg.type === 'chat') {
        // Relay to all other clients; host adds locally
        broadcast({ type: 'chat', name: msg.name, text: msg.text } satisfies ToClientMsg, conn.peer)
        addChat({ name: msg.name, text: msg.text, self: false })
      }
    })

    conn.on('close', () => {
      const leaving = playersRef.current.find(p => p.peerId === conn.peer)
      clientConnsRef.current.delete(conn.peer)
      removePlayer(conn.peer)
      if (leaving) {
        broadcast({ type: 'player-left', peerId: conn.peer, name: leaving.name } satisfies ToClientMsg)
        addChat({ name: '', text: `${leaving.name} left the room.`, self: false })
      }
    })

    conn.on('error', (err) => setPeerError(err.message))
  }

  // Called by a non-host when connecting to the host
  function wireHostConn(conn: DataConnection) {
    hostConnRef.current = conn

    conn.on('open', () => {
      conn.send({ type: 'hello', name: myNameRef.current, peerId: myPeerIdRef.current } satisfies ToHostMsg)
    })

    conn.on('data', (raw) => {
      const msg = raw as ToClientMsg

      if (msg.type === 'player-list') {
        playersRef.current = msg.players
        setPlayers([...msg.players])
      }
      if (msg.type === 'player-joined') {
        addPlayer(msg.player)
        addChat({ name: '', text: `${msg.player.name} joined the room.`, self: false })
      }
      if (msg.type === 'player-left') {
        removePlayer(msg.peerId)
        addChat({ name: '', text: `${msg.name} left the room.`, self: false })
      }
      if (msg.type === 'chat') {
        addChat({ name: msg.name, text: msg.text, self: false })
      }
    })

    conn.on('close', () => setHostLeft(true))
    conn.on('error', (err) => setPeerError(err.message))
  }

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    myNameRef.current = trimmed
    isHostRef.current = true
    setIsHost(true)

    const peer = new Peer({ config: { iceServers: ICE_SERVERS } })
    peerRef.current = peer

    peer.on('open', (id) => {
      myPeerIdRef.current = id
      setMyPeerId(id)
      setPhase('lobby')
    })

    peer.on('connection', (conn) => {
      if (!isHostRef.current) return
      if (playersRef.current.length >= MAX_PLAYERS - 1) { conn.close(); return }
      wireClientConn(conn)
      setPhase('room')
    })

    peer.on('error', (err) => setPeerError(err.message))
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id || !peerRef.current) return
    isHostRef.current = false
    setIsHost(false)
    wireHostConn(peerRef.current.connect(id))
    setPhase('room')
  }

  const handleCopy = () => {
    if (!myPeerId) return
    navigator.clipboard.writeText(myPeerId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const payload = { name: myNameRef.current, text }
    if (isHostRef.current) {
      broadcast({ type: 'chat', ...payload } satisfies ToClientMsg)
    } else {
      hostConnRef.current?.send({ type: 'chat', ...payload } satisfies ToHostMsg)
    }
    addChat({ ...payload, self: true })
    setChatInput('')
  }

  // ── Render: setup ──────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Player vs Player</h2>
        <form className="pvp-lobby__form" onSubmit={handleNameSubmit}>
          <label className="pvp-lobby__label" htmlFor="pvp-name">Your name</label>
          <input
            id="pvp-name"
            className="pvp-lobby__input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name…"
            maxLength={24}
            autoFocus
          />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>
            Continue
          </button>
        </form>
      </div>
    )
  }

  // ── Render: lobby ──────────────────────────────────────────────────────────
  if (phase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Lobby</h2>
        <p className="pvp-lobby__you">You: <strong>{name}</strong></p>

        {!myPeerId && <p className="pvp-lobby__hint">Connecting to network…</p>}

        {myPeerId && (
          <>
            <section className="pvp-lobby__section">
              <p className="pvp-lobby__label">Your game code — share with up to 3 friends:</p>
              <div className="pvp-lobby__id-row">
                <code className="pvp-lobby__id">{myPeerId}</code>
                <button className="pvp-lobby__copy-btn" onClick={handleCopy}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </section>

            <div className="pvp-lobby__divider">or</div>

            <section className="pvp-lobby__section">
              <form onSubmit={handleJoin}>
                <p className="pvp-lobby__label">Join a friend's game:</p>
                <div className="pvp-lobby__id-row">
                  <input
                    className="pvp-lobby__input pvp-lobby__input--wide"
                    type="text"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                    placeholder="Paste their game code…"
                  />
                  <button className="hol-btn" type="submit" disabled={!joinId.trim()}>
                    Join
                  </button>
                </div>
              </form>
            </section>
          </>
        )}

        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
      </div>
    )
  }

  // ── Render: room ───────────────────────────────────────────────────────────
  if (hostLeft) {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Host disconnected</h2>
        <p className="pvp-lobby__hint">The host left the room.</p>
        <button className="hol-btn" onClick={() => { setHostLeft(false); setPhase('lobby'); setPlayers([]); playersRef.current = []; setChatMessages([]) }}>
          Back to lobby
        </button>
      </div>
    )
  }

  const allPlayers: PlayerInfo[] = [
    { peerId: myPeerId ?? '', name },
    ...players,
  ]
  const isFull = allPlayers.length >= MAX_PLAYERS

  return (
    <div className="pvp-room">
      <aside className="pvp-room__sidebar">
        <h2 className="pvp-lobby__title">Room — {allPlayers.length}/{MAX_PLAYERS}</h2>

        {isHost && !isFull && myPeerId && (
          <div className="pvp-lobby__id-row">
            <code className="pvp-lobby__id">{myPeerId}</code>
            <button className="pvp-lobby__copy-btn" onClick={handleCopy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        <ul className="pvp-lobby__player-list">
          {allPlayers.map((p) => (
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
              <span className="pvp-lobby__dot" />
              <span>Waiting…</span>
            </li>
          ))}
        </ul>

        {isFull
          ? <p className="pvp-lobby__hint pvp-lobby__hint--ready">All players connected!</p>
          : <p className="pvp-lobby__hint">Waiting for players…</p>}

        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
      </aside>

      <div className="pvp-chat">
        <div className="pvp-chat__messages">
          {chatMessages.map((m) =>
            m.name ? (
              <div key={m.id} className={`pvp-chat__msg${m.self ? ' pvp-chat__msg--self' : ''}`}>
                <span className="pvp-chat__msg-name">{m.name}</span>
                <span className="pvp-chat__msg-text">{m.text}</span>
              </div>
            ) : (
              <div key={m.id} className="pvp-chat__msg pvp-chat__msg--system">{m.text}</div>
            )
          )}
          <div ref={chatEndRef} />
        </div>
        <form className="pvp-chat__input-row" onSubmit={handleSendChat}>
          <input
            className="pvp-chat__input"
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Say something…"
            maxLength={200}
          />
          <button className="pvp-lobby__copy-btn" type="submit" disabled={!chatInput.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
