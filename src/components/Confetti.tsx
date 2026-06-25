import { useMemo } from 'react'

const COLORS = ['#6bcb3d', '#9ee070', '#3b9ec9', '#3d9e5f', '#e6a817', '#8b6fd4']

export function Confetti({ count = 36 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 2.8 + Math.random() * 1.4,
        color: COLORS[index % COLORS.length],
        size: 5 + Math.random() * 6,
        rotate: Math.random() * 360,
        round: Math.random() > 0.7,
      })),
    [count],
  )

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-[-5%] animate-confetti opacity-80"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            borderRadius: piece.round ? '9999px' : '1px',
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${piece.rotate}deg)`,
          }}
        />
      ))}
    </div>
  )
}
