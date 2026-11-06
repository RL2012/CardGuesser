/** Message for a connection 'error' event. PeerJS sends a PeerError; the relay transport has no fixed type. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
