import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shutDownLobby } from '../src/multiplayer/lobbyShutdown.ts'

function makeRefs(peer: { destroy(): void } | null) {
  return {
    peerRef: { current: peer },
    hostConnRef: { current: {} as unknown },
    clientConnsRef: { current: new Map<string, unknown>([['a', {}]]) },
    playersRef: { current: [{ id: 1 }] as unknown[] },
    inGameRef: { current: true },
  }
}

test('shutDownLobby empties the refs before destroying the peer', () => {
  let seen: Record<string, unknown> | null = null
  let calls = 0
  const refs = makeRefs(null)
  refs.peerRef.current = {
    destroy() {
      calls++
      seen = {
        players: refs.playersRef.current.length,
        conns: refs.clientConnsRef.current.size,
        peer: refs.peerRef.current,
        hostConn: refs.hostConnRef.current,
        inGame: refs.inGameRef.current,
      }
    },
  }
  shutDownLobby(refs)
  assert.equal(calls, 1)
  assert.deepEqual(seen, { players: 0, conns: 0, peer: null, hostConn: null, inGame: false })
})

test('shutDownLobby cancels the turn timer', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let fired = false
  const refs = { ...makeRefs(null), turnTimerRef: { current: null as ReturnType<typeof setTimeout> | null } }
  refs.turnTimerRef.current = setTimeout(() => {
    fired = true
  }, 1000)
  shutDownLobby(refs)
  t.mock.timers.tick(5000)
  assert.equal(fired, false)
  assert.equal(refs.turnTimerRef.current, null)
})

test('shutDownLobby copes with a null peer and no timer ref (solo)', () => {
  assert.doesNotThrow(() => shutDownLobby(makeRefs(null)))
})

test('a second shutDownLobby call does not destroy the peer again', () => {
  let calls = 0
  const refs = makeRefs({ destroy: () => calls++ })
  shutDownLobby(refs)
  shutDownLobby(refs)
  assert.equal(calls, 1)
})
