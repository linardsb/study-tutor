/* Checks the pure case logic in assets/case.js against the v1 folder's generators and data.
     bun e1/test-case.js        or        node e1/test-case.js
     V1=<path> points at another copy of the tutor folder.

   Runs from this repo's e1/ folder or, once installed, from <v1>/.claude/tools/. Reads the v1
   folder and never writes to it. Same shape as .claude/tools/test-generators.js: seeded runs, a
   failures list, a per-code summary, exit 1 on any failure. */
'use strict';

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const V1 = process.env.V1 || path.join(os.homedir(), 'Desktop', 'Matis_study_tutor');
const CASE_PATHS = [path.join(__dirname, 'assets', 'case.js'), path.join(__dirname, '..', '..', 'assets', 'case.js')];
const casePath = CASE_PATHS.find(p => fs.existsSync(p));
if (!casePath) { console.log('case.js not found next to this test'); process.exit(1); }

require(path.join(V1, 'assets', 'generate.js'));
require(path.join(V1, 'assets', 'progress-data.js'));
require(casePath);
const GEN = globalThis.GEN;
const PROGRESS = globalThis.PROGRESS;
const C = globalThis.CASE;

/* norm and tail from test-generators.js, same behaviour (replaceAll and a function replacer for
   Sonar): quiz.js is private to its IIFE and touches document at load */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[£€$]/g, '')
    .replaceAll('π', 'pi')
    .replaceAll('²', '2')
    .replaceAll('³', '3')
    .replace(/[°º]/g, '')
    .replace(/\bdeg(rees)?\b/g, '')
    .replaceAll(',', '')
    .replace(/\s+/g, '')
    .replace(/^\+/, '')
    .replace(/^(-?)0+(\d)/, '$1$2')
    .replace(/^(-?)\./, (m, sign) => sign + '0.')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}

const UNIT = /\s*(cm³|cm²|m³|m²|cm|mm|km|kg|g\/cm³|kg\/m³|n\/m²|n\/cm²|m\/s²|m\/s|ml|litres|degrees|pounds|off|each|n|m|g|p)\.?$/i;
function tail(working) {
  const at = working.lastIndexOf('=');
  if (at === -1) return null;
  return working.slice(at + 1).replace(/[.\s]+$/, '').replace(UNIT, '').trim();
}

const RUNS = 300;
const SECOND_PERSON = /\b(you|your)\b/i;
let failures = [];
const fail = m => failures.push(m);
const assert = (ok, m) => { if (!ok) fail(m); };

/* 1. the pool: every topic with a priority, a lesson and a generator, ascending priority */
const pool = C.pool(PROGRESS, GEN);
const expected = PROGRESS.topics
  .filter(t => typeof t.priority === 'number' && t.lessonFile && typeof GEN[t.code] === 'function')
  .sort((a, b) => a.priority - b.priority)
  .map(t => t.code);
assert(pool.join() === expected.join(), `pool: got ${pool.join()} expected ${expected.join()}`);
assert(pool.length === 21 && pool[0] === 'U349' && pool[pool.length - 1] === 'U545',
  `pool on the 2026-09-26 data: 21 codes U349 first U545 last, got ${pool.length} ${pool[0]} ${pool[pool.length - 1]}`);

