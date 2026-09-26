# Content packs

Source of truth: architecture D5. One pack per subject under `content/<subject>/`; adding a subject changes nothing in `src/`.

## Layout

```
content/maths/
  topics.json        [{ id: "1MA1/R9", title, aliases: ["U349"], prerequisites: ["1MA1/N12"], tier: "F" }]
  items/<topic>.json [{ id, topic, type, stem, params?, answers?, mark_scheme?, misconceptions: [{ answer, message }] }]
  generators.js      GEN["U349"] = (rng) => ({ stem, answers[], working, hint, wrong: { "4.5": "..." } })   (v1 shape, kept)
  lessons/           HTML, one per topic, served as-is; quiz.js posts attempts
  reference/         HTML method sheets, one per topic; the source `teachback_mark` marks against
```

## Item types and who marks

| type | marked by |
|---|---|
| generator, cloze, label, sequence, vocab | `src/marking/<type>.ts`, deterministic |
| short, extended, practical-method | `teachback_mark` or `examiner_mark` job with `mark_scheme`; fallback is "not marked yet" |

`misconceptions` are per item and are the only source for O2's scripted wrong steps and O5's planted mistakes. An item with none cannot appear in O2 or O5.

## Keys and licence

Topic id is the exam-board specification statement (Edexcel `1MA1/...`, AQA `8300/...`, `8464/...`). Sparx U-codes and school sheet codes are `aliases`, resolved at intake. No exam-board question text or mark scheme wording in this folder. Oak National Academy content under OGL v3 with attribution in `content/<subject>/LICENCE.md`.

## Carry-over from v1

The 21 lessons, 21 reference sheets and `generate.js` come from `~/Desktop/Matis_study_tutor/` (master, PRD Q1). Lesson markup does not change; `quiz.js` supplies Sure/Not sure and posting. Hand-written `.q` items in lessons are converted once into `items/` by a script and then the lesson reads them from there.
