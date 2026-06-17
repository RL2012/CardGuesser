import { getLeaderboard } from '../services/leaderboard'

interface Props {
  onPlay: (game: 'card-guesser' | 'higher-or-lower' | 'card-categories' | 'codenames' | 'connections' | 'chameleon') => void
}

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
            <td colSpan={4} className="leaderboard-table__empty">No scores yet</td>
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

export default function Homepage({ onPlay }: Props) {
  const cgBoard = getLeaderboard('cardGuesser')
  const holBoard = getLeaderboard('higherOrLower')
  const holPriceBoard = getLeaderboard('higherOrLowerPrice')
  const holDateBoard = getLeaderboard('higherOrLowerDate')
  const ccBoard = getLeaderboard('cardCategories')
  const cxnBoard = getLeaderboard('connections')
  const chBoard = getLeaderboard('chameleon')

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
            Two cards are shown side by side. Pick which has the higher ATK, which printing costs more on TCGPlayer, or which card was released more recently in the TCG. Keep a streak going for bonus points. You start with 3 lives.
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

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">🕵️</span>
            <h2 className="game-mode-card__title">Codenames</h2>
          </div>
          <p className="game-mode-card__desc">
            Multiplayer Codenames with a Yu-Gi-Oh! twist. Two teams compete — Spymasters give one-word clues linking multiple cards on the 5×5 board. Operatives click matching cards to claim them. Avoid the assassin or you lose instantly!
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('codenames')}>
            Play
          </button>
        </div>

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">🔗</span>
            <h2 className="game-mode-card__title">Connections</h2>
          </div>
          <p className="game-mode-card__desc">
            Find four groups of four Yu-Gi-Oh! cards that share something in common — an archetype, a summoning type, an attribute, or a ban-list status. You have four mistakes before it's game over.
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('connections')}>
            Play
          </button>
        </div>

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">🦎</span>
            <h2 className="game-mode-card__title">Chameleon</h2>
          </div>
          <p className="game-mode-card__desc">
            Multiplayer social deduction. One player is the secret Chameleon who doesn't know the hidden card — everyone else does. Take turns saying one word to prove you know it, then vote out the imposter!
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('chameleon')}>
            Play
          </button>
        </div>
      </div>

      <h2 className="homepage__leaderboards-heading">Leaderboards</h2>

      <div className="leaderboard-grid">
        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Card Guesser</h3>
          <LeaderTable entries={cgBoard} />
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Higher or Lower — ATK</h3>
          <LeaderTable entries={holBoard} />
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Higher or Lower — Price</h3>
          <LeaderTable entries={holPriceBoard} />
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Higher or Lower — Date</h3>
          <LeaderTable entries={holDateBoard} />
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Card Categories</h3>
          <LeaderTable entries={ccBoard} />
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Connections</h3>
          <LeaderTable entries={cxnBoard} />
        </section>

        <section className="leaderboard-section">
          <h3 className="leaderboard-section__title">Chameleon</h3>
          <LeaderTable entries={chBoard} />
        </section>
      </div>
    </div>
  )
}
