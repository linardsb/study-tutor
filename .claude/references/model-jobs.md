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

Jobs planned: `guess_first`, `hint`, `teachback_mark`, `dan_wrong_step` (O2, scripted from the misconception bank), `examiner_mark` (O3, vision), `intake_read` (sheet or photo → topic codes).

## Provider

`src/providers/openai-compatible.ts` is the only network call to a model: `POST ${base_url}/chat/completions` with `Authorization: Bearer ${key}`. Vision goes as `image_url` content parts. Presets are labels over the same three fields (OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Ollama, LM Studio, Anthropic compat). No Gemini preset. Usage from each response feeds the monthly token counter event.

## Guard

Structural first (answer withheld), then a regex pass on every reply (emoji, exclamation marks, "you will get a grade"), then, when configured, a small-model shadow judge that logs `would_block` and never blocks in v1.
