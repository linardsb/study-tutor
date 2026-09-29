---
title: "Study tutor v2 — shareable, model-agnostic, multi-subject — PRD"
approved: false
stage: lean-hypothesis
created: 2026-09-26
slug: study-tutor-v2
supersedes: "Fredis repo (claude-code-second-brain) .agent/plans/study-tutor-prd.md"
evidence: "Matis/ folder on disk (state as of 2026-09-26) · five research briefs run 2026-09-26 (learning science, pedagogy combinations, delivery architectures, multi-subject content, Sparx access) · Fredis repo .agent/plans/matis-teaching-upgrade/research/ (2026-09-21)"
---

# Study tutor v2 — shareable, model-agnostic, multi-subject — PRD

> **Relationship to v1.** This builds on the tutor at `Matis/`, it does not replace the concept.
> The content and the record formats carry over (21 lessons, 21 reference sheets, quiz engine,
> fresh-number generators, practice and progress pages, topic / session / learning-record
> formats, the study flows as prompt text). What goes is the engine the content sits on: the
> Claude Code harness, its launcher, hooks and permission files. This repo (`~/Desktop/study-tutor`); the Fredis repo's `Matis/` folder is
> the donor and the reference implementation. Which engine replaces it is a `/plan-architecture`
> decision, deliberately left open here.

## Problem statement

Two problems, one tool.

**1. Matis's problem has not moved since 2026-09-03.** The v1 PRD's evidence stands: Test 2
grade 3.25 against a predicted 3 and a target 4; green topics not retained (U349 went 100% to
0% between papers); ratio and geometry never scored; marks lost on 3–4 mark multi-step
questions. What is new is the usage evidence: **zero sessions logged** on either copy of the
tool in 23 days (`sessions.md` has a header and no rows; `learning-records/` is empty; the PC
install has not happened). The best-evidenced constraint on AI tutoring outcomes is not
pedagogy but opening the tool: in the two-year Khanmigo RCT the median pupil used the tutor on
a third of practice days and gains matched plain practice without AI. A tutor that is correct
and unopened teaches nothing.

**2. The tool cannot be given to anyone.** Matis's friends sit the same exams with the same
gap (a school sheet says which topics are red; nothing turns that into a spaced plan the pupil
runs at home). v1 cannot reach them:

| Blocker | Evidence |
|---|---|
| Legal | The launcher logs each PC into Linards's Claude subscription. Consumer terms: 18+, one account holder; consumer tokens in third-party harnesses blocked Jan 2026. Sharing it is a ban risk for Linards. |
| Practical | Needs Claude Code, a paid subscription and Windows. No macOS launcher exists. |
| Single-subject | Generators, practice page, progress page, verifier and guard questions are maths-only; only the topic-row schema and intake are subject-neutral. |
| Coupled | No HTML page writes state. A score persists only if pasted into the chat, so the AI is load-bearing for progress tracking, not just for tutoring. |
| Diverged | The repo copy and `~/Desktop/Matis_study_tutor/` already differ (Edexcel and the weekly target are recorded in one, not the other). |

**How they cope today.** Sparx homework (no personal spaced plan, no parent API), Corbettmaths
5-a-day, Seneca, YouTube, and consumer chatbots that hand over answers. The last is the
documented harm case: unguarded ChatGPT during practice raised practice scores 48% and cut
unaided exam scores 17% (Bastani et al., PNAS 2025).

## Why now

- Year 11 started this month; mocks land November–December; GCSEs sit May–June 2027. The
  2027 papers keep the current formulae and equation sheets; the curriculum review does not
  touch this cohort.
- v1 is finished as a maths artefact (all eight upgrade prompts done 2026-09-21) and has never
  been opened. The next thing to learn is adherence, and that is cheaper to learn with three
  pupils than one.
- The free-model landscape shifted this summer: Gemini CLI's free tier ended in June and the
  Gemini API terms bar under-18 audiences, while OpenAI and Anthropic allow minor-facing use
  with safeguards and a session on a small model costs about a penny. The sharing design has
  to be made now, on today's terms, not inherited from v1.
