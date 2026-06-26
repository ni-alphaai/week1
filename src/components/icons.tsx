import type { Command } from '../types'

const ROTATION: Record<Command, number> = { up: 0, right: 90, down: 180, left: 270 }

export function ArrowIcon({ command, className }: { command: Command; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={{ transform: `rotate(${ROTATION[command]}deg)` }}
      aria-hidden="true"
    >
      <path d="M12 3.5l7 8h-4.2V20H9.2v-8.5H5z" fill="currentColor" />
    </svg>
  )
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M9.5 16.2L5.3 12l1.4-1.4 2.8 2.8 7.2-7.2 1.4 1.4z"
        fill="currentColor"
      />
    </svg>
  )
}

export function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 12.2l2.4 2.4 5.6-5.8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FlameIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3c.8 2.2-.4 3.8-.4 6a2.2 2.2 0 004.4 0c1.6 1.2 3.4 3.2 3.4 6.6a6 6 0 11-12 0c0-2.4 1.2-3.8 2-4.8.4 1.6 1.2 2 1.6 2-1-2.4.4-5.6.4-9.8z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ChestIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M5 10a3 3 0 013-3h8a3 3 0 013 3v1H5v-1z"
        fill="currentColor"
        opacity="0.85"
      />
      <rect x="4" y="10.5" width="16" height="8.5" rx="1.5" fill="currentColor" />
      <rect x="4" y="12.5" width="16" height="2" fill="currentColor" opacity="0.35" />
      <rect x="10.5" y="11.5" width="3" height="5.5" rx="0.75" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function RockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M8 18l-2.5-4.5 2-5.5h9l2.5 4-1.5 6H8z"
        fill="currentColor"
        opacity="0.55"
      />
      <path d="M10 8.5h6l1.5 3.5-1 4.5H9L7.5 12 10 8.5z" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

export function BridgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Open bridge" role="img">
      <path
        d="M4 14c2.5-3 5-4.5 8-4.5s5.5 1.5 8 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M7 14v3M12 9.5v7.5M17 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function WaterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Water" role="img">
      <path
        d="M5 11c1.5-1.5 3-2.2 4.5-2.2M14.5 8.8C16 8.8 17.5 9.5 19 11M6 14.5c1.8-1.2 3.5-1.8 5.2-1.8M12.8 12.7c1.6 0 3.2.6 4.7 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function CompassIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.8 9.2l-2 4.6-4.6 2 2-4.6z" fill="currentColor" />
    </svg>
  )
}

export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"
        fill="currentColor"
      />
      <path d="M18.5 14l.8 2.2L21.5 17l-2.2.8-.8 2.2-.8-2.2L15.5 17l2.2-.8z" fill="currentColor" />
    </svg>
  )
}

export function DashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M13 2L4 14h6l-1 8 9-12h-6z" fill="currentColor" />
    </svg>
  )
}

export function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function HoldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="7" y="6" width="3.2" height="12" rx="1" fill="currentColor" />
      <rect x="13.8" y="6" width="3.2" height="12" rx="1" fill="currentColor" />
    </svg>
  )
}

export function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M9 18h6v1.5a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 19.5V18zm3-14.5a6.5 6.5 0 014.2 11.3c-.6.5-1 1.2-1.1 2H9.9c-.1-.8-.5-1.5-1.1-2A6.5 6.5 0 0112 3.5z"
        fill="currentColor"
      />
    </svg>
  )
}

export function PackageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.5l8 4.5v9L12 21.5 4 17v-9l8-4.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 8v13M4 8l8 4.5L20 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function GemIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 4h10l3.5 5L12 21 3.5 9 7 4z" fill="currentColor" opacity="0.9" />
      <path d="M7 4l-3.5 5h17L17 4M3.5 9L12 21l3-12M12 21L9 9l-2-5" fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  )
}

export function PickupIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 3v9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 7.5L12 3.5l3.5 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13h14v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5z" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

export function DropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 12V3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 8.5L12 12.5l3.5-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 13h14v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5z" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

export function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 3v18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6 4h11l-2.5 3.5L17 11H6z" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

export function RestartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 4V1L8 5l4 4V6a6 6 0 016 6 6 6 0 01-6 6 6 6 0 01-5.2-3H4.4A8 8 0 0012 20a8 8 0 000-16z"
        fill="currentColor"
      />
    </svg>
  )
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M9 3h6l1 2h4v2H4V5h4zM6 8h12l-1 12.5A1.5 1.5 0 0115.5 22h-7A1.5 1.5 0 017 20.5z"
        fill="currentColor"
      />
    </svg>
  )
}

export function TeleportIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="12" rx="8" ry="8" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <ellipse cx="12" cy="12" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.75" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

export function KeyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M11 11l8 8M16 16l2-2M18.5 18.5l1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function DoorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="6" y="3.5" width="12" height="17" rx="1.2" fill="currentColor" opacity="0.85" />
      <circle cx="14.5" cy="12" r="1.1" fill="#fff" opacity="0.9" />
    </svg>
  )
}

export function GateIcon({ className, open }: { className?: string; open?: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-label="Open gate" role="img">
        <path d="M4 5v14M20 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.8" />
        <path d="M6 7v10M9 7v10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" className={className} aria-label="Closed gate" role="img">
      <path d="M5 5v14M9 5v14M13 5v14M17 5v14M21 5v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 8.5h16M4 13h16M4 17.5h16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export function PlateIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
      <rect x="7.5" y="7.5" width="9" height="9" rx="2" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

export function IceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <path d="M12 6l-1.5 1.5M12 6l1.5 1.5M12 18l-1.5-1.5M12 18l1.5-1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    </svg>
  )
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" opacity="0.85" />
      <path d="M8 11V7a4 4 0 018 0v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.5" fill="#fff" opacity="0.85" />
    </svg>
  )
}

export function BadgeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M8.5 13.5L6 22l6-3 6 3-2.5-8.5z" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="9" r="7" fill="currentColor" />
      <circle cx="12" cy="9" r="7" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
      <path
        d="M12 5.2l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  )
}
