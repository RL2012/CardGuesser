import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage } from '../src/multiplayer/errorMessage.ts'

test('returns the message of an Error', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom')
})

test('returns the message of an Error subclass, like PeerJS PeerError', () => {
  class PeerLike extends Error {}
  assert.equal(errorMessage(new PeerLike('lost')), 'lost')
})

test('returns a string as is', () => {
  assert.equal(errorMessage('plain'), 'plain')
})

test('does not throw on undefined', () => {
  assert.equal(errorMessage(undefined), 'undefined')
})
