interface Props {
  onPlay: (game: string) => void
}

export default function Homepage({ onPlay }: Props) {
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
            <span className="game-mode-card__icon">🟩</span>
            <h2 className="game-mode-card__title">Card Wordle</h2>
          </div>
          <p className="game-mode-card__desc">
            Guess the secret Yu-Gi-Oh! card in 6 tries. Each guess reveals how its properties — Attribute, Type, Race, Archetype, Level, ATK, DEF, and Banlist status — match the target with colour-coded hints.
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('wordle')}>
            Play
          </button>
        </div>

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">⚡</span>
            <h2 className="game-mode-card__title">Trivia Blitz</h2>
          </div>
          <p className="game-mode-card__desc">
            Rapid-fire Yu-Gi-Oh! trivia. Answer questions about card attributes, archetypes, races, types, banlist statuses, and ATK comparisons. Build streaks for bonus points and answer fast for extra time bonuses.
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('trivia')}>
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

        <div className="game-mode-card">
          <div className="game-mode-card__header">
            <span className="game-mode-card__icon">⛓️</span>
            <h2 className="game-mode-card__title">Chain Link</h2>
          </div>
          <p className="game-mode-card__desc">
            Multiplayer chain-building game. Players take turns naming a Yu-Gi-Oh! card that shares a property — attribute, race, archetype, or type — with the previous card. Break the chain and lose a life. Last player standing wins!
          </p>
          <button className="hol-btn game-mode-card__btn" onClick={() => onPlay('chain-link')}>
            Play
          </button>
        </div>
      </div>
    </div>
  )
}
