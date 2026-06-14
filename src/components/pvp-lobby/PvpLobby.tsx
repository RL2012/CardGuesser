import { useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'

type Phase = 'setup' | 'lobby' | 'connected'

interface NameMsg {
  type: 'name'
  name: string
}

export default function PvpLobby() {
  const [name, setName] = useState('')
  const [phase, setPhase] = useState<Phase>('setup')
  const [peerId, setPeerId] = useState<string | null>(null)
  const [joinId, setJoinId] = useState('')
  const [opponentName, setOpponentName] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [peerError, setPeerError] = useState<string | null>(null)

  const peerRef = useRef<Peer | null>(null)
  // capture name at submit time so connection callbacks always have a stable value
  const myNameRef = useRef('')

  useEffect(() => {
    return () => {
      peerRef.current?.destroy()
    }
  }, [])

  function attachHandlers(conn: DataConnection) {
    conn.on('open', () => {
      conn.send({ type: 'name', name: myNameRef.current } satisfies NameMsg)
    })
    conn.on('data', (raw) => {
      const msg = raw as NameMsg
      if (msg.type === 'name') {
        setOpponentName(msg.name)
        setPhase('connected')
      }
    })
    conn.on('error', (err) => {
      setPeerError(err.message)
    })
  }

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    myNameRef.current = trimmed

    const peer = new Peer()
    peerRef.current = peer

    peer.on('open', (id) => {
      setPeerId(id)
      setPhase('lobby')
    })

    peer.on('connection', (conn) => {
      attachHandlers(conn)
    })

    peer.on('error', (err) => {
      setPeerError(err.message)
    })
  }

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const id = joinId.trim()
    if (!id || !peerRef.current) return
    const conn = peerRef.current.connect(id)
    attachHandlers(conn)
  }

  const handleCopy = () => {
    if (!peerId) return
    navigator.clipboard.writeText(peerId).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
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

        {!peerId && <p className="pvp-lobby__hint">Connecting to network…</p>}

        {peerId && (
          <>
            <section className="pvp-lobby__section">
              <p className="pvp-lobby__label">Your game code — share this with your opponent:</p>
              <div className="pvp-lobby__id-row">
                <code className="pvp-lobby__id">{peerId}</code>
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

  // connected
  return (
    <div className="pvp-lobby pvp-lobby--connected">
      <h2 className="pvp-lobby__title">Both players connected!</h2>
      <div className="pvp-lobby__players">
        <div className="pvp-lobby__player pvp-lobby__player--you">
          <span className="pvp-lobby__player-label">You</span>
          <span className="pvp-lobby__player-name">{myNameRef.current}</span>
        </div>
        <span className="pvp-lobby__vs">VS</span>
        <div className="pvp-lobby__player pvp-lobby__player--opponent">
          <span className="pvp-lobby__player-label">Opponent</span>
          <span className="pvp-lobby__player-name">{opponentName}</span>
        </div>
      </div>
      <p className="pvp-lobby__hint">Game coming soon…</p>
    </div>
  )
}
