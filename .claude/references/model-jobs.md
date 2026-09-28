# Model jobs and the provider seam

Source of truth: architecture D2, D4, D11. The model never orchestrates; `src/flow` calls a job at a named point and gets a typed value or `no verdict`.

## A job file (`src/jobs/<job>.ts`)

```ts
export const hint = defineJob({
  name: 'hint',
  input: HintInput,            // item view WITHOUT answers until an attempt event exists
  output: HintOutput,          // validated in code; the provider's JSON mode is not relied on
  prompt: (i) => [...],        // system + user messages; JSON shape stated in the prompt
  fallback: (i) => ({ text: i.item.hint }),   // deterministic path when the model is absent or invalid
  vision: false,
});
```

Rules: one retry on invalid JSON, then `fallback`. No job receives `answers` or `mark_scheme` for a numeric item before the attempt event. Jobs that mark (`teachback`, `examiner`) receive the mark scheme and return marks per line, never a corrected solution. Every job ships a test with the provider mocked for: valid output, invalid JSON twice, provider down.

Retry table (`src/jobs/define.ts`, T9): `not-json`, `shape` (the validator refused it) and `guard` (the reply guard refused it) get the one retry; `no-model`, `cap`, `timeout`, `network`, `http` and `bad-response` go straight to the fallback. A reply is one fenced block only; a two-block reply is `not-json`. The answer guard is typed: `src/jobs/view.ts` is the only producer of `PreAttempt` (the stripped view) and `PostAttempt` (the full item, minted only once `hasAttempt` finds an attempt event, matched on id and seed for a `#gen` item). A pre-attempt job takes `PreAttempt`, and a raw `Item` does not type-check as either.

Jobs planned: `guess_first`, `hint`, `teachback_mark`, `dan_wrong_step` (O2, scripted from the misconception bank), `examiner_mark` (O3, vision), `intake_read` (sheet or photo → topic codes).

## Provider

`src/providers/openai-compatible.ts` is the only network call to a model: `POST ${base_url}/chat/completions` with `Authorization: Bearer ${key}`. Vision goes as `image_url` content parts. Presets are labels over the same three fields (OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Ollama, LM Studio, Anthropic compat). No Gemini preset. Usage from each response feeds the monthly token counter event.

- `chatJson(dataDir, messages, opts)` reads the config itself, so no caller holds the key. Returns `{ok:true, value, text}` or `{ok:false, reason}` with `reason` one of `no-model | cap | timeout | network | http | not-json | bad-response` (`http` adds `status`). It never throws and never logs or returns the key or the provider's body.
- One call at a time per process (a module-level queue), so each call's cap check sees the last call's usage.
- The cap (`config.cap`, tokens per London month from `state.tokens`) is checked before the fetch; at or over it, `cap` and no request.
- Every 200 with a JSON object body appends `usage@1` before the reply is parsed, so a non-JSON reply still counts. No usable `usage` → an estimate (4 characters per token, a flat 1,000 per image, never the base64) marked `estimated: true`.
- `Authorization` is sent only when the key is non-empty (Ollama, LM Studio take none). The reply-length field is per preset (`limitField`: Ollama ignores `max_completion_tokens`). No `response_format`, no `temperature`.
- `parseJsonReply` accepts bare JSON or one fenced block (Anthropic compat fences every reply), after an optional `<think>` block. No hunting for JSON in prose.
- No retry in the provider: the retry-once rule belongs to the job, which alone knows the shape.

## Guard

Structural first (answer withheld), then a regex pass on every reply (emoji, exclamation marks, "you will get a grade"), then, when configured, a small-model shadow judge that logs `would_block` and never blocks in v1.
