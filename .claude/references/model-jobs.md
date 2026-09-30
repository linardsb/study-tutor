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

Rules: one retry on invalid JSON, then `fallback`. No job receives `answers` or `mark_scheme` for a numeric item before the attempt event. Jobs that mark (`teachback`, `examiner`) receive the mark scheme and return marks, never a corrected solution: `teachback_mark` marks per scheme point when the item has `mark_scheme` and its `marks` total (the score is out of `marks`), and per pupil line otherwise (#52). Every job ships a test with the provider mocked for: valid output, invalid JSON twice, provider down.

Retry table (`src/jobs/define.ts`, T9): `not-json`, `shape` (the validator refused it) and `guard` (the reply guard refused it) get the one retry; `no-model`, `cap`, `timeout`, `network`, `http` and `bad-response` go straight to the fallback. On a fallback verdict other than `no-model`, `defineJob` appends one `job@1` line (job name and reason only) for the parent digest. A reply is one fenced block only; a two-block reply is `not-json`. The answer guard is typed: `src/jobs/view.ts` is the only producer of `PreAttempt` (the stripped view) and `PostAttempt` (the full item, minted only once `hasAttempt` finds an attempt event, matched on id and seed for a `#gen` item). A pre-attempt job takes `PreAttempt`, and a raw `Item` does not type-check as either.

`dan_wrong_step` (O2) takes `PreAttempt` plus one `Misconception` chosen in `src/flow/coach.ts`; validation refuses a reply that does not reach that wrong answer, so the model cannot substitute its own error (R8); `preAttemptSystem(task, voice)` lets it speak as Dan with the guard line kept. The fallback is a written line from the bank, so Dan works with no model.

`intake_read` (T17, shipped): input is the pupil's pasted sheet text or a photo of it, plus every topic id and alias for the no-model reader only (the prompt never lists them, so the model is not invited to map a topic name to a code). Output: `{codes: [{code, rag}]}`, at most 80 rows, each code 1 to 40 characters of `[A-Za-z0-9./-]`; from pasted text every code must appear in the text. `texts` and `sources` are empty: codes are identifiers, and the number rule would refuse every code in a photo reply. The fallback is `readCodes`, a deterministic token reader (a Sparx-shaped or known code; its R/A/G is read before the code or after it (to the next code), whichever reading leaves fewer R/A/G tokens unused, or carried across `U745, U736`; a tie that disagrees gives null ratings); a photo falls back to no verdict. `src/flow/intake.ts` resolves codes through `aliases`; an unknown code is listed back, never written.

`interview` (T17, shipped): input is `{id, title, aliases}` per topic (never a `Topic`, `Item` or view) and the pupil's answers to three fixed questions. Output: topic ids from that list only, each with `confident | unsure | stuck`, mapped to G/A/R in code (`CONFIDENCE_RAG`). The fallback is no verdict; the page then shows a self-rating checklist. Both intake jobs use `preAttemptSystem(task, voice, num)`: `num` replaces the invented-number line for a job with no question, and the guard line stays. The page confirms every row before one `intake@1` is posted through `/api/event`.

`examiner_mark` (T13, shipped): input `PostAttempt` plus the photo, sent as a text part and then an image part (the S2 probe's form), with `mark_scheme ?? working` as the scheme. Output: exactly five lines in a fixed order (method, accuracy, answer, units, sense), each mark 0 or 1, and units `null` when the question needs none (scored as 1). So every marked photo is out of 5. `sources` is the stem alone: handwriting is not text the guard can read, so a note may quote no number from the photo. The guard reads digits only, so `validate` also refuses a number word the stem does not print: "zero", "nought", and the cardinals from "two" to "million". The claim is "no whole number outside the stem, in digits or in words", with two exceptions the code does not catch: "one" ("one step is missing" is not a value) and fractions in words ("half", "a quarter"). The job replaces `NUM` with its own line through `postAttemptSystem(task, num)`, because `NUM` allows the pupil's words and this guard does not. No transcription field. `fallback` is null, which the snap page shows as "stored, not marked yet".

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
