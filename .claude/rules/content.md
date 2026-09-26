---
paths:
  - "content/**"
  - "src/jobs/**"
---

# Pupil-facing text

Applies to lessons, reference sheets, item stems, hints, misconception messages, chat prompts and anything a job returns to the screen.

- Register: a 15-year-old reads it aloud and follows it. Plain words, short sentences, no baby talk, no hype. British English, sentence case, no emoji, no exclamation marks.
- Every prose block passes `no-ai-slop` then `humanizer` before the file is saved. Both skills' Default voice sections do not apply. Word list: `~/.claude/skills/_shared/slop-blacklist.md`.
- Never a grade prediction. Say what the pupil can do and cannot do yet.
- Never an answer before an attempt. A hint names the next step, not the result. A marking message names the mistake, not the corrected answer.
- Curriculum is floor and ceiling: nothing the specification needs is skipped; nothing above the pupil's tier appears unless asked.
- Keep the school's terms: the Sparx topic name and the exam-board wording for a method, so the lesson matches the classroom.
- Prompts to the model in `src/jobs` restate the guard in their system message: "Do not state the answer. The pupil has not attempted this yet." Remove that line only in the post-attempt prompt variant.
