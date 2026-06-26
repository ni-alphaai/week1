// Phase 2 AI feature flags. Everything here is OFF unless explicitly enabled,
// so the Phase 1 MVP behaves identically when these env vars are absent.

export const aiEnabled = import.meta.env.VITE_AI_ENABLED === 'true'

// The on-demand "Explain my mistake" feature. Requires the master flag too.
export const aiExplainEnabled = aiEnabled && import.meta.env.VITE_AI_EXPLAIN_ENABLED === 'true'

// P1: verified AI problem generation ("never run dry"). Requires the master flag.
export const aiGenerationEnabled = aiEnabled && import.meta.env.VITE_AI_GENERATION_ENABLED === 'true'

// P1: adaptive difficulty. When off, lesson order/difficulty is unchanged.
export const aiAdaptiveEnabled = aiEnabled && import.meta.env.VITE_AI_ADAPTIVE_ENABLED === 'true'

// Which provider backs generateText(). "gemini" calls Firebase AI Logic from
// the browser; "openai" calls a Cloud Function proxy that holds the key.
// Defaults to "gemini" so existing behavior is unchanged when unset.
export const aiProvider: 'gemini' | 'openai' =
  import.meta.env.VITE_AI_PROVIDER === 'openai' ? 'openai' : 'gemini'

// Gemini model used through Firebase AI Logic. Overridable per environment.
export const AI_MODEL = (import.meta.env.VITE_AI_MODEL as string | undefined) || 'gemini-2.5-flash'

// OpenAI model used by the Cloud Function proxy when aiProvider === 'openai'.
// The function reads the same value; the client sends it along with the prompt.
// Default fast model for the first generation attempts (cheap-first ladder).
export const OPENAI_MODEL = (import.meta.env.VITE_AI_OPENAI_MODEL as string | undefined) || 'gpt-5.4-mini'

// Stronger OpenAI model the generator escalates to after cheap attempts fail
// verification. Defaults to gpt-5.4 for quality without gpt-5.5 latency.
export const OPENAI_STRONG_MODEL =
  (import.meta.env.VITE_AI_OPENAI_STRONG_MODEL as string | undefined) || 'gpt-5.4'

// Optional reCAPTCHA site key. When present, App Check protects the AI endpoint.
export const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined
