import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLocalPeer } from '../src/multiplayer/transport.ts'

// A WebSocket that never connects, like a relay that isn't running.
class SilentWebSocket {
  onopen: (() => void) | null = null
  onmessage: (() => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  send() {}
  close() {}
}

test('createLocalPeer reports an error when the relay never answers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(console, 'log', () => {})
  const original = globalThis.WebSocket
  globalThis.WebSocket = SilentWebSocket as unknown as typeof WebSocket
  t.after(() => {
    globalThis.WebSocket = original
  })

  const errors: Error[] = []
  const peer = createLocalPeer()
  peer.on('error', (err) => errors.push(err as Error))

  // Let the queued onOpen microtask run before the relay timeout is due.
  await Promise.resolve()
  t.mock.timers.tick(5_000)

  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /Could not connect to relay/)
  peer.destroy()
})

class RecordingWebSocket {
  static last: RecordingWebSocket
  log: string[] = []
  sent: { to: string; type: string }[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  constructor() {
    RecordingWebSocket.last = this
  }
  send(json: string) {
    const msg = JSON.parse(json)
    if (msg.type === 'register') return
    this.sent.push(msg)
    this.log.push(`send:${msg.type}`)
  }
  close() {
    this.log.push('close')
  }
}

test('destroy() sends conn-close to open connections before closing the socket', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(console, 'log', () => {})
  const original = globalThis.WebSocket
  globalThis.WebSocket = RecordingWebSocket as unknown as typeof WebSocket
  t.after(() => {
    globalThis.WebSocket = original
  })

  const peer = createLocalPeer()
  await Promise.resolve()
  const ws = RecordingWebSocket.last
  ws.onopen?.()

  const conn = peer.connect('remote')
  let closed = 0
  conn.on('close', () => closed++)
  ws.onmessage?.({
    data: JSON.stringify({ from: 'remote', to: peer.id, type: 'conn-accept', payload: null }),
  })
  assert.equal(conn.open, true)

  peer.destroy()

  assert.deepEqual(ws.log, ['send:conn-req', 'send:conn-close', 'close'])
  assert.equal(ws.sent[1].to, 'remote')
  assert.equal(closed, 1)

  peer.destroy()
  assert.deepEqual(ws.log, ['send:conn-req', 'send:conn-close', 'close', 'close'])
  assert.equal(closed, 1)
})
