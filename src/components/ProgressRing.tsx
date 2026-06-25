interface ProgressRingProps {
  percent: number
  size?: number
  stroke?: number
  className?: string
  /** Centered label; defaults to the percent. Pass null to hide. */
  label?: React.ReactNode
}

// A lightweight SVG ring that fills clockwise to `percent` using stroke-dasharray.
export function ProgressRing({ percent, size = 76, stroke = 8, className, label }: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(100, percent))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className={`progress-ring ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-ring-track, rgb(0 0 0 / 0.1))"
          strokeWidth={stroke}
        />
        <circle
          className="progress-ring__bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="progress-ring__label">{label === undefined ? `${clamped}%` : label}</span>
    </div>
  )
}
