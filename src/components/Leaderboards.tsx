import { getLeaderboard } from '../services/leaderboard'

function LeaderTable({ entries }: { entries: ReturnType<typeof getLeaderboard> }) {
  return (
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
        {entries.length === 0 ? (
          <tr>
            <td colSpan={4} className="leaderboard-table__empty">
              No scores yet
            </td>
          </tr>
        ) : (
          entries.map((entry, i) => (
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
  )
}

export default function Leaderboards() {
  const boards: { title: string; entries: ReturnType<typeof getLeaderboard> }[] = [
    { title: 'Card Guesser', entries: getLeaderboard('cardGuesser') },
    { title: 'Higher or Lower — ATK', entries: getLeaderboard('higherOrLower') },
    { title: 'Higher or Lower — Price', entries: getLeaderboard('higherOrLowerPrice') },
    { title: 'Higher or Lower — Date', entries: getLeaderboard('higherOrLowerDate') },
    { title: 'Card Categories', entries: getLeaderboard('cardCategories') },
    { title: 'Connections', entries: getLeaderboard('connections') },
    { title: 'Chameleon', entries: getLeaderboard('chameleon') },
    { title: 'Card Wordle', entries: getLeaderboard('wordle') },
    { title: 'Trivia Blitz', entries: getLeaderboard('trivia') },
  ]

  return (
    <div className="lb-page">
      <h2 className="lb-page__title">Leaderboards</h2>
      <div className="leaderboard-grid">
        {boards.map((b) => (
          <section key={b.title} className="leaderboard-section">
            <h3 className="leaderboard-section__title">{b.title}</h3>
            <LeaderTable entries={b.entries} />
          </section>
        ))}
      </div>
    </div>
  )
}
