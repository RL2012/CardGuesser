import { getLeaderboard } from '../services/leaderboard'

interface Props {
  onPlay: (game: 'card-guesser' | 'higher-or-lower' | 'card-categories') => void
}

export default function Homepage({ onPlay }: Props) {
  const cgBoard = getLeaderboard('cardGuesser')
  const holBoard = getLeaderboard('higherOrLower')
  const ccBoard = getLeaderboard('cardCategories')

  return (
    <div className="homepage">
      <div className="homepage-modes">
        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">🎴</span>
            <h2 className="game-mode-card__title">Card Guesser</h2>
          </div>
          <p className="game-mode-card__desc">
            A random card is shown zoomed into a cropped section. Type the name to guess it — the sooner you guess (at higher zoom) the more points you earn. Each wrong guess costs points. 60 seconds per card, 15-minute challenge.
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('card-guesser')}>
            Play
          </button>
        </div>

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">⬆⬇</span>
            <h2 className="game-mode-card__title">Higher or Lower</h2>
          </div>
          <p className="game-mode-card__desc">
            Two face-down monster cards are revealed. Guess which has the higher ATK stat. Keep a streak going — every 3 correct answers in a row earns a bonus life. You start with 3 lives.
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('higher-or-lower')}>
            Play
          </button>
        </div>

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">🃏</span>
            <h2 className="game-mode-card__title">Card Categories</h2>
          </div>
          <p className="game-mode-card__desc">
            A category is announced — like "LIGHT Warriors" or "Forbidden Effect Monsters". Name any cards that match it. Play solo to score points per round (3 lives), or host a real-time multiplayer room where the last player standing wins.
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('card-categories')}>
            Play
          </button>
        </div>
      </div>

      <h2 className="homepage__leaderboards-heading">Leaderboards</h2>

      <div className="leaderboard-grid">
        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Card Guesser</h3>
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
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Higher or Lower</h3>
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
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Card Categories</h3>
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
              {ccBoard.length === 0 ? (
                <tr>
                  <td colSpan={4} className="leaderboard-table__empty">No scores yet</td>
                </tr>
              ) : (
                ccBoard.map((entry, i) => (
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
        </section>
      </div>
    </div>
  )
}
