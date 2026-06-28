// Thin wrapper around the AI provider. Isolates the provider so the rest of the
// app depends only on generateText(). Two backends are supported: Firebase AI
// Logic (Gemini), called directly from the browser, and OpenAI, called through
// a Cloud Function proxy that holds the secret key. Fails closed: any missing
// config, error, or timeout resolves to null so callers fall back to authored
// content. No PII is ever sent - only puzzle/program state from the prompt.

import { firebaseApp, isFirebaseEnabled } from '../storage/firebase'
import { AI_MODEL, OPENAI_MODEL, aiProvider, recaptchaSiteKey } from './config'

const TIMEOUT_MS = 90000

interface GenModel {
  generateContent: (prompt: string) => Promise<{ response: { text: () => string } }>
}

// Models are cached per system instruction, so the explain and generation
// features (which use different system prompts) don't clobber each other.
const modelCache = new Map<string, Promise<GenModel | null>>()
let appCheckStarted = false

async function ensureAppCheck(): Promise<void> {
  if (appCheckStarted || !recaptchaSiteKey || !firebaseApp) return
  appCheckStarted = true
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check')
    initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    })
  } catch {
    // App Check is best-effort; the AI call will still be attempted.
  }
}

async function getModel(systemInstruction: string, model: string): Promise<GenModel | null> {
  if (!isFirebaseEnabled || !firebaseApp) return null
  // Cache per (model, system instruction) so escalating to a stronger model
  // builds a fresh client instead of reusing the cheap one.
  const cacheKey = `${model}\u0000${systemInstruction}`
  const cached = modelCache.get(cacheKey)
  if (cached) return cached
  const promise = (async () => {
    try {
      await ensureAppCheck()
      const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
      const ai = getAI(firebaseApp!, { backend: new GoogleAIBackend() })
      // thinkingBudget: 0 disables Gemini 2.5 "thinking" tokens, which would
      // otherwise eat maxOutputTokens and truncate a short kid-facing reply.
      const params = {
        model,
        systemInstruction,
        generationConfig: { maxOutputTokens: 256, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
      }
      return getGenerativeModel(ai, params as never) as unknown as GenModel
    } catch {
      return null
    }
  })()
  modelCache.set(cacheKey, promise)
  return promise
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

// Lazily resolve the OpenAI proxy callable. Cached after the first build so we
// don't re-import firebase/functions on every request.
type AiCallable = (data: { system: string; prompt: string; model: string }) => Promise<{
  data: { text?: string }
}>
let openaiCallable: Promise<AiCallable | null> | null = null

function getOpenAiCallable(): Promise<AiCallable | null> {
  if (openaiCallable) return openaiCallable
  openaiCallable = (async () => {
    if (!isFirebaseEnabled || !firebaseApp) return null
    try {
      // Attach an App Check token on the OpenAI path too (the Gemini path inits
      // it via getModel). Without this, enforceAppCheck would block this proxy.
      await ensureAppCheck()
      const { getFunctions, httpsCallable } = await import('firebase/functions')
      const fn = httpsCallable(getFunctions(firebaseApp!), 'aiGenerate')
      return fn as unknown as AiCallable
    } catch {
      return null
    }
  })()
  return openaiCallable
}

async function callGemini(
  system: string,
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  const gen = await getModel(system, model)
  if (!gen) return null
  const result = await withTimeout(gen.generateContent(prompt), timeoutMs)
  if (!result) return null
  const text = result.response.text().trim()
  return text.length > 0 ? text : null
}

async function callOpenAi(
  system: string,
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  const callable = await getOpenAiCallable()
  if (!callable) return null
  const result = await withTimeout(callable({ system, prompt, model }), timeoutMs)
  if (!result) return null
  const text = (result.data?.text ?? '').trim()
  return text.length > 0 ? text : null
}

async function callOnce(
  system: string,
  prompt: string,
  model: string,
  timeoutMs: number,
): Promise<string | null> {
  return aiProvider === 'openai'
    ? callOpenAi(system, prompt, model, timeoutMs)
    : callGemini(system, prompt, model, timeoutMs)
}

/**
 * Generate kid-facing text. Returns null on any failure (caller falls back).
 * `model` defaults to the provider's standard model; `timeoutMs` defaults to
 * TIMEOUT_MS. Callers escalate to a stronger model / longer timeout per attempt.
 */
export async function generateText(args: {
  system: string
  prompt: string
  model?: string
  timeoutMs?: number
}): Promise<string | null> {
  const timeoutMs = args.timeoutMs ?? TIMEOUT_MS
  const model = args.model ?? (aiProvider === 'openai' ? OPENAI_MODEL : AI_MODEL)
  try {
    const first = await callOnce(args.system, args.prompt, model, timeoutMs)
    if (first) return first
  } catch {
    // fall through to a single retry
  }
  try {
    return await callOnce(args.system, args.prompt, model, timeoutMs)
  } catch {
    return null
  }
}
