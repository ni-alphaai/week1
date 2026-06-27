const STORAGE_KEY = 'brillant.ai'

let aiOn = readAiOn()
const listeners = new Set<(aiOn: boolean) => void>()

function readAiOn(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    // Absent key → default ON. Only explicit '0' means off.
    return stored !== '0'
  } catch {
    return true
  }
}

function persistAiOn(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage may be unavailable (private mode); preference still works for the session.
  }
}

export function isAiOn(): boolean {
  return aiOn
}

export function setAiOn(value: boolean): void {
  aiOn = value
  persistAiOn(value)
  listeners.forEach((listener) => listener(value))
}

export function toggleAi(): void {
  setAiOn(!aiOn)
}

export function subscribeAi(listener: (aiOn: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
