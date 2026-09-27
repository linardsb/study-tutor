/* Self-marking quiz + copy buttons. No dependencies. Works from file:// on any OS.
   Invariant: the answer and the working stay hidden until the student commits an answer.
   initQuiz(el) is exported on window so a quiz added to the page later can be started. */
(function () {
  'use strict';

  function norm(s) {
    return String(s)
      .toLowerCase()
      .replace(/[£€$]/g, '')
      .replace(/−/g, '-')
      .replace(/π/g, 'pi')
      .replace(/²/g, '2')
      .replace(/³/g, '3')
      .replace(/[°º]/g, '')
      .replace(/\bdeg(rees)?\b/g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '')
      .replace(/^\+/, '')
      .replace(/^(-?)0+(\d)/, '$1$2')
      .replace(/^(-?)\./, '$10.')
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
  }

  /* base64 in the markup is UTF-8, so × ÷ £ and ² survive the round trip */
  function decodeB64(s) {
    return new TextDecoder().decode(Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }));
  }

  /* the matching encoder, for items built on the page from assets/generate.js */
  function encodeB64(s) {
    var bytes = new TextEncoder().encode(String(s));
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return btoa(out);
  }

  function accepted(q) {
    try {
      return decodeB64(q.dataset.a).split('|').map(norm);
    } catch (e) {
      return [];
    }
  }

  /* data-wrong: base64 of "wrong1=message|wrong2=message". Keys normalise like data-a. */
  function diagnoses(q) {
    var map = {};
    if (!q.dataset.wrong) return map;
    try {
      decodeB64(q.dataset.wrong).split('|').forEach(function (pair) {
        var at = pair.indexOf('=');
        if (at < 1) return;
        map[norm(pair.slice(0, at))] = pair.slice(at + 1).trim();
      });
    } catch (e) {
      return {};
    }
    return map;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var SURE_NOTE = ' Press Sure only if you would bet on it. Wrong after Sure is the most useful thing that can happen here: it shows which bit you only thought you knew.';

  /* ---- fresh numbers, from assets/generate.js when the page loads it ---- */

  function generators() {
    return (typeof window === 'undefined' ? globalThis : window).GEN || null;
  }

  /* one .q element from a generator's object, built the way a lesson writes one by hand */
  function buildItem(spec, number) {
    var q = document.createElement('div');
    q.className = 'q';
    q.dataset.a = encodeB64(spec.answers.join('|'));
    var named = Object.keys(spec.wrong || {});
    if (named.length) {
      q.dataset.wrong = encodeB64(named.map(function (k) {
        return k + '=' + String(spec.wrong[k]).replace(/\|/g, ' ');
      }).join('|'));
    }
    var stem = document.createElement('p');
    stem.className = 'stem';
    stem.textContent = number + '. ' + spec.stem;
    var label = document.createElement('label');
    label.textContent = 'Your answer ';
    var input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    label.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'check';
    btn.textContent = 'Check';
    var fb = document.createElement('p');
    fb.className = 'feedback';
    fb.hidden = true;
    q.append(stem, label, btn, fb);
    if (spec.hint) {
      var hint = document.createElement('p');
      hint.className = 'hint';
      hint.hidden = true;
      hint.textContent = spec.hint;
      q.appendChild(hint);
    }
    var work = document.createElement('div');
    work.className = 'working';
    work.hidden = true;
    var wp = document.createElement('p');
    wp.textContent = spec.working;
    work.appendChild(wp);
    q.appendChild(work);
    return q;
  }

  /* a whole quiz of fresh items. codes is one code, or several for a mixed set.
     No two items in a row come from the same code, whenever more than one is ticked. */
  function buildQuiz(codes, count, label, showCode) {
    var GEN = generators();
    if (!GEN) return null;
    var pool = codes.filter(function (c) { return typeof GEN[c] === 'function'; });
    if (!pool.length) return null;

    /* round robin over a shuffled list, so the no-two-in-a-row rule never needs a retry */
    var order = pool.slice();
    for (var i = order.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = order[i]; order[i] = order[j]; order[j] = t;
    }
    var picks = [];
    for (var n = 0; n < count; n += 1) picks.push(order[n % order.length]);

    var quiz = document.createElement('section');
    quiz.className = 'quiz';
    quiz.dataset.code = pool.length === 1 ? pool[0] : 'mixed';
    if (label) quiz.dataset.label = label;
    var h = document.createElement('h2');
    h.textContent = label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Fresh set';
    var intro = document.createElement('p');
    intro.textContent = 'New numbers. Answer from memory. The working appears only after you check.';
    quiz.append(h, intro);
    picks.forEach(function (code, idx) {
      var spec = GEN[code](Math.random);
      var item = buildItem(spec, idx + 1);
      if (showCode) item.dataset.itemCode = code;
      quiz.appendChild(item);
    });
    return quiz;
  }

  /* the button under a finished quiz, once per quiz */
  function offerFreshSet(quiz) {
    var GEN = generators();
    var code = quiz.dataset.code;
    if (!GEN || !code || typeof GEN[code] !== 'function') return;
    if (quiz.querySelector('.more')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'more';
    btn.textContent = 'Five more, fresh numbers';
    btn.addEventListener('click', function () {
      var next = buildQuiz([code], 5, code + ', fresh set');
      if (!next) return;
      btn.disabled = true;
      quiz.parentNode.insertBefore(next, quiz.nextSibling);
      initQuiz(next);
      next.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    quiz.appendChild(btn);
  }

  function initQuiz(quiz) {
    if (!quiz || quiz.dataset.inited) return;
    var items = Array.prototype.slice.call(quiz.querySelectorAll('.q'));
    if (!items.length) return;
    quiz.dataset.inited = '1';

    /* the "Try it" intro: the first paragraph that is a direct child, before .score exists */
    var intro = null;
    for (var i = 0; i < quiz.children.length; i += 1) {
      if (quiz.children[i].tagName === 'P') { intro = quiz.children[i]; break; }
    }
    if (intro && intro.textContent.indexOf('would bet on it') === -1) {
      intro.textContent = intro.textContent.replace(/\s+$/, '') + SURE_NOTE;
    }

    var done = 0, right = 0, wrong = 0, sureWrong = 0;
    var summary = quiz.querySelector('.score');
    if (!summary) {
      summary = document.createElement('p');
      summary.className = 'score';
      quiz.appendChild(summary);
    }

    function render() {
      var code = quiz.dataset.label || quiz.dataset.code || 'this topic';
      var tail = wrong === 0 ? 'No wrong answers.'
        : wrong + ' wrong, ' +
          (sureWrong === 0 ? 'none' : sureWrong === wrong ? (wrong === 1 ? 'it was' : wrong === 2 ? 'both' : 'all') : sureWrong) +
          ' marked Sure.';
      var finished = done === items.length;
      var line = finished
        ? right + '/' + items.length + ' on ' + code + '. ' + tail
        : 'So far ' + right + '/' + done + ' on ' + code + '. ' + tail;
      var prompt = finished ? 'I scored ' + line : line;
      summary.innerHTML =
        '<span class="scoreline">' + escapeHtml(line) + '</span> ' +
        '<span data-prompt="' + escapeHtml(prompt) + '">Tell Claude: <b>' + escapeHtml(prompt) + '</b> ' +
        '<button type="button" class="copy" aria-label="Copy prompt"></button></span>';
      if (finished) {
        /* E1: a finished set counts as a session day on the map; nothing else is stored */
        try {
          var log = JSON.parse(localStorage.getItem('tutor:log') || '[]');
          var d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          log.push({ d: day, mode: 'quiz', code: quiz.dataset.code || 'quiz', quiz: right + '/' + items.length });
          localStorage.setItem('tutor:log', JSON.stringify(log));
        } catch (err) { /* private window or storage off: the quiz still works */ }
        offerFreshSet(quiz);
        summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    items.forEach(function (q, idx) {
      var input = q.querySelector('input');
      var btn = q.querySelector('.check');
      var fb = q.querySelector('.feedback');
      var hint = q.querySelector('.hint');
      var work = q.querySelector('.working:not(.faded)');   /* a .faded working stays visible */
      if (!input || !btn || !fb) return;
      var tries = 0, sureAtFirst = null;

      /* Sure / Not sure, injected here so lesson markup never changes */
      var name = 'sure-' + (quiz.dataset.code || 'q') + '-' + idx;
      var conf = document.createElement('span');
      conf.className = 'confidence';
      conf.innerHTML =
        '<label><input type="radio" name="' + name + '" value="sure"> Sure</label> ' +
        '<label><input type="radio" name="' + name + '" value="notsure"> Not sure</label>';
      btn.parentNode.insertBefore(conf, btn);
      function confidence() {
        var c = conf.querySelector('input:checked');
        return c ? c.value : null;
      }

      function check() {
        if (q.classList.contains('done')) return;
        var val = norm(input.value);
        if (!val) {
          fb.hidden = false;
          fb.textContent = 'Write an answer first, even a guess.';
          return;
        }
        if (!confidence()) {
          fb.hidden = false;
          fb.textContent = 'Sure or not sure first';
          return;
        }
        tries += 1;
        if (sureAtFirst === null) sureAtFirst = confidence() === 'sure';
        var ok = accepted(q).indexOf(val) !== -1;
        var named = ok ? null : diagnoses(q)[val];
        fb.hidden = false;
        if (!ok && tries < 2) {
          if (hint) {
            hint.hidden = false;
            fb.textContent = named || 'Not this time. Read the first step below, then try again.';
          } else {
            fb.textContent = named || 'Not this time. Try once more before the working shows.';
          }
          input.focus();
          return;
        }
        q.classList.add('done', ok ? 'right' : 'wrong');
        fb.textContent = ok
          ? (tries === 1 ? 'Correct.' : 'Correct on the second go.')
          : (named || 'Not this time. Read the working, then tell Claude what you did differently.');
        if (work) work.hidden = false;
        input.disabled = true;
        btn.disabled = true;
        conf.querySelectorAll('input').forEach(function (r) { r.disabled = true; });
        done += 1;
        if (ok) right += 1; else { wrong += 1; if (sureAtFirst) sureWrong += 1; }
        render();
      }

      btn.addEventListener('click', check);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); check(); }
      });
    });
  }

  /* a copy button per method step, so a stuck step goes to Claude in one click.
     Numbering runs on across a second list, for topics with two methods. */
  function wireMethodSteps() {
    var lists = document.querySelectorAll('#method ol');
    if (!lists.length) return;
    var quiz = document.querySelector('.quiz[data-code]');
    var code = quiz ? quiz.dataset.code : (document.title.split(' ')[0] || 'this topic');
    var n = 0;
    lists.forEach(function (list) {
      Array.prototype.slice.call(list.children).forEach(function (li) {
        if (li.tagName !== 'LI') return;
        n += 1;
        if (li.querySelector('.copy')) return;
        var step = li.textContent.replace(/\s+/g, ' ').trim();
        li.dataset.prompt = "I don't get step " + n + ' of ' + code + ': ' + step;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'copy';
        btn.setAttribute('aria-label', 'Copy step ' + n + ' as a question for Claude');
        li.appendChild(document.createTextNode(' '));
        li.appendChild(btn);
      });
    });
  }

  function start() {
    document.querySelectorAll('.quiz').forEach(initQuiz);
    wireMethodSteps();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.initQuiz = initQuiz;
  window.buildQuiz = buildQuiz;

  /* copy buttons: show-me convention, one delegated listener */
  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('.copy');
    if (!btn) return;
    var holder = btn.closest('[data-prompt]');
    if (!holder) return;
    var text = holder.dataset.prompt;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      var ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.classList.add('copied');
    setTimeout(function () { btn.classList.remove('copied'); }, 1200);
  });
})();
