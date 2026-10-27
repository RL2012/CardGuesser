// ── Shared multiplayer constants and types ─────────────────────────────────
// Used by Card Categories, Codenames, Chameleon and Charades (and any future multiplayer game).

import Peer from 'peerjs'
import type { DataConnection } from 'peerjs'
import { createLocalPeer } from './transport'
import type { LocalConnection } from './transport'

export const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:443', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
]

export interface PlayerInfo { peerId: string; name: string }

export interface ChatMessage { id: number; name: string; text: string; self: boolean }

// Union type so wireClientConn / wireHostConn accept either transport
export type AnyDataConnection = DataConnection | LocalConnection

// The part of PeerJS's Peer the lobbies use. Both transports provide it.
export interface MultiplayerPeer {
  on(event: 'open', cb: (id: string) => void): void
  on(event: 'connection', cb: (conn: AnyDataConnection) => void): void
  on(event: 'error', cb: (err: Error) => void): void
  connect(peerId: string): AnyDataConnection
  destroy(): void
}

// On localhost use the WebSocket relay (scripts/relay-server.mjs) instead of
// PeerJS/WebRTC. Firefox private mode isolates mDNS ICE candidates and
// partitions BroadcastChannel, so both fail between normal + private tabs.
export function createPeer(): MultiplayerPeer {
  const isLocalDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  if (isLocalDev) {
    const local = createLocalPeer()
    return {
      on: (event: 'open' | 'connection' | 'error', cb: (arg: never) => void) =>
        local.on(event, cb as (...args: unknown[]) => void),
      connect: (peerId: string) => local.connect(peerId),
      destroy: () => local.destroy(),
    }
  }
  return new Peer({ config: { iceServers: ICE_SERVERS } })
}
