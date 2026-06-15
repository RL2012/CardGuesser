// ── WebSocket relay transport for localhost multiplayer ────────────────────
//
// Firefox private mode partitions BroadcastChannel, making it invisible
// between normal + private tabs.  WebSocket connections to a local relay
// server (ws://localhost:9001) work because they are plain TCP connections
// not subject to storage partitioning.
//
// The relay server (scripts/relay-server.mjs) just forwards JSON payloads
// to the correct recipient peerId.
//
// The API mirrors PeerJS's Peer / DataConnection so it can be a drop-in
// replacement in the multiplayer lobby code.

const RELAY_URL = 'ws://localhost:9001'
const CONN_TIMEOUT = 8_000
const WS_TIMEOUT = 5_000

// ── Debug logging ───────────────────────────────────────────────────────────

let _dbgSeq = 0
function dbg(tag: string, msg: string, data?: unknown) {
  console.log(`[LT:${++_dbgSeq}] ${tag} | ${msg}`, data ?? '')
}

// ── Wire protocol ────────────────────────────────────────────────────────────

interface WireMessage {
  from: string
  to: string
  type: 'conn-req' | 'conn-accept' | 'conn-close' | 'data'
  payload?: unknown
}

// ── LocalConnection (mimics PeerJS DataConnection) ──────────────────────────

type ConnCallback = (...args: unknown[]) => void

export class LocalConnection {
  /** Remote peer ID (mimics DataConnection.peer) */
  readonly peer: string
  /** Whether the connection is established (mimics DataConnection.open) */
  open = false
  /** Underlying RTCPeerConnection for duck-typing compatibility */
  peerConnection: null = null

  private sendFn: (type: WireMessage['type'], payload: unknown) => void
  private callbacks: Record<string, ConnCallback> = {}

  constructor(
    _localPeerId: string,
    remotePeerId: string,
    sendFn: (type: WireMessage['type'], payload: unknown) => void,
  ) {
    this.peer = remotePeerId
    this.sendFn = sendFn
  }

  on(event: 'open' | 'data' | 'close' | 'error', cb: ConnCallback): void {
    this.callbacks[event] = cb
    if (event === 'open' && this.open) {
      dbg('conn', `on('open') registered late, firing → peer=${this.peer.slice(0, 8)}`)
      cb()
    }
  }

  off(): void {
    // noop
  }

  send(data: unknown): void {
    dbg(
      'conn',
      `send() → peer=${this.peer.slice(0, 8)} type=${(data as Record<string, unknown>)?.type ?? typeof data}`,
    )
    this.sendFn('data', data)
  }

  close(): void {
    if (!this.open) return
    this.open = false
    this.sendFn('conn-close', undefined)
    this.callbacks['close']?.()
  }

  // ── Internal ────────────────────────────────────────────────────────────

  _open(): void {
    if (this.open) return
    this.open = true
    dbg('conn', `_open() → peer=${this.peer.slice(0, 8)}`)
    this.callbacks['open']?.()
  }

  _handle(msg: WireMessage): void {
    if (msg.type === 'data') {
      dbg(
        'conn',
        `recv data → peer=${msg.from.slice(0, 8)} type=${(msg.payload as Record<string, unknown>)?.type ?? typeof msg.payload}`,
      )
      this.callbacks['data']?.(msg.payload)
    } else if (msg.type === 'conn-close') {
      dbg('conn', `recv conn-close → peer=${msg.from.slice(0, 8)}`)
      this.open = false
      this.callbacks['close']?.()
    }
  }
}

// ── LocalPeer (mimics PeerJS Peer) ─────────────────────────────────────────

export interface LocalPeerInstance {
  id: string
  on: (event: 'open' | 'connection' | 'error', cb: (...args: unknown[]) => void) => void
  connect: (peerId: string) => LocalConnection
  destroy: () => void
}

