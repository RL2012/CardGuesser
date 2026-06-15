import { getLeaderboard } from '../leaderboard'

interface Props {
  onPlay: (game: 'card-guesser' | 'higher-or-lower') => void
}

export default function Homepage({ onPlay }: Props) {
  const cgBoard = getLeaderboard('cardGuesser')
  const holBoard = getLeaderboard('higherOrLower')

  return (
    <div className="homepage">
      <div className="leaderboard-grid">
        <section className="leaderboard-section">
          <h2 className="leaderboard-section__title">Card Guesser</h2>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Score</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {cgBoard.length === 0 ? (
                <tr>
                  <td colSpan={4} className="leaderboard-table__empty">No scores yet</td>
                </tr>
              ) : (
                cgBoard.map((entry, i) => (
                  <tr key={i} className={i === 0 ? 'leaderboard-table__row--gold' : ''}>
                    <td className="leaderboard-table__rank">{i + 1}</td>
                    <td>{entry.name}</td>
                    <td className="leaderboard-table__score">{entry.score}</td>
                    <td className="leaderboard-table__date">{entry.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <button className="hol-btn leaderboard-section__play-btn" onClick={() => onPlay('card-guesser')}>
            Play Card Guesser
          </button>
        </section>

        <section className="leaderboard-section">
          <h2 className="leaderboard-section__title">Higher or Lower</h2>
          <table className="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Score</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {holBoard.length === 0 ? (
                <tr>
                  <td colSpan={4} className="leaderboard-table__empty">No scores yet</td>
                </tr>
              ) : (
                holBoard.map((entry, i) => (
                  <tr key={i} className={i === 0 ? 'leaderboard-table__row--gold' : ''}>
                    <td className="leaderboard-table__rank">{i + 1}</td>
                    <td>{entry.name}</td>
                    <td className="leaderboard-table__score">{entry.score}</td>
                    <td className="leaderboard-table__date">{entry.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <button className="hol-btn leaderboard-section__play-btn" onClick={() => onPlay('higher-or-lower')}>
            Play Higher or Lower
          </button>
        </section>
      </div>
    </div>
  )
}
