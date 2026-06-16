import { useAppDispatch, useAppSelector } from '../../hooks/hooks'
import { zoomOut } from '../../store/gameSlice'
import { formatTime } from '../../utils/utils'

const ZOOM_LEVELS = [5, 4, 3, 2, 1] as const

interface Props {
  onSkip: () => void
  onReplace: () => void
}

export default function CardDisplay({ onSkip, onReplace }: Props) {
  const dispatch = useAppDispatch()
  const { currentCard, cropX, cropY, zoomLevel, cardTimeLeft, challengeTimeLeft, totalPoints, isActive } =
    useAppSelector((s) => s.game)

  const imgStyle = {
    width: `${zoomLevel * 100}%`,
    height: `${zoomLevel * 100}%`,
    left: `${-cropX * (zoomLevel - 1) * 100}%`,
    top: `${-cropY * (zoomLevel - 1) * 100}%`,
  }

  return (
    <div className="card-display">
      <div className="card-image-area">
        {currentCard ? (
          <img
            key={currentCard.id}
            src={`https://images.ygoprodeck.com/images/cards_cropped/${currentCard.id}.jpg`}
            alt={currentCard.name}
            className="card-image"
            style={imgStyle}
            draggable={false}
            onError={onReplace}
          />
        ) : (
          <div className="card-image-placeholder" />
        )}
      </div>

      <div className="zoom-controls">
        {ZOOM_LEVELS.map((level) => {
          const isPast = level > zoomLevel
          const isActiveLevel = level === zoomLevel
          const isNext = level === zoomLevel - 1

          return (
            <button
              key={level}
              className={[
                'zoom-btn',
                isActiveLevel ? 'zoom-btn--active' : '',
                isPast || (!isActiveLevel && !isNext) ? 'zoom-btn--past' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={isNext ? () => dispatch(zoomOut()) : undefined}
            >
              Zoom {level}
            </button>
          )
        })}
        <button className="zoom-btn zoom-btn--giveup" onClick={onSkip} disabled={!isActive || zoomLevel > 1}>
          Give up
        </button>
      </div>

      <div className="game-info">
        <span>Next card in: {formatTime(cardTimeLeft)}</span>
        <span>Challenge ends in {formatTime(challengeTimeLeft)}</span>
        <span>Current Points: {totalPoints}</span>
      </div>
    </div>
  )
}
