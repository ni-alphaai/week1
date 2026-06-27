import { useEffect, useState } from 'react'
import { isAiOn, subscribeAi } from './aiPreference'

// Subscribes to the parent's AI Preference so the component re-renders whenever
// it is toggled. Use the resolver functions from src/ai/config (aiGenerationOn,
// aiExplainOn, etc.) for the effective Capability-AND-Preference value.
export function useAiEnabled(): boolean {
  const [aiOn, setAiOn] = useState(isAiOn)
  useEffect(() => subscribeAi(setAiOn), [])
  return aiOn
}
