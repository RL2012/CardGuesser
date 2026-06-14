import { useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'

const MAX_PLAYERS = 4

interface PlayerInfo {
  peerId: string
  name: string
}

interface ChatMessage {
  id: number
  name: string
  text: string
  self: boolean
}

type Msg =
  | { type: 'hello'; name: string; peerId: string }
  | { type: 'player-list'; players: PlayerInfo[] }
  | { type: 'chat'; name: string; text: string }

type Phase = 'setup' | 'lobby' | 'room'

let chatIdCounter = 0

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

  const peerRef = useRef<Peer | null>(null)
  const myNameRef = useRef('')
  const myPeerIdRef = useRef('')
  const isHostRef = useRef(false)
  const connsRef = useRef<Map<string, DataConnection>>(new Map())
  const playersRef = useRef<PlayerInfo[]>([])
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    return () => { peerRef.current?.destroy() }
  }, [])

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  function addPlayer(info: PlayerInfo) {
    if (playersRef.current.some(p => p.peerId === info.peerId)) return
    playersRef.current = [...playersRef.current, info]
    setPlayers([...playersRef.current])
  }

  function removePlayer(peerId: string) {
    const leaving = playersRef.current.find(p => p.peerId === peerId)
    connsRef.current.delete(peerId)
    playersRef.current = playersRef.current.filter(p => p.peerId !== peerId)
    setPlayers([...playersRef.current])
    if (leaving) {
      setChatMessages(prev => [...prev, {
        id: chatIdCounter++,
        name: '',
        text: `${leaving.name} left the room.`,
        self: false,
      }])
    }
  }

  function wireConn(conn: DataConnection) {
    if (connsRef.current.has(conn.peer)) return
    connsRef.current.set(conn.peer, conn)

    conn.on('open', () => {
      conn.send({ type: 'hello', name: myNameRef.current, peerId: myPeerIdRef.current } satisfies Msg)
    })

    conn.on('data', (raw) => {
      const msg = raw as Msg

      if (msg.type === 'hello') {
        addPlayer({ peerId: msg.peerId, name: msg.name })
        setChatMessages(prev => [...prev, {
          id: chatIdCounter++,
          name: '',
          text: `${msg.name} joined the room.`,
          self: false,
        }])

        if (isHostRef.current) {
          const others = playersRef.current.filter(p => p.peerId !== msg.peerId)
          conn.send({ type: 'player-list', players: others } satisfies Msg)
        }
      }

      if (msg.type === 'player-list') {
        msg.players.forEach(info => {
          if (!connsRef.current.has(info.peerId) && info.peerId !== myPeerIdRef.current) {
            wireConn(peerRef.current!.connect(info.peerId))
          }
        })
      }

      if (msg.type === 'chat') {
        setChatMessages(prev => [...prev, {
          id: chatIdCounter++,
          name: msg.name,
          text: msg.text,
          self: false,
        }])
      }
    })

    conn.on('close', () => removePlayer(conn.peer))
    conn.on('error', (err) => {
      setPeerError(err.message)
      removePlayer(conn.peer)
    })
  }

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    myNameRef.current = trimmed
    isHostRef.current = true

    const peer = new Peer()
    peerRef.current = peer

    peer.on('open', (id) => {
      myPeerIdRef.current = id
      setMyPeerId(id)
      setPhase('lobby')
    })

    peer.on('connection', (conn) => {
      if (playersRef.current.length >= MAX_PLAYERS - 1) {
        conn.close()
        return
      }
      wireConn(conn)
      setPhase('room')
    })

    peer.on('error', (err) => setPeerError(err.message))
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id || !peerRef.current) return
    isHostRef.current = false
    wireConn(peerRef.current.connect(id))
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
    const msg: Msg = { type: 'chat', name: myNameRef.current, text }
    connsRef.current.forEach(conn => conn.send(msg))
    setChatMessages(prev => [...prev, {
      id: chatIdCounter++,
      name: myNameRef.current,
      text,
      self: true,
    }])
    setChatInput('')
  }

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

  if (phase === 'lobby') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">Lobby</h2>
        <p className="pvp-lobby__you">You: <strong>{myNameRef.current}</strong></p>

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

  // room phase
  const allPlayers: PlayerInfo[] = [
    { peerId: myPeerIdRef.current, name: myNameRef.current },
    ...players,
  ]
  const isFull = allPlayers.length >= MAX_PLAYERS

  return (
    <div className="pvp-room">
      {/* Left: player list */}
      <aside className="pvp-room__sidebar">
        <h2 className="pvp-lobby__title">Room — {allPlayers.length}/{MAX_PLAYERS}</h2>

        {isHostRef.current && !isFull && myPeerId && (
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
                {p.peerId === myPeerIdRef.current && (
                  <span className="pvp-lobby__tag"> you</span>
                )}
                {isHostRef.current && p.peerId === myPeerIdRef.current && (
                  <span className="pvp-lobby__tag pvp-lobby__tag--host"> host</span>
                )}
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

        {isFull ? (
          <p className="pvp-lobby__hint pvp-lobby__hint--ready">All players connected!</p>
        ) : (
          <p className="pvp-lobby__hint">Waiting for players…</p>
        )}

        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
      </aside>

      {/* Right: chat */}
      <div className="pvp-chat">
        <div className="pvp-chat__messages">
          {chatMessages.map((m) => (
            m.name
              ? (
                <div key={m.id} className={`pvp-chat__msg${m.self ? ' pvp-chat__msg--self' : ''}`}>
                  <span className="pvp-chat__msg-name">{m.name}</span>
                  <span className="pvp-chat__msg-text">{m.text}</span>
                </div>
              )
              : (
                <div key={m.id} className="pvp-chat__msg pvp-chat__msg--system">
                  {m.text}
                </div>
              )
          ))}
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