export function createLocalPeer(): LocalPeerInstance {
  const peerId = crypto.randomUUID()
  const shortId = peerId.slice(0, 8)

  dbg('peer', `createLocalPeer() → id=${shortId}`)

  let ws: WebSocket | null = null
  let wsOpen = false
  const pendingWrites: string[] = []

  const peers = new Map<string, LocalConnection>()

  let onOpen: ((id: string) => void) | null = null
  let onConnection: ((conn: LocalConnection) => void) | null = null
  let onError: ((err: Error) => void) | null = null

  // ── Send helper (buffers until WebSocket is open) ───────────────────────

  function sendMsg(from: string, to: string, type: WireMessage['type'], payload: unknown) {
    const json = JSON.stringify({ from, to, type, payload } satisfies WireMessage)
    if (wsOpen && ws) {
      ws.send(json)
    } else {
      pendingWrites.push(json)
    }
  }

  function flushPending() {
    if (!ws) return
    for (const json of pendingWrites) ws.send(json)
    pendingWrites.length = 0
  }

  // ── Connect to relay ────────────────────────────────────────────────────

  function connectWs() {
    ws = new WebSocket(RELAY_URL)

    ws.onopen = () => {
      dbg('ws', `connected to relay`)
      wsOpen = true
      ws!.send(JSON.stringify({ type: 'register', peerId }))
      flushPending()
    }

    ws.onmessage = (ev: MessageEvent<string>) => {
      let msg: WireMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }

      dbg('ws', `recv from=${msg.from.slice(0, 8)} to=${msg.to.slice(0, 8)} type=${msg.type}`)

      if (msg.to !== peerId) return

      try {
        switch (msg.type) {
          case 'conn-req': {
            dbg('ws', `→ accepting connection from ${msg.from.slice(0, 8)}`)
            const conn = new LocalConnection(peerId, msg.from, (t, p) =>
              sendMsg(peerId, msg.from, t, p),
            )
            peers.set(msg.from, conn)
            conn._open()
            onConnection?.(conn)
            sendMsg(peerId, msg.from, 'conn-accept', null)
            break
          }

          case 'conn-accept': {
            const conn = peers.get(msg.from)
            if (conn && !conn.open) {
              dbg('ws', `→ opening pending connection to ${msg.from.slice(0, 8)}`)
              conn._open()
            } else {
              dbg('ws', `→ conn-accept ignored (conn=${!!conn}, open=${conn?.open})`)
            }
            break
          }

          default: {
            const conn = peers.get(msg.from)
            if (conn) conn._handle(msg)
            else dbg('ws', `→ dropped (no peer entry for ${msg.from.slice(0, 8)})`)
            break
          }
        }
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error(String(e)))
      }
    }

    ws.onerror = () => {
      dbg('ws', `error — relay not reachable at ${RELAY_URL}`)
      onError?.(
        new Error(`WebSocket connection to relay failed. Make sure the relay server is running.`),
      )
    }

    ws.onclose = () => {
      dbg('ws', `disconnected from relay`)
      wsOpen = false
    }
  }

  connectWs()

  // Timeout: if relay isn't reachable within WS_TIMEOUT, show error
  const wsTimeout = setTimeout(() => {
    if (!wsOpen) {
      onError?.(new Error(`Could not connect to relay at ${RELAY_URL} within ${WS_TIMEOUT}ms.`))
    }
  }, WS_TIMEOUT)

  // Fire open on next tick so the caller has time to register the handler
  queueMicrotask(() => {
    dbg('peer', `firing onOpen → id=${shortId}`)
    clearTimeout(wsTimeout)
    onOpen?.(peerId)
  })

  // ── Exported API ─────────────────────────────────────────────────────────

  return {
    id: peerId,
    on(event: 'open' | 'connection' | 'error', cb: (...args: unknown[]) => void) {
      if (event === 'open') onOpen = cb as (id: string) => void
      else if (event === 'connection') onConnection = cb as (conn: LocalConnection) => void
      else if (event === 'error') onError = cb as (err: Error) => void
    },
    connect(targetPeerId: string) {
      dbg('peer', `connect() → target=${targetPeerId.slice(0, 8)}`)
      const conn = new LocalConnection(peerId, targetPeerId, (t, p) =>
        sendMsg(peerId, targetPeerId, t, p),
      )
      peers.set(targetPeerId, conn)
      sendMsg(peerId, targetPeerId, 'conn-req', null)

      setTimeout(() => {
        const c = peers.get(targetPeerId)
        if (c && !c.open) {
          peers.delete(targetPeerId)
          dbg('peer', `connect() → TIMEOUT`)
          onError?.(new Error(`Connection to ${targetPeerId} timed out.`))
        }
      }, CONN_TIMEOUT)

      return conn
    },
    destroy() {
      dbg('peer', `destroy()`)
      clearTimeout(wsTimeout)
      ws?.close()
      peers.clear()
    },
  }
}
