# Content packs

Source of truth: architecture D5. One pack per subject under `content/<subject>/`; adding a subject changes nothing in `src/`.

## Layout

```
content/maths/
  courses.json       [{ spec: "1MA1", board: "Edexcel", title: "GCSE Mathematics", tiers: ["F", "H"] }]   tiers: [] is untiered
  topics.json        [{ id: "1MA1/R9" or "1MA1/G17/cone", title, aliases: ["U349"], prerequisites: ["1MA1/N12"], tier: "F", concept?: { rule, distractors[] } }]
                     a concept topic gives O5 an invent-the-rule case
  items/<topic>.json [{ id, topic, type, stem, figure?, scaffold?, hint?, params?, answers?, working?, mark_scheme?, marks?, misconceptions: [{ answer, message }] }]
  generators.js      GEN["U349"] = (rng) => ({ stem, answers[], working, hint, wrong: { "4.5": "..." } })   (v1 shape, kept)
  lessons/           HTML, one per topic; each quiz section names its items file in `data-items` and `app/quiz.js` renders and posts
  reference/         HTML method sheets, one per topic; the source `teachback_mark` marks against
```

## Item types and who marks

| type | marked by |
|---|---|
| generator, cloze | `normaliseAnswer` (`src/marking/normalise.ts`), deterministic |
| label, sequence, vocab | `src/marking/<type>.ts`, deterministic, with a twin in `app/quiz.js` pinned by `src/marking/types.test.ts` |
| short, extended, practical-method | `teachback_mark` or `examiner_mark` job with `mark_scheme`; fallback is "not marked yet". No `answers`, `misconceptions: []`; never asked in a lesson quiz or a boss |

The canon rules, one text box for every type:

- `vocab`: a leading "the", "a" or "an" dropped, then `normaliseAnswer`. "The nucleus" is "nucleus".
- `sequence`: lower case, "then" and "and" dropped, letters only. "B, D, A, C", "b then d then a then c" and "BDAC" are the same.
- `label`: split on commas, semicolons or new lines, each part a `vocab` answer, in order. Every slot and the count must match.

An empty canon is never right. `loadPacks` (`src/api/case.ts`) merges every `content/<subject>/` with a `topics.json`; a subject may ship no `generators.js`, and a topic id, alias, generator code or course spec seen in two subjects is refused at start-up. Start-up also refuses a topic whose spec prefix (`id.split("/")[0]`) is not a course in its own pack's `courses.json`, and a topic in a tiered course whose `tier` that course does not list.

The pupil's courses (`profile.json` `courses`, set at intake through `POST /api/courses`) narrow every route that offers topics (`filterPack` in `src/content/profile.ts`): a topic stays when its spec is chosen and the course is untiered, the pupil picked Higher (Higher includes Foundation), or the topic is `F`. Routes that render saved work (chat, snap, squad, a saved case, `/api/event`) use the full pack. Nothing chosen, or only stale specs, leaves the pack whole.

`misconceptions` are per item and are the only source for O2's scripted wrong steps and O5's planted mistakes. An item with none cannot appear in O2 or O5. A rule case comes from a topic's `concept` block and three generator rolls; it needs no item.

## Keys and licence

Topic id is the exam-board specification statement (Edexcel `1MA1/...`, AQA `8300/...`, `8464/...`). Sparx U-codes and school sheet codes are `aliases`, resolved at intake. No exam-board question text or mark scheme wording in this folder. Oak National Academy content under OGL v3 with attribution in `content/<subject>/LICENCE.md`.

## Carry-over from v1

The 21 lessons, 21 reference sheets and `generate.js` come from `~/Desktop/Matis_study_tutor/` (master, PRD Q1). `quiz.js` supplies Sure/Not sure and posting. The hand-written `.q` items were converted once into `items/` (T3) and stripped from the lessons (T4); `scripts/strip-lessons.test.ts` fails if a `.q` block in the quiz section, an `#explore` section or one of the rewritten v1 links comes back.
