/**
 * Minimal WebSocket relay server for localhost multiplayer.
 * Both tabs (normal + private Firefox) connect here; the server forwards
 * WireMessage JSON payloads to the correct recipient by peer ID.
 *
 * Usage:  node scripts/relay-server.mjs [port]
 * Default port: 9001
 */

import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = parseInt(process.argv[2], 10) || 9001

// ── Health-check endpoint (optional: Vite or browser can ping) ─────────────

const httpServer = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('relay-server alive')
})

// ── WebSocket server ───────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer })

/**
 * Map peerId → WebSocket.
 * A single WebSocket connection may host multiple peerIds if the user
 * refreshes the page, but for simplicity we map 1:1.
 */
const peers = new Map()

wss.on('connection', (ws) => {
    let registeredPeerId = null

    ws.on('message', (raw) => {
        let msg
        try {
            msg = JSON.parse(raw.toString())
        } catch {
            return
        }

        // ── Registration ──────────────────────────────────────────────────
        // The first message from a peer must be { type: 'register', peerId }
        if (msg.type === 'register' && msg.peerId) {
            registeredPeerId = msg.peerId
            peers.set(msg.peerId, ws)
            console.log(`[relay] peer registered: ${msg.peerId.slice(0, 8)}…  (${peers.size} connected)`)
            return
        }

        // ── Relay ─────────────────────────────────────────────────────────
        if (msg.to && peers.has(msg.to)) {
            const target = peers.get(msg.to)
            if (target.readyState === 1) { // WebSocket.OPEN
                target.send(raw.toString())
            }
        }
    })

    ws.on('close', () => {
        if (registeredPeerId) {
            peers.delete(registeredPeerId)
            console.log(`[relay] peer left: ${registeredPeerId.slice(0, 8)}…  (${peers.size} remaining)`)
        }
    })

    ws.on('error', () => {
        // cleanup handled by 'close'
    })
})

// ── Start ──────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
    console.log(`[relay] WebSocket relay running on ws://localhost:${PORT}`)
})
