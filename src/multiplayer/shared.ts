// ── Shared multiplayer constants and types ─────────────────────────────────
// Used by Card Categories and Codenames (and any future multiplayer game).

import type { DataConnection } from 'peerjs'
import type { LocalConnection } from './transport'

export const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:443', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
  { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: '990207c305e0623bfa241d3c', credential: 'FaaoXWv8/duyAdvu' },
]

export interface PlayerInfo { peerId: string; name: string }

// Union type so wireClientConn / wireHostConn accept either transport
export type AnyDataConnection = DataConnection | LocalConnection
