import type { ReactNode, FormEvent } from 'react'
import type { PlayerInfo } from './shared'

export type LobbyPhase = 'setup' | 'name-entry' | 'lobby' | 'room' | 'game'

export interface ChatMessage {
  id: number
  name: string
  text: string
  self: boolean
}

export interface MultiplayerLobbyProps {
  // ── Identity ──
  title: string
  storageKey: string
  description?: string
  maxNameLength?: number

  // ── State (parent-owned) ──
  lobbyPhase: LobbyPhase
  onPhaseChange: (phase: LobbyPhase) => void
  name: string
  onNameChange: (name: string) => void
  myPeerId: string | null
  joinId: string
  onJoinIdChange: (id: string) => void
  copied: boolean
  peerError: string | null
  isHost: boolean
  players: PlayerInfo[]
  canStart: boolean
  maxPlayers: number

  // ── Actions ──
  onHost: (name: string) => void
  onJoin: () => void
  onCopy: () => void
  onStartGame?: () => void
  onLeaveRoom?: () => void

  // ── Chat ──
  chatMessages: ChatMessage[]
  chatInput: string
  onChatInputChange: (text: string) => void
  onSendChat: () => void

  // ── Slots ──
  roomChildren?: ReactNode
  lobbyChildren?: ReactNode
  copyLabel?: string
  joinLabel?: string
  joinPlaceholder?: string
}

export default function MultiplayerLobby(props: MultiplayerLobbyProps) {
  const {
    title, storageKey, description, maxNameLength = 24,
    lobbyPhase, onPhaseChange, name, onNameChange,
    myPeerId, joinId, onJoinIdChange, copied, peerError, isHost,
    players, canStart, maxPlayers, onHost, onJoin, onCopy, onStartGame, onLeaveRoom,
    chatMessages, chatInput, onChatInputChange, onSendChat,
    roomChildren, lobbyChildren, copyLabel, joinLabel, joinPlaceholder,
  } = props

  const copyBtnLabel = copyLabel ?? 'Your game code — share with up to {n} friends:'
  const joinLbl = joinLabel ?? "Join a friend's game:"
  const joinPh = joinPlaceholder ?? 'Paste their game code…'

  // ── setup ──
  if (lobbyPhase === 'setup') {
    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">{title}</h2>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        {description && <p className="pvp-lobby__hint">{description}</p>}
        <button
          className="hol-btn"
          onClick={() => onPhaseChange('name-entry')}
          style={{ marginTop: '1rem' }}
        >
          Play Multiplayer
        </button>
      </div>
    )
  }

  // ── name-entry ──
  if (lobbyPhase === 'name-entry') {
    const handleSubmit = (e: FormEvent) => {
      e.preventDefault()
      if (name.trim()) {
        localStorage.setItem(storageKey, name.trim())
        onHost(name.trim())
      }
    }

    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">{title} — Multiplayer</h2>
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <form className="pvp-lobby__form" onSubmit={handleSubmit}>
          <label className="pvp-lobby__label" htmlFor="ml-name">
            Your name
          </label>
          <input
            id="ml-name"
            className="pvp-lobby__input"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Enter your name…"
            maxLength={maxNameLength}
            autoFocus
          />
          <button className="hol-btn" type="submit" disabled={!name.trim()}>
            Continue
          </button>
        </form>
        <button
          className="pvp-lobby__copy-btn"
          onClick={() => onPhaseChange('setup')}
        >
          ← Back
        </button>
      </div>
    )
  }

  // ── lobby ──
  if (lobbyPhase === 'lobby') {
    const handleJoin = (e: FormEvent) => {
      e.preventDefault()
      onJoin()
    }

    return (
      <div className="pvp-lobby">
        <h2 className="pvp-lobby__title">{title}</h2>
        <p className="pvp-lobby__you">
          You: <strong>{name}</strong>
        </p>
        {!myPeerId && <p className="pvp-lobby__hint">Connecting to network…</p>}
        {myPeerId && (
          <>
            {isHost && (
              <section className="pvp-lobby__section">
                <p className="pvp-lobby__label">
                  {copyBtnLabel.replace('{n}', String(maxPlayers - 1))}
                </p>
                <div className="pvp-lobby__id-row">
                  <code className="pvp-lobby__id">{myPeerId}</code>
                  <button className="pvp-lobby__copy-btn" onClick={onCopy}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </section>
            )}
            <div className="pvp-lobby__divider">or</div>
            <section className="pvp-lobby__section">
              <form onSubmit={handleJoin}>
                <p className="pvp-lobby__label">{joinLbl}</p>
                <div className="pvp-lobby__id-row">
                  <input
                    className="pvp-lobby__input pvp-lobby__input--wide"
                    type="text"
                    value={joinId}
                    onChange={(e) => onJoinIdChange(e.target.value)}
                    placeholder={joinPh}
                  />
                  <button className="hol-btn" type="submit" disabled={!joinId.trim()}>
                    Join
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
        {lobbyChildren}
        {canStart && (
          <button className="hol-btn" onClick={onStartGame} style={{ width: '100%' }}>
            Start Game ({players.length + 1} {players.length === 0 ? 'player' : 'players'})
          </button>
        )}
        {peerError && <p className="pvp-lobby__error">{peerError}</p>}
        <button
          className="pvp-lobby__copy-btn"
          onClick={() => { onLeaveRoom?.(); onPhaseChange('setup') }}
        >
          ← Leave
        </button>
      </div>
    )
  }

  // ── room ──
  return (
    <div className="pvp-room">
      <div className="pvp-room__content">
        <ul className="pvp-lobby__player-list">
          {players.map((p) => (
            <li key={p.peerId} className="pvp-lobby__player-row">
              <span className="pvp-lobby__dot pvp-lobby__dot--online" />
              <span className="pvp-lobby__player-name">{p.name}</span>
              <span className="pvp-lobby__tag pvp-lobby__tag--host">HOST</span>
            </li>
          ))}
          {players.length === 0 && (
            <li className="pvp-lobby__player-row pvp-lobby__player-row--empty">
              Waiting for players…
            </li>
          )}
        </ul>
        {roomChildren}
        {canStart && onStartGame && (
          <button className="hol-btn" onClick={onStartGame} style={{ width: '100%', marginTop: '0.75rem' }}>
            Start Game ({players.length + 1} {players.length === 0 ? 'player' : 'players'})
          </button>
        )}
        {onLeaveRoom && (
          <button
            className="pvp-lobby__copy-btn"
            onClick={() => { onLeaveRoom(); onPhaseChange('setup') }}
            style={{ marginTop: '0.5rem', alignSelf: 'center' }}
          >
            ← Leave
          </button>
        )}
      </div>

      <div className="pvp-chat">
        <div className="pvp-chat__messages">
          {chatMessages.map((m) => (
            <div
              key={m.id}
              className={`pvp-chat__msg${
                m.name === 'System'
                  ? ' pvp-chat__msg--system'
                  : m.self
                    ? ' pvp-chat__msg--self'
                    : ''
              }`}
            >
              {m.name !== 'System' && (
                <span className="pvp-chat__msg-name">{m.name}</span>
              )}
              <span className="pvp-chat__msg-text">{m.text}</span>
            </div>
          ))}
        </div>
        <form className="pvp-chat__input-row" onSubmit={(e) => { e.preventDefault(); onSendChat() }}>
          <input
            className="pvp-chat__input"
            value={chatInput}
            onChange={(e) => onChatInputChange(e.target.value)}
            placeholder="Chat…"
          />
          <button className="hol-btn" type="submit" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
