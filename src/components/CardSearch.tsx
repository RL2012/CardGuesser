import Fuse from 'fuse.js'
import { useMemo, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  cardNames: string[]
  onGuess: (name: string) => void
  disabled?: boolean
}

export default function CardSearch({ cardNames, onGuess, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 80)
    return () => clearTimeout(id)
  }, [query])

  const fuse = useMemo(
    () => new Fuse(cardNames, { threshold: 0.35, minMatchCharLength: 2, distance: 200 }),
    [cardNames],
  )

  const results = useMemo(() => {
    if (debouncedQuery.length < 2) return []
    return fuse.search(debouncedQuery, { limit: 10 }).map((r) => r.item)
  }, [fuse, debouncedQuery])

  const handleFocus = useCallback(() => {
    if (inputRef.current) setDropdownRect(inputRef.current.getBoundingClientRect())
    setOpen(true)
  }, [])

  const handleSelect = (name: string) => {
    onGuess(name)
    setQuery('')
    setDebouncedQuery('')
    setOpen(false)
  }

  const dropdown =
    open && results.length > 0 && dropdownRect
      ? createPortal(
          <ul
            className="search-dropdown"
            style={{
              position: 'fixed',
              top: dropdownRect.bottom + 2,
              left: dropdownRect.left,
              width: dropdownRect.width,
            }}
            role="listbox"
          >
            {results.map((name) => (
              <li
                key={name}
                className="search-dropdown-item"
                role="option"
                aria-selected={false}
                onMouseDown={() => handleSelect(name)}
              >
                {name}
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null

  return (
    <div className="card-search">
      <input
        ref={inputRef}
        className="card-search-input"
        placeholder="Card-Name"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={handleFocus}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        autoComplete="off"
      />
      {dropdown}
    </div>
  )
}
