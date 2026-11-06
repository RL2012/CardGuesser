import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// Game modes load as separate chunks. Without this, one failed chunk request
// unmounts the whole app. React.lazy keeps the rejection, so only a reload retries.
export default class GameLoadBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <p className="status-message status-message--error">
          This game failed to load. Check your connection and reload the page.
        </p>
      )
    }
    return this.props.children
  }
}
