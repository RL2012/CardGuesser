interface LobbyRefs {
  peerRef: { current: { destroy(): void } | null }
  hostConnRef: { current: unknown }
  clientConnsRef: { current: Map<string, unknown> }
  playersRef: { current: unknown[] }
  inGameRef: { current: boolean }
  turnTimerRef?: { current: ReturnType<typeof setTimeout> | null }
}

/** Stops a lobby on unmount: clears the turn timer and closes the peer so remote players get their `close` handling. */
export function shutDownLobby(refs: LobbyRefs) {
  refs.inGameRef.current = false
  // destroy() fires each connection's local 'close'. With these empty, the host's
  // handler finds no leaving player, so it can't broadcast or re-arm the turn timer.
  refs.playersRef.current = []
  refs.clientConnsRef.current.clear()
  refs.hostConnRef.current = null
  const peer = refs.peerRef.current
  refs.peerRef.current = null // stops a client's 'close' handler destroying it twice
  peer?.destroy()
  if (refs.turnTimerRef?.current != null) {
    clearTimeout(refs.turnTimerRef.current)
    refs.turnTimerRef.current = null
  }
}
