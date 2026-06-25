import { useState } from 'react'
import { playSound } from '../lib/sound'

export type BirdMood = 'explain' | 'hint' | 'celebrate' | 'oops' | 'petted'

interface RicoBirdProps {
  mood?: BirdMood
  className?: string
  onClick?: () => void
}

/** Rico — green bird mascot inspired by Brilliant's cheerful guide style */
export function RicoBird({ mood = 'explain', className = '', onClick }: RicoBirdProps) {
  const [isPetted, setIsPetted] = useState(false)

  const body = '#6bcb3d'
  const bodyLight = '#9ee070'
  const bodyDark = '#4a9e28'
  const belly = '#b8f090'
  const beak = '#f5a623'
  const ink = '#1a1d26'

  const activeMood: BirdMood = isPetted ? 'petted' : mood

  function handleClick() {
    setIsPetted(true)
    playSound('pet')
    setTimeout(() => setIsPetted(false), 800)
    onClick?.()
  }

  return (
    <svg
      viewBox="0 0 64 64"
      className={`rico-bird rico-bird--${activeMood} ${className}${onClick ? ' cursor-pointer' : ''}`}
      aria-hidden="true"
      onClick={handleClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <ellipse cx="32" cy="54" rx="14" ry="3.5" fill="#000" opacity="0.08" />

      <path d="M14 36c-4 2-6 6-5 10 3-1 6-4 7-8 1-3 0-5-2-2z" fill={bodyDark} />
      <path d="M18 38c-3 3-4 7-2 10 2-2 3-5 2-8-1-2-1-3 0-2z" fill={body} />

      <ellipse cx="34" cy="38" rx="17" ry="15" fill={body} />
      <ellipse cx="34" cy="40" rx="12" ry="10" fill={belly} />

      <path d="M42 34c6 2 9 7 8 12-4-1-7-4-8-8-1-3 0-5 0-4z" fill={bodyDark} />
      <path d="M44 36c3 1 5 4 5 7-2 0-4-2-4-5 0-2 0-3-1-2z" fill="#3d8520" opacity="0.45" />

      <circle cx="34" cy="24" r="13" fill={bodyLight} />
      <circle cx="34" cy="25" r="10" fill={body} />

      <circle cx="26" cy="27" r="3.2" fill={bodyDark} opacity="0.2" />
      <circle cx="42" cy="27" r="3.2" fill={bodyDark} opacity="0.2" />

      <path
        d="M44 22c8 1 12 4 11 8-1 3-5 5-10 4-3 0-5-2-4-5 1-3 2-6 3-7z"
        fill={beak}
      />
      <path
        d="M46 24c5 1 7 3 6 5-1 1-3 2-5 1-1 0-2-1-1-3 0-1 0-2 0-3z"
        fill="#d4880f"
        opacity="0.35"
      />

      {activeMood === 'oops' ? (
        <>
          <ellipse cx="28" cy="22" rx="4.2" ry="5" fill="#ffffff" />
          <ellipse cx="37" cy="22" rx="4.2" ry="5" fill="#ffffff" />
          <circle cx="28" cy="23" r="2" fill={ink} />
          <circle cx="37" cy="23" r="2" fill={ink} />
          <path d="M24 18 Q28 16 32 18" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <path d="M33 18 Q37 16 41 18" stroke={ink} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>
      ) : activeMood === 'celebrate' ? (
        <>
          <path d="M24 22 Q28 18 32 22" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M33 22 Q37 18 41 22" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="48" cy="14" r="2" fill={beak} />
          <circle cx="52" cy="18" r="1.2" fill="#3b9ec9" />
        </>
      ) : activeMood === 'petted' ? (
        <>
          {/* closed happy ^ eyes */}
          <path d="M24 24 Q28 19 32 24" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M33 24 Q37 19 41 24" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          {/* small pink heart floating above Rico's head */}
          <path
            d="M47 10 C47 8.4 45 7.8 45 9.5 C45 11.2 47 12.8 47 12.8 C47 12.8 49 11.2 49 9.5 C49 7.8 47 8.4 47 10 Z"
            fill="#e5484d"
          />
        </>
      ) : (
        <>
          <circle cx="28" cy="23" r="4.5" fill="#ffffff" />
          <circle cx="37" cy="23" r="4.5" fill="#ffffff" />
          <circle cx="29" cy="24" r="2.2" fill={ink} />
          <circle cx="38" cy="24" r="2.2" fill={ink} />
          <circle cx="29.8" cy="22.8" r="0.9" fill="#ffffff" />
          <circle cx="38.8" cy="22.8" r="0.9" fill="#ffffff" />
          {activeMood === 'hint' && (
            <>
              <circle cx="44" cy="16" r="5" fill="#ffffff" stroke={beak} strokeWidth="1.2" />
              <text x="44" y="18.5" textAnchor="middle" fontSize="7" fontWeight="700" fill={beak}>
                ?
              </text>
            </>
          )}
        </>
      )}

      <ellipse cx="28" cy="50" rx="3" ry="1.8" fill={beak} />
      <ellipse cx="38" cy="50" rx="3" ry="1.8" fill={beak} />

      <path d="M34 11c-1-3 2-5 3-2 1 2 3 2 2 4-2-1-3-1-5-2z" fill={bodyLight} />
    </svg>
  )
}