- The evidence base moved: a 60,000-pupil RCT (NBER 2025) found streaks improved maths, not
  just usage, which reverses the 2026-09-21 audit's "no streaks" call; the LearnLM + Eedi UK
  trial (ages 13–15) and the Medly GCSE science micro-RCT (g = 0.33) show GCSE-aligned AI
  revision helps when it withholds answers.

## Hypothesis

```
We believe that   a retrieval-first tutor that feels like the games and apps a 15-year-old
                  already uses (levels and boss fights, coaching a weaker player, a camera
                  that marks like an examiner, a co-op squad, a daily detective puzzle),
                  that any family can download and run on their own PC or Mac with their
                  own model, on any GCSE subject,
will cause        Matis and three to five of his friends
to                open it without being told, three times a week, attempt every item
                  before any help, and take cold re-tests days after each lesson,
resulting in      red topics on their school sheets scoring half marks or better on the
                  next school paper.

RIGHT if   within 6 weeks of a friend's install: each pupil logs ≥3 sessions a week with at
           most one parental nudge, ≥70% of cold re-tests taken ≥7 days after a lesson
           pass, at least one friend's parent completes setup unaided from the public
           download, AND on the next school paper ≥6 of 9 red codes score ≥50% (Matis).
WRONG if   Matis's sessions stop inside 2 weeks (adherence, not pedagogy, is the problem and
           no feature fixes it), OR in-tool re-tests pass while the same codes stay red on
           the school paper (recognition, not recall), OR no friend's parent completes setup
           in under 30 minutes (the giveaway is not simple enough), OR unaided re-test scores
           fall while XP rises (rewards are crowding out learning), OR any session log shows
           the tutor giving an answer before an attempt (the guardrail that separates help
           from harm has failed).
```

## Target user

- **Primary:** Matis, 15, Year 11, Edexcel GCSE Foundation maths (said by Matis 2026-09-22,
  unconfirmed with the school), AQA Combined Science Trilogy. 20 minutes, three times a week,
  on his own PC, evenings.
- **Secondary:** three to five friends in Years 10–11, any board, Foundation or Higher, any
  subject; and the parent who does the one-off setup. The parent holds the model key and
  reads a weekly digest; the pupil sees exactly what the parent sees.