/* 2. buildCase over 300 seeds per code */
const perCode = {};
for (const code of pool) {
  let sawRight = false, sawWrong = false, n = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const seed = (0x5eed + i * 7919) >>> 0;
    const c = C.buildCase(GEN, code, seed);
    const f = m => { n += 1; fail(`${code} seed ${seed}: ${m}`); };
    if (!c) { f('buildCase returned null'); continue; }
    if (c.options.length < 2 || c.options.length > 5) f(`${c.options.length} options`);
    const isNowhere = c.options[c.correct] === C.NOWHERE;
    if (isNowhere !== c.isRight) f(`options[correct] is the nowhere string ${isNowhere} while isRight is ${c.isRight}`);
    if (c.isRight) sawRight = true; else sawWrong = true;
    /* buildCase rolls again on an empty wrong map (seed + k * 7919), so find the roll it kept */
    let spec = null;
    for (let k = 0; k < 8; k += 1) {
      spec = GEN[code](C.lcg((seed + k * 7919) >>> 0));
      if (Object.keys(spec.wrong || {}).length) break;
    }
    if (c.isRight) {
      if (c.shown !== spec.answers[0]) f(`shown "${c.shown}" is not answers[0] while isRight`);
    } else {
      /* the shown wrong answer must not be a right one, by the same normalisation quiz.js applies,
         and the correct option must be the message for the key that was shown */
      const accepted = (spec.answers || []).map(norm);
      if (accepted.includes(norm(c.shown))) f(`shown "${c.shown}" is a right answer while isRight is false`);
      if (c.options[c.correct] !== C.third(spec.wrong[c.shown])) f(`correct option is not the message for shown "${c.shown}"`);
    }
    c.options.forEach(o => { if (SECOND_PERSON.test(o)) f(`option speaks to the pupil: "${o}"`); });
    if (c.unit === 'text') {
      const end = norm(c.working).replace(/\.$/, '');
      if (!end.endsWith(norm(c.answer))) f(`the working does not end on the answer "${c.answer}"`);
    } else {
      const t = tail(c.working);
      if (t === null || norm(t) !== norm(c.answer)) f(`the working ends "= ${t}" but the answer is "${c.answer}"`);
    }
    if (!c.stem || !c.firstStep || c.shown == null) f('a field is missing');
  }
  if (!sawRight) { n += 1; fail(`${code}: no run in ${RUNS} had isRight === true`); }
  if (!sawWrong) { n += 1; fail(`${code}: no run in ${RUNS} had isRight === false`); }
  perCode[code] = n;
}

/* 3. todaysCase: 400 consecutive dates, never null, same case twice for the same date */
{
  const d = new Date(2026, 8, 28);
  for (let i = 0; i < 400; i += 1) {
    const dateIso = C.iso(d);
    const a = C.todaysCase(PROGRESS, GEN, dateIso, null);
    const b = C.todaysCase(PROGRESS, GEN, dateIso, null);
    if (!a) fail(`todaysCase ${dateIso}: null`);
    else if (JSON.stringify(a) !== JSON.stringify(b)) fail(`todaysCase ${dateIso}: two calls differ`);
    d.setDate(d.getDate() + 1);
  }
}

/* 4. the seed code wins whatever the date */
{
  const d = new Date(2026, 8, 28);
  for (let i = 0; i < 30; i += 1) {
    const dateIso = C.iso(d);
    const c = C.todaysCase(PROGRESS, GEN, dateIso, 'U349');
    if (!c || c.code !== 'U349') fail(`todaysCase ${dateIso} with seed U349 gave ${c?.code}`);
    d.setDate(d.getDate() + 1);
  }
  const off = C.todaysCase(PROGRESS, GEN, '2026-09-28', 'U000');
  assert(off && off.code === C.pool(PROGRESS, GEN)[C.hash('2026-09-28') % 21], 'an unknown seed code falls back to the date pick');
}

/* 5. calibration on a fixture: bets 3,1,2,3,2,1,3 = 15; right on the 3,2,3,1 entries = 9 */
{
  const fx = [
    { bet: 3, right: true }, { bet: 1, right: false }, { bet: 2, right: true }, { bet: 3, right: false },
    { bet: 2, right: false }, { bet: 1, right: true }, { bet: 3, right: true }
  ];
  const c = C.calibration(fx);
  assert(c.n === 7 && c.bet === 15 && c.won === 9,
    `calibration: expected n 7, bet 3+1+2+3+2+1+3 = 15, won 3+2+1+3 = 9; got n ${c.n} bet ${c.bet} won ${c.won}`);
  const one = C.calibration([{ bet: 2, right: false }]);
  assert(one.n === 1 && one.bet === 2 && one.won === 0, 'calibration on one entry');
}

