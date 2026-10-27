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