- **Explicitly not:** schools or teachers; under-13s; anyone paying for it; a hosted service
  Linards runs for other families (that makes him data controller for other people's
  children under the ICO Children's Code); Higher-tier content in the first content pass.

## Scope: the five experiences

Each is a product hypothesis in its own right. Each names the familiar frame, the mechanism,
the reward loop, the evidence, and its own leading signal. None decides engineering.

**O1. Boss battles.** The 3/10/30/60 re-test ladder rendered as a level map. XP for effort (an
attempt with a score, a teach-back done), never for correctness alone. Practice never costs a
level; a cold re-test (the boss) can. Bosses are built from the pupil's own confident-wrong
items. Weekly flame ("3 of your 3 this week"), not a daily streak. *Evidence:* streaks improved
maths in the Peru RCT; mastery gating strongest for weaker pupils (Kulik 1990); Sparx's
asymmetric ladder; leaderboards embarrass low-ranked teens. *Works with no model.*
*Signal:* weekly flame kept 4 weeks of 6.

**O2. Coach the noob.** After teach-back, an AI student ("Dan") attempts the next fresh-number
item and makes a scripted wrong step drawn from the misconception bank. The pupil catches and
corrects it. Dan visibly ranks up as he is taught. *Evidence:* protégé effect largest for
lower achievers at 13–14 (Chase et al. 2009); teaching beats preparing to teach, g = 0.56
(Kobayashi 2019); scripted errors avoid the LLM "competency bias" failure (2026). *Needs a
mid-tier model.* *Signal:* ≥70% of scripted errors caught unaided by week 3.

**O3. Examiner mode.** Photograph handwritten working; the tutor marks it the way an examiner
does (method and accuracy lines, boxed final answer, units, reasonableness) and never solves.
"Marks left on the table" counter that should fall week on week; clean-sheet badge for
presentation. *Evidence:* Foundation examiners' reports name execution and presentation, not
method, as where marks go; vision models mark handwritten maths well enough for formative use
(2026); Medly GCSE science g = 0.33. *Needs a vision model; the one option with real token
cost.* *Signal:* marks-left-on-table falls for 3 consecutive weeks.

**O4. Squad mode.** Two or three friends run the same seeded re-test (identical numbers),
compare working, share a countdown, and pool a co-operative weekly total. A parent-as-student
round where the pupil teaches the parent. No individual ranking. *Evidence:* peer presence
raises self-efficacy and cuts test anxiety (β = −0.41, 2025); parental involvement helps when
low-key and informal. *Works with no model and no server.* *Signal:* ≥1 squad re-test a week
for 4 weeks.

**O5. Detective cases.** A daily three-minute puzzle in the Wordle habit slot: find the planted
mistake in a worked solution, or invent the rule from three contrasting cases before the
lesson shows it (concept topics only, never pure procedures). Every answer carries a 1–3
confidence bet; a confident-wrong answer triggers an immediate re-ask and seeds tomorrow's
case. Calibration line ("you predicted 7, you scored 4"). *Evidence:* erroneous examples beat
problem solving on delayed tests (McLaren, Adams); hypercorrection replicated in children,
errors return without a re-test; invention-first d = 0.36 on transfer (Sinha & Kapur 2021).
*Works with no model.* *Signal:* calibration gap halves in 4 weeks.

**Base constraints** (true for every option; intent, not engineering):

1. Downloadable from a public URL; unzip and double-click on Windows and macOS.
2. The family supplies the model. Any provider or a local model behind one setting; the tool
   runs practice, re-tests, O1, O4 and O5 with no model at all.
3. Deterministic marking for anything with a right answer; a model explains, hints and marks
   extended answers, and never decides a numeric answer.
4. Three intake doors: upload a sheet or photo; tell the chat in a five-minute interview; take
   a cold diagnostic. All land on one topic map keyed by exam-board specification statements,
   with school codes (Sparx U-codes) as aliases.
5. Multi-subject from day one: one item schema with a type field (generator, cloze, label,
   sequence, short, extended, vocab, practical method) and a mark-scheme field; maths first,
   science second via Oak National Academy (Open Government Licence), exam-board papers
   link-out only.
6. Pupil data survives every update.
7. Under-18 safe: the key is the parent's, spend-capped; the pupil never holds it; no shell
   access for the model; "this is an AI" on screen; sessions logged locally for the parent.

## Non-goals (v1)

- A hosted service, accounts, a mobile app, or any server Linards runs for other families.
- Sparx account integration. Sparx has no API, no export and no parent login, and its terms
  forbid feeding its content to any language model; inputs are the public topic-code sheet,
  the pupil's own screenshots, the parent email, and teacher-exported reports.
- Embedding exam-board questions or mark schemes (AQA forbids its material in apps and in
  AI-generated work); Seneca, Cognito, Save My Exams, Dr Frost and Quizlet as sources.
- AI as sole marker of anything, and any grade prediction.
- Individual leaderboards, daily streaks, cash or item rewards, unlimited single-question loops.
- Gemini on any path (API terms bar under-18 audiences).
- WhatsApp, forums, or any outbound channel.
- Selling it; a build pipeline with code signing.

## Risks & assumptions

| # | Risk | Assumption it rests on | De-risk |
|---|---|---|---|
| R1 | **Adherence.** Zero sessions so far; the Khanmigo trial was capped by non-use. | A game frame plus a weekly flame gets a 15-year-old to open it unprompted. | E1 ships O1 + O5 onto the existing folder first and measures opens before anything else is built. |
| R2 | **Transfer.** Passing in-tool while staying red on paper. | Cold, unlabelled, mixed re-tests days later measure storage, not recognition. | WRONG line names it; the school paper is the judge. |
| R3 | **Wrong maths from cheap or local models.** Small models "confidently produce wrong answers"; Qwen3-8B copies wrong numbers from the pupil's solution. | The generator holds the answer; the model only explains. | Constraint 3; a guard checks every reply for answer-before-attempt and off-tier content. |
| R4 | **Terms and minors.** Provider terms change; a key on a child's PC leaks. | OpenAI and Anthropic minor-facing use with safeguards holds; a spend cap bounds a leak. | Parent-held key, cap, no key in the browser; re-check terms each release. |
| R5 | **No-card families.** Free tiers (OpenRouter 50 req/day, Groq ~200k tokens/day) cover one to three sessions. | A parent will pay about £1 a month, or accept a slower local model. | Open question Q3; E2 measures which path parents pick. |
| R6 | **Rewards crowd out learning.** Gamification lifts extrinsic motivation more than competence. | Effort-based XP tied to attempts with a score, and weekly not daily units, avoid it. | Guardrail metric: unaided re-test scores must not fall while XP rises. |
| R7 | **Squad cold start.** O4 needs two pupils with the tool at once. | Three friends install in the same fortnight. | O4 is built third, after two installs exist. |
| R8 | **Competency bias in O2.** The AI student solves too well. | Scripted errors from the misconception bank, not model-invented ones. | Item design rule in the architecture stage. |
| R9 | **Content licence.** Only Oak is open; everything else is link-out or own-authored. | Oak's KS4 coverage per board is enough for science. | E5 checks Oak coverage for AQA 8464 before any science content. |
| R10 | **Two diverged copies.** | One master is chosen before the rebuild. | Q1. |

## Open questions

- **Q1.** Which copy is master: the repo `Matis/` or `~/Desktop/Matis_study_tutor/` (step-0
  interview done, Edexcel and weekly target recorded)?
- **Q2.** Is Edexcel confirmed with the school? It decides the trig values table and the U350
  and U562 rows.
- **Q3.** Is "parent pays about £1 a month with a card" acceptable as the default, with free
  tiers and a local model as fallbacks, or must a no-card path be first-class?
- **Q4.** Who are the first three friends, which boards and subjects, and how many are on macOS?
- **Q5.** Does the Jev guard and teach-back grader carry over as the answer-before-attempt
  guard, or is the guard re-implemented without a second vendor?
- **Q6.** Repo name and licence for the public download.
- **Q7.** What does the parent digest contain, and how often? (Weekly, factual, low-frequency
  is the evidenced shape; a live feed the teen knows is watched risks the control effect.)
- **Q8.** Which subject is second: science (Oak coverage, equation-sheet generators) or
  whatever the first friend needs?
- **Q9.** Is a shared Drive folder acceptable as the squad's exchange, or must O4 work with
  files passed by hand?
- **Q10.** TBD — needs validation: whether a 15-year-old will photograph working (O3) three
  times a week, or whether the friction kills it.

## Success metrics

| Metric | Target | Cohort | Window |
|---|---|---|---|
| Sessions logged per week, unprompted (≤1 nudge) | ≥3 | each pupil | rolling 6 weeks from install |
| Cold re-tests ≥7 days after a lesson, pass rate | ≥70% | each pupil | 6 weeks |
| Parent setup from public download, unaided | ≤30 min, 3 of 3 | first three friends' parents | first install |
| Red codes on the school sheet scoring ≥50% on the next school paper | ≥6 of 9 | Matis | next Paper 1 |
| Marks left on the table (O3) | falls 3 weeks running | any pupil using O3 | 6 weeks |
| Calibration gap (O5) | halves | each pupil | 4 weeks |
| **Guardrail:** unaided re-test score while XP rises | does not fall | each pupil | continuous |
| **Guardrail:** replies giving an answer before an attempt | 0 | every session log | continuous |
| **Guardrail:** monthly model spend per family | under the cap | each family | monthly |

## Experiments

- **E1. Adherence first (2 weeks, no engine change).** Add O1 and O5 to the existing folder on
  the chosen master and install it on Matis's PC. The question is only: does he open it three
  times a week without being told? WRONG fires here before anything else is built.
- **E2. The giveaway (1 install).** The base constraints on one friend's machine from a public
  download: time-to-first-session, whether the parent finishes unaided, which model path they
  pick, whether an update keeps progress. WRONG if setup exceeds 30 minutes.
- **E3. Model-dependent options (2 pupils, 3 weeks).** O2 and O3 on top of E2's install:
  scripted errors caught, marks-left-on-table trend, spend per session.
- **E4. Squad (2 pupils, 4 weeks).** O4 once two installs exist: one squad re-test a week held?
- **E5. Second subject (content only).** Oak coverage check for AQA 8464; one science topic
  through the three intake doors and one re-test cycle.
  Observed 2026-09-29 (T16, #18): the first attempt needed a seam in `src/` (9 hard-coded `maths`
  sites, the job persona, the vocab, sequence and label markers; commit 4a82354). After it, the
  science pack (`8464/4.1.1.2`) went in with an empty `src/` diff and passed one re-test cycle in
  `scripts/e5-science.test.ts`. Oak covers all 24 content sections of 8464 at unit level, with
  lesson-level gaps in 10 (`content/science/COVERAGE.md`). The three intake doors are owed by #19.

Door check: E1 and E2 are two-way doors (a folder and a zip). The engine choice in E2 is the
one one-way-ish door, since every option after it sits on it; spike it in `/plan-architecture`
with the delivery-architecture brief before building.

## Architecture

Architecture: [study-tutor-v2.architecture.md](./study-tutor-v2.architecture.md) (decided
2026-09-26). Chosen: a compiled local app (Bun) that serves the pages on localhost, holds the
parent's key, keeps the session flow in code and calls any OpenAI-compatible model for bounded
jobs; the tool contract (read state, write event confined to `data/`, open lesson, clock) is an
MCP server; state is an append-only event log with a derived snapshot; one item schema per
subject pack. Q5 and Q9 are answered there.

## Evidence index

- Bastani et al., PNAS 2025, unguarded vs guardrailed GPT in Turkish secondary schools: https://www.pnas.org/doi/10.1073/pnas.2422633122
- Oreopoulos & Low, Khanmigo two-year RCT, Aug 2026: https://edworkingpapers.com/sites/default/files/ai26-1551.pdf
- Aulagnon et al., streaks RCT, ~60,000 pupils, NBER 2025: https://www.nber.org/papers/w34173
- LearnLM + Eedi, UK Years 9–10: https://arxiv.org/html/2512.23633
- Medly GCSE science micro-RCT, Sep 2026: https://arxiv.org/pdf/2609.14789
- Chase, Chin, Oppezzo & Schwartz 2009, protégé effect: https://link.springer.com/article/10.1007/s10956-009-9180-4
- Kobayashi 2019, learning by teaching meta-analysis: https://onlinelibrary.wiley.com/doi/10.1111/jpr.12221
- Sinha & Kapur 2021, productive failure meta-analysis: https://journals.sagepub.com/doi/10.3102/00346543211019105
- Rohrer et al. 2020, interleaving cluster RCT: https://eric.ed.gov/?id=EJ1237752
- Butler, Fazio & Marsh 2011, hypercorrection persistence: https://link.springer.com/article/10.3758/s13423-011-0173-y
- Sparx dose-response and Cambridge/RAND findings: https://sparxmaths.com/pdf/Homework-length-trials-2018.pdf · https://www.educ.cam.ac.uk/research/programmes/sparx/SparxKeyFindings.pdf
- Eduqas Foundation examiners' report, summer 2025: https://www.eduqas.co.uk/media/1cpmvxgf/gcse-mathematics-examiners-report-summer-2025.pdf
- Handwritten maths marking with vision models, 2026: https://arxiv.org/abs/2605.19043
- Anthropic age assurance and consumer-token block: https://support.claude.com/en/articles/15171100-age-assurance-on-claude · https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/
- Gemini API terms (18+ and no under-18 audiences): https://ai.google.dev/gemini-api/terms
- OpenAI under-18 API guidance: https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance · Anthropic minors guidelines: https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors
- Oak National Academy open API and licence: https://open-api.thenational.academy/ · https://support.thenational.academy/a-guide-to-our-website-licensing
- AQA copyright policy (no apps, no AI-generated work): https://www.aqa.org.uk/about-us/who-we-are/our-standards/copyright-and-intellectual-property-policy
- Sparx topic codes (public sheet) and data handling: https://support.sparxmaths.com/en/articles/342361-sparx-maths-topic-codes · https://support.sparxmaths.com/en/articles/345062-sparx-and-data
- DfE generative AI in education guidance, Aug 2025: https://www.gov.uk/government/publications/generative-artificial-intelligence-in-education/generative-artificial-intelligence-ai-in-education
- Prior audit and research, 2026-09-21: Fredis repo `.agent/plans/matis-teaching-upgrade/findings.md` and `research/`