/* 6. flame: a day once; opens ignored; before weekStart ignored */
{
  const sessions = [{ date: '2026-09-29', mode: 'lesson', code: 'U349' }, { date: '2026-09-27', mode: 'lesson', code: 'U687' }];
  const log = [
    { d: '2026-09-29', mode: 'case', code: 'U349', quiz: 'right, bet 2' },
    { d: '2026-09-29', mode: 'quiz', code: 'mixed', quiz: '4/6' },
    { d: '2026-09-30', mode: 'open-map' },
    { d: '2026-09-30', mode: 'open-case' },
    { d: '2026-10-01', mode: 'quiz', code: 'U349', quiz: '5/5' },
    { d: '2026-09-27', mode: 'case', code: 'U349', quiz: 'wrong, bet 3' }
  ];
  /* 2026-09-28 is a Monday; the 27th is the Sunday before it */
  const n = C.flame(sessions, log, '2026-09-28', '2026-10-01');
  assert(n === 2, `flame: 29th (session, case and quiz, once) and 1st (quiz) = 2, got ${n}`);
  assert(C.mondayOf(new Date(2026, 9, 1)) === '2026-09-28', 'mondayOf a Thursday is the Monday before');
  assert(C.mondayOf(new Date(2026, 8, 28)) === '2026-09-28', 'mondayOf a Monday is itself');
}

/* 7. opens: 14 days with entries on 5 dates */
{
  const log = ['2026-09-18', '2026-09-20', '2026-09-20', '2026-09-25', '2026-09-30', '2026-10-01', '2026-09-17']
    .map(d => ({ d, mode: 'open-map' }));
  const o = C.opens(log, '2026-10-01', 14);
  assert(o.count === 5 && o.dates.join() === '2026-09-18,2026-09-20,2026-09-25,2026-09-30,2026-10-01',
    `opens: 18, 20, 25, 30, 1 = 5 within 2026-09-18..2026-10-01 (the 17th is day 15); got ${o.count} ${o.dates.join()}`);
}

/* 8. third person */
assert(C.third('You added 25 on.') === 'Jo added 25 on.', 'third: You -> Jo');
assert(C.third('That is 10% of 120.') === 'That is 10% of 120.', 'third: no pronoun, unchanged');
assert(C.third('Check your units; you halved it.') === "Check Jo's units; Jo halved it.", 'third: your -> Jo\'s, you -> Jo');

/* 9. the hash is stable and unsigned */
{
  const h1 = C.hash('2026-09-28');
  const h2 = C.hash('2026-09-28');
  assert(h1 === h2 && C.hash('a') >= 0, 'hash: deterministic, unsigned');
  assert(h1 !== C.hash('2026-09-29'), 'hash: two dates differ');
}

/* 10. parseLog: a corrupt or non-list value is an empty log, never a throw */
{
  const good = [{ d: '2026-09-27', mode: 'open-map' }];
  assert(JSON.stringify(C.parseLog(JSON.stringify(good))) === JSON.stringify(good), 'parseLog: a stored list comes back');
  assert(C.parseLog('{bad').length === 0, 'parseLog: corrupt JSON is an empty log');
  assert(C.parseLog('{"a":1}').length === 0, 'parseLog: a non-list is an empty log');
  assert(C.parseLog(null).length === 0 && C.parseLog('').length === 0, 'parseLog: missing is an empty log');
}

const lines = [];
lines.push(`codes in the pool: ${pool.length}   runs each: ${RUNS}`);
for (const code of pool) lines.push(`  ${code}  ${perCode[code] === 0 ? 'pass' : perCode[code] + ' failed'}`);
console.log(lines.join('\n'));

if (failures.length) {
  const show = Number(process.env.SHOW || 12);
  console.log('\n' + failures.slice(0, show).join('\n'));
  if (failures.length > show) console.log(`... and ${failures.length - show} more`);
  console.log(`\n${failures.length} failures across ${pool.length * RUNS} runs`);
  process.exit(1);
}
console.log(`\nall ${pool.length * RUNS} runs pass, plus the fixture checks`);
