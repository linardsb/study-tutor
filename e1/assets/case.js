/* Daily detective case: a fresh-number question, the hint a fictional pupil had and Jo's answer, and the
   question "where did Jo go wrong?". No dependencies. Works from file:// on any OS.
   Invariant: the answer and the working reach the page only inside the check handler, after a pick
   and a bet. The only store is localStorage under the tutor: prefix; nothing is written to disk.
   The pure functions live on CASE (window in the browser, globalThis under node or bun) so
   test-case.js can run them with the generators and the progress data passed in. */
(function () {
  'use strict';

  var root = typeof window === 'undefined' ? globalThis : window;

  var NOWHERE = 'Nowhere. The answer is right.';
  var ROLLS = 8;
  var STEP = 7919;

  /* FNV-1a, 32 bit. Seeds a day so the same date gives the same case. */
  function hash(str) {
    var h = 0x811c9dc5;
    var s = String(str);
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /* the seeded generator from .claude/tools/test-generators.js */
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function mondayOf(d) {
    var monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return iso(monday);
  }

  function fromIso(s) {
    var p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  /* a wrong-answer message speaks to the pupil; Jo's version speaks about Jo */
  function third(msg) {
    return String(msg)
      .replace(/\bYou\b/g, 'Jo')
      .replace(/\byou\b/g, 'Jo')
      .replace(/\bYour\b/g, "Jo's")
      .replace(/\byour\b/g, "Jo's");
  }

  /* codes a case can come from: a priority, a lesson and a generator, in priority order */
  function pool(progress, gen) {
    var topics = (progress && progress.topics) || [];
    return topics
      .filter(function (t) { return typeof t.priority === 'number' && t.lessonFile && gen && typeof gen[t.code] === 'function'; })
      .sort(function (a, b) { return a.priority - b.priority; })
      .map(function (t) { return t.code; });
  }

  function shuffle(list, rng) {
    var out = list.slice();
    for (var i = out.length - 1; i > 0; i -= 1) {
      var j = Math.floor(rng() * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  /* one case from one generator. Rolls again when the numbers leave no named wrong answer. */
  function buildCase(gen, code, seed) {
    var spec = null, rng = null, keys = [];
    for (var k = 0; k < ROLLS; k += 1) {
      rng = lcg((seed + k * STEP) >>> 0);
      spec = gen[code](rng);
      keys = Object.keys(spec.wrong || {});
      if (keys.length) break;
    }
    if (!keys.length) return null;

    var isRight = rng() < 0.25;
    var shown, correctText;
    if (isRight) {
      shown = spec.answers[0];
      correctText = NOWHERE;
    } else {
      var key = keys[Math.floor(rng() * keys.length)];
      shown = key;
      correctText = third(spec.wrong[key]);
    }
    var messages = [];
    keys.forEach(function (k) {
      var m = third(spec.wrong[k]);
      if (messages.indexOf(m) === -1) messages.push(m);
    });
    var options = shuffle(messages.concat([NOWHERE]), rng);
    return {
      code: code,
      stem: spec.stem,
      firstStep: spec.hint,
      shown: shown,
      options: options,
      correct: options.indexOf(correctText),
      working: spec.working,
      answer: spec.answers[0],
      isRight: isRight,
      unit: spec.type || 'number'
    };
  }

  /* the case for a date. seedCode wins when it is in the pool (yesterday's confident miss). */
  function todaysCase(progress, gen, dateIso, seedCode) {
    var codes = pool(progress, gen);
    if (!codes.length) return null;
    var at = codes.indexOf(seedCode);
    var start = at !== -1 ? at : hash(dateIso) % codes.length;
    for (var i = 0; i < codes.length; i += 1) {
      var code = codes[(start + i) % codes.length];
      var c = buildCase(gen, code, hash(dateIso + ':' + code));
      if (c) return c;
    }
    return null;
  }

  /* the stored log, or an empty one when the value is missing, corrupt or not a list */
  function parseLog(raw) {
    if (!raw) return [];
    try {
      var v = JSON.parse(raw);
      return Array.isArray(v) ? v : [];
    } catch (err) {
      return [];
    }
  }

  /* entries are { bet, right }; the sums behind "you bet B and won W" */
  function calibration(entries) {
    var bet = 0, won = 0;
    entries.forEach(function (e) {
      var b = Number(e.bet) || 0;
      bet += b;
      if (e.right) won += b;
    });
    return { bet: bet, won: won, n: entries.length };
  }

  /* days this week with real work: a session row, a case or a finished set. Opens do not count. */
  function flame(sessions, log, weekStart, todayIso) {
    var days = {};
    (sessions || []).forEach(function (s) {
      if (s.date >= weekStart && s.date <= todayIso) days[s.date] = true;
    });
    (log || []).forEach(function (e) {
      if ((e.mode === 'case' || e.mode === 'quiz') && e.d >= weekStart && e.d <= todayIso) days[e.d] = true;
    });
    return Object.keys(days).length;
  }

  /* distinct days with any entry in the last `days` days, today included */
  function opens(log, todayIso, days) {
    var from = fromIso(todayIso);
    from.setDate(from.getDate() - (days - 1));
    var fromIsoStr = iso(from);
    var seen = {};
    (log || []).forEach(function (e) {
      if (e && e.d >= fromIsoStr && e.d <= todayIso) seen[e.d] = true;
    });
    var dates = Object.keys(seen).sort();
    return { count: dates.length, dates: dates };
  }

  root.CASE = {
    NOWHERE: NOWHERE,
    hash: hash,
    lcg: lcg,
    iso: iso,
    mondayOf: mondayOf,
    third: third,
    pool: pool,
    buildCase: buildCase,
    todaysCase: todaysCase,
    calibration: calibration,
    parseLog: parseLog,
    flame: flame,
    opens: opens
  };

  /* ---- the page, only where there is a document and a #case holder ---- */

  if (typeof document === 'undefined') return;
  var holder = document.getElementById('case');
  if (!holder) return;

  var P = root.PROGRESS;
  var GEN = root.GEN;
  var today = iso(new Date());
  var storageOk = true;
  var log = [];
  var seed = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /* wrong-answer keys spell pi as "pi"; the stem writes π */
  function show(s) { return String(s).replace(/(\d)pi\b/g, '$1π'); }

  /* a corrupt log is empty, not a storage failure: the next save overwrites it */
  var raw = null;
  try {
    raw = localStorage.getItem('tutor:log');
    seed = localStorage.getItem('tutor:seed');
  } catch (err) {
    storageOk = false;
  }
  log = parseLog(raw);

  function save() {
    if (!storageOk) return;
    try {
      localStorage.setItem('tutor:log', JSON.stringify(log));
    } catch (err) {
      storageOk = false;
      note();
    }
  }
  function setSeed(code) {
    try { localStorage.setItem('tutor:seed', code); } catch (err) { /* nothing to do */ }
  }
  function clearSeed() {
    try { localStorage.removeItem('tutor:seed'); } catch (err) { /* nothing to do */ }
  }
  function note() {
    if (document.getElementById('storage-note')) return;
    var p = document.createElement('p');
    p.className = 'note';
    p.id = 'storage-note';
    p.textContent = 'This browser is not saving your cases. Ask Dad.';
    var header = document.querySelector('header');
    (header || holder.parentNode).appendChild(p);
  }
  if (!storageOk) note();

  log.push({ d: today, mode: 'open-case' });
  save();

  function caseEntries() {
    return log.filter(function (e) { return e.mode === 'case'; });
  }
  function calibrationLine() {
    var last = caseEntries().slice(-7).map(function (e) {
      var m = /^(right|wrong), bet (\d)$/.exec(e.quiz || '');
      return { right: m ? m[1] === 'right' : false, bet: m ? Number(m[2]) : 0 };
    });
    var c = calibration(last);
    return c.n === 1
      ? 'First case. You bet ' + c.bet + ' and won ' + c.won + '.'
      : 'Over your last ' + c.n + ' cases you bet ' + c.bet + ' and won ' + c.won + '.';
  }
  function lessonLink(code) {
    var t = ((P && P.topics) || []).filter(function (x) { return x.code === code && x.lessonFile; })[0];
    return t ? ' <a href="' + esc(t.lessonFile) + '">lesson</a>' : '';
  }

  if (!P || !GEN || !root.CASE) {
    holder.innerHTML = '<p class="note">No data yet. Ask Claude for progress.</p>';
    return;
  }

  var doneToday = log.filter(function (e) { return e.mode === 'case' && e.d === today; });

  /* the done state: yesterday's seed may be gone, so the code comes from the log entry */
  if (doneToday.length) {
    var first = doneToday[0];
    var c0 = todaysCase(P, GEN, today, first.code);
    var m0 = /^(right|wrong), bet (\d)$/.exec(first.quiz || '');
    var picked = m0 ? m0[1] : 'done';
    holder.innerHTML = c0
      ? '<div class="q done ' + esc(picked) + '">' +
        '<p class="stem">' + esc(c0.stem) + '</p>' +
        '<p>The hint Jo had: ' + esc(c0.firstStep) + '</p>' +
        '<p>Jo’s answer: <b>' + esc(show(c0.shown)) + '</b></p>' +
        '<p class="feedback">' + (picked === 'right' ? 'You had it. ' : 'Not this time. ') + esc(c0.options[c0.correct]) + '</p>' +
        '<div class="working"><p>Working: ' + esc(c0.working) + '</p></div>' +
        '<p class="calibration">' + esc(calibrationLine()) + '</p>' +
        '<p class="meta">' + esc(c0.code) + lessonLink(c0.code) + '</p>' +
        '</div>' +
        '<p class="note">Back tomorrow. <a href="map.html">Map</a></p>'
      : '<p class="note">Done for today. <a href="map.html">Map</a></p>';
    return;
  }

  function render(c, heading, isReask) {
    var q = document.createElement('div');
    q.className = 'q';
    var radios = c.options.map(function (o, i) {
      return '<label><input type="radio" name="pick' + (isReask ? '2' : '') + '" value="' + i + '"> ' + esc(o) + '</label>';
    }).join('');
    var bets = [['1', '1 (a guess)'], ['2', '2'], ['3', '3 (would bet on it)']].map(function (b) {
      return '<label><input type="radio" name="bet' + (isReask ? '2' : '') + '" value="' + b[0] + '"> ' + esc(b[1]) + '</label>';
    }).join('');
    q.innerHTML =
      (heading ? '<h2>' + esc(heading) + '</h2>' : '') +
      '<p class="stem">' + esc(c.stem) + '</p>' +
      '<p>The hint Jo had: ' + esc(c.firstStep) + '</p>' +
      '<p>Jo’s answer: <b>' + esc(show(c.shown)) + '</b></p>' +
      '<p>Where did Jo go wrong?</p>' +
      '<div class="options">' + radios + '</div>' +
      '<div class="bet"><span>How sure are you?</span> ' + bets + '</div>' +
      '<button type="button" class="check">Check</button>' +
      '<p class="feedback" hidden></p>' +
      '<div class="working" hidden></div>' +
      '<p class="calibration" hidden></p>';
    holder.appendChild(q);

    var btn = q.querySelector('.check');
    var fb = q.querySelector('.feedback');
    var work = q.querySelector('.working');
    var cal = q.querySelector('.calibration');

    function checked(name) {
      var el = q.querySelector('input[name="' + name + '"]:checked');
      return el ? Number(el.value) : null;
    }

    btn.addEventListener('click', function () {
      if (q.classList.contains('done')) return;
      var pick = checked('pick' + (isReask ? '2' : ''));
      var bet = checked('bet' + (isReask ? '2' : ''));
      if (pick === null) {
        fb.hidden = false;
        fb.textContent = 'Pick one first.';
        return;
      }
      if (bet === null) {
        fb.hidden = false;
        fb.textContent = 'How sure? 1, 2 or 3 first';
        return;
      }
      var right = pick === c.correct;
      q.classList.add('done', right ? 'right' : 'wrong');
      fb.hidden = false;
      fb.textContent = right
        ? 'Right. You bet ' + bet + '.'
        : 'Not this time. You bet ' + bet + '. ' + c.options[c.correct];
      /* the answer and the working enter the page here and nowhere earlier */
      work.hidden = false;
      work.innerHTML = '<p>Working: ' + esc(c.working) + '</p>' +
        '<p class="meta">' + esc(c.code) + lessonLink(c.code) + '</p>';
      q.querySelectorAll('input').forEach(function (r) { r.disabled = true; });
      btn.disabled = true;

      log.push({ d: today, mode: 'case', code: c.code, quiz: (right ? 'right' : 'wrong') + ', bet ' + bet });
      save();
      if (!isReask && seed === c.code) clearSeed();
      cal.hidden = false;
      cal.textContent = calibrationLine();

      /* a confident miss: the same idea again now, and again tomorrow */
      if (!isReask && bet === 3 && !right) {
        setSeed(c.code);
        var again = buildCase(GEN, c.code, hash(today + ':again'));
        if (again) render(again, 'Same idea, new numbers.', true);
      } else {
        var back = document.createElement('p');
        back.className = 'note';
        back.innerHTML = 'Back tomorrow. <a href="map.html">Map</a>';
        holder.appendChild(back);
      }
    });
  }

  var c = todaysCase(P, GEN, today, seed);
  if (!c) {
    holder.innerHTML = '<p class="note">No case today. Ask Claude for progress.</p>';
    return;
  }
  render(c, null, false);
}());
