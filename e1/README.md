# E1: does he open it unprompted?

The one question (PRD E1): over two weeks, on how many days does Matis open the map or the case
without being asked. The pages here are the smallest thing that can answer it. Nothing in `src/`,
`app/` or `content/` uses this code; T2 onward takes the page shapes only.

Ticket: linardsb/study-tutor#2. Epic: #1. Plan: `.claude/plans/e1-map-and-detective-case-v1-folder.md`.

## Files

| File | What it is |
|---|---|
| `map.html` | the pupil's home page: one level per topic, the weekly flame, today's case, the two-week count of opens |
| `case.html` | one detective case a day: Jo's first step and answer, "where did Jo go wrong?", a 1 to 3 bet, a calibration line |
| `assets/case.js` | the case logic on `CASE` (pure, tested) plus the page wiring for `case.html` |
| `assets/quiz.js` | the v1 file plus seven lines: a finished set logs a `quiz` entry so the flame counts it |
| `Open map.bat`, `Open case.bat` | double-click launchers, CRLF like the existing ones |
| `test-case.js` | 300 seeds per code plus fixture checks; installs to `.claude/tools/` in the v1 folder |
| `install.sh` | copies the above into the v1 folder and runs both tests there |

Both pages store only `tutor:log` (entries of `{ d, mode, code, quiz }`, the columns a `sessions.md`
row holds) and `tutor:seed` (a code) in the browser's `localStorage`. Nothing is written to disk.

## Install on this Mac

```bash
bash e1/install.sh                 # default target ~/Desktop/Matis_study_tutor
bash e1/install.sh /path/to/copy   # another copy
```

It refuses if the target has no `assets/generate.js`. It copies, never deletes, and never touches
`sessions.md`, `topics.md`, `assets/progress-data.js`, `MISSION.md` or `learning-records/`.

## Ship to the PC

The PC copy is the master once he has records, so do not zip the whole folder. Ship only the files
the update list in `README-for-Linards.md` names, which now includes:

- `map.html`, `case.html`
- `assets\case.js`, `assets\quiz.js`
- `Open map.bat`, `Open case.bat`
- `.claude\tools\test-case.js`
- `README-for-Matis.md`, `README-for-Linards.md`, `SETUP-PC.html`

Copy them over the PC folder. Then, on the PC in Edge:

1. Double-click `Open map.bat`. The stats row shows `0 of your 3` and `1 of the last 14`. No red note
   at the top means a write read back: storage works in that browser.
2. Close Edge. Double-click `Open map.bat` again. Still `1 of the last 14`, still no red note.
3. Double-click `Open case.bat`, do the case, reload: the done state shows, not a new case.
4. Optional: F12, Application, Local Storage, `file://`, `tutor:log` is there.

Write the install date below and comment on issue #2 with it.

## The read, day 14

Open `map.html` on the PC. Click the copy button next to `days you opened this`. Paste the line
into issue #2 as a comment. It looks like:

```
E1 2026-10-11: opened on 6 of 14 days (2026-09-28, ...), cases 5, sets 2
```

That line is E1's only output. The PRD threshold is in the PRD success metrics; the count decides
whether T2 onward is built.

## Dates

| | |
|---|---|
| Installed on the PC | (to fill in) |
| Read | install date + 14 days |

## Nudge log

The pages cannot know whether a nudge happened. Write every one here so "unprompted" has a record.
The PRD allows at most one.

| Date | Who nudged | What was said |
|---|---|---|
| | | |

## Result

(empty until the read)
