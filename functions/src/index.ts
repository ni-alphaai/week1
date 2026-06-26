// OpenAI proxy for the Brillant client. The browser never sees the API key;
// it calls this callable with { system, prompt, model } and gets back { text }.
// The key is provided at runtime via the OPENAI_API_KEY secret (set with
// `firebase functions:secrets:set OPENAI_API_KEY`). Mirrors the generation
// config used by the Gemini path: short, low-temperature, kid-facing replies.

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import OpenAI from 'openai'

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY')

const MAX_INPUT_CHARS = 40000
const DEFAULT_MODEL = 'gpt-5.4'
const MAX_OUTPUT_TOKENS = 16000
const TEMPERATURE = 0.4

function asBoundedString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) return null
  return trimmed
}

// gpt-5* and the o-series (o1/o3/o4) are reasoning models on v1/chat/completions.
// They require max_completion_tokens, reject non-default temperature, and accept
// reasoning_effort. Legacy chat models (gpt-4o, gpt-4o-mini, ...) use max_tokens.
function isReasoningModel(model: string): boolean {
  return (
    model.startsWith('gpt-5') ||
    model.startsWith('o1') ||
    model.startsWith('o3') ||
    model.startsWith('o4')
  )
}

// Mini/nano variants skip reasoning for lower latency; full GPT-5.x uses low effort.
function reasoningEffortFor(model: string): 'none' | 'low' | 'medium' {
  if (model.includes('-mini') || model.includes('-nano')) return 'none'
  return 'low'
}

export const aiGenerate = onCall(
  {
    secrets: [OPENAI_API_KEY],
    // Flip to true once App Check (reCAPTCHA) is configured on the client to
    // block abuse of this proxy from outside your app.
    enforceAppCheck: false,
    timeoutSeconds: 180,
    memory: '256MiB',
  },
  async (request) => {
    const system = asBoundedString(request.data?.system, MAX_INPUT_CHARS)
    const prompt = asBoundedString(request.data?.prompt, MAX_INPUT_CHARS)
    if (!system || !prompt) {
      throw new HttpsError('invalid-argument', 'system and prompt are required strings')
    }
    const model = asBoundedString(request.data?.model, 100) ?? DEFAULT_MODEL

    const client = new OpenAI({ apiKey: OPENAI_API_KEY.value() })

    try {
      // Build params as a typed record so we can attach keys the SDK types may
      // not know about (reasoning_effort) and swap token params per model class.
      const params: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }
      if (isReasoningModel(model)) {
        params.max_completion_tokens = MAX_OUTPUT_TOKENS
        params.reasoning_effort = reasoningEffortFor(model)
        // Intentionally omit temperature: reasoning models reject non-default values.
      } else {
        params.max_tokens = MAX_OUTPUT_TOKENS
        params.temperature = TEMPERATURE
      }

      const completion = await client.chat.completions.create(
        params as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
      )
      const text = completion.choices[0]?.message?.content?.trim() ?? ''
      return { text }
    } catch (err) {
      // Surface a generic error; the client fails closed to authored content.
      throw new HttpsError('internal', 'AI request failed', String(err))
    }
  },
)
