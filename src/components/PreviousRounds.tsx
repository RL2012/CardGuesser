import type { PreviousRound } from '../store/gameSlice'

interface Props {
  rounds: PreviousRound[]
}

export default function PreviousRounds({ rounds }: Props) {
  if (rounds.length === 0) return null

  return (
    <div className="previous-rounds">
      <h2>Previous Rounds:</h2>
      <ul className="round-list">
        {rounds.map((round, i) => (
          <li key={i} className="round-entry">
            <div className="round-thumbnail">
              <img
                src={`https://images.ygoprodeck.com/images/cards_cropped/${round.cardId}.jpg`}
                alt={round.cardName}
                className="round-thumbnail-img"
              />
            </div>
            <div className="round-info">
              <p className="round-info__name">{round.cardName}</p>
              {round.guessed ? (
                <p className="round-info__result round-info__result--correct">
                  Correct! +{round.pointsEarned} points
                </p>
              ) : (
                <p className="round-info__result round-info__result--wrong">
                  You did not guess the Card.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
