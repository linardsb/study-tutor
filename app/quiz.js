/* Self-marking quiz + copy buttons. No dependencies.
   Invariant: the answer and the working stay hidden until the pupil commits an answer.
   Items come from the items file named in the quiz section's data-items, or from a generator for a
   fresh set. Each item's first check posts one attempt event to the tutor.
   Runs in the browser. Loaded under Bun by src/marking/quiz.test.ts, so nothing here touches
   document at load time. */
(() => {
  /* the same 16 steps as src/marking/normalise.ts; quiz.test.ts checks the two agree */
  function norm(s) {
    return String(s)
      .toLowerCase()
      .replace(/[£€$]/g, "")
      .replace(/−/g, "-")
      .replace(/π/g, "pi")
      .replace(/²/g, "2")
      .replace(/³/g, "3")
      .replace(/[°º]/g, "")
      .replace(/\bdeg(rees)?\b/g, "")
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .replace(/^\+/, "")
      .replace(/^(-?)0+(\d)/, "$1$2")
      .replace(/^(-?)\./, (_, sign) => `${sign}0.`)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  }

  /* the same as src/marking/vocab.ts: a leading "the", "a" or "an" is dropped */
  function vocabCanon(s) {
    return norm(String(s).replace(/^\s*(the|a|an)\s+/i, ""));
  }

  /* the same as src/marking/sequence.ts: "B, D, A, C", "b then d then a then c" and "BDAC" are all "bdac" */
  function sequenceCanon(s) {
    return String(s)
      .toLowerCase()
      .replace(/\b(then|and)\b/g, "")
      .replace(/[^a-z]/g, "");
  }

  /* the same as src/marking/label.ts: parts in order, comma-separated, each a vocab answer */
  function labelCanon(s) {
    return String(s)
      .split(/[,;\n]/)
      .map(vocabCanon)
      .filter((x) => x !== "")
      .join("|");
  }

  /* the same choice as canonFor in src/marking/answer.ts; a generated item has no type */
  function canonFor(type) {
    if (type === "vocab") return vocabCanon;
    if (type === "sequence") return sequenceCanon;
    if (type === "label") return labelCanon;
    return norm;
  }

  /* the same seeded rng as scripts/test-generators.ts, so a seed in an event rebuilds the numbers */
  function lcg(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  /* right, or the named misconception the typed answer matches, or neither */
  function mark(item, typed) {
    const canon = canonFor(item.type);
    const val = canon(typed);
    /* an empty answer is never right, whatever the type */
    const ok = val !== "" && (item.answers ?? []).some((a) => canon(a) === val);
    const named = ok
      ? null
      : (item.misconceptions.find((m) => canon(m.answer) === val)?.message ??
        null);
    return { ok, named };
  }

  /* a generator's object in the shape of an items-file item, with the seed that made it */
  function itemFromGenerated(topicId, spec, seed) {
    return {
      id: `${topicId}#gen`,
      topic: topicId,
      stem: spec.stem,
      hint: spec.hint,
      answers: spec.answers,
      working: spec.working,
      misconceptions: Object.entries(spec.wrong || {}).map(
        ([answer, message]) => ({ answer, message }),
      ),
      seed,
    };
  }

  /* the chat panel for one item. Ids hold "#", so a hand-built query would cut the id into a fragment */
  function chatHref(item) {
    const q =
      item.seed === undefined
        ? { item: item.id }
        : { item: item.id, seed: String(item.seed) };
    return `/chat.html?${new URLSearchParams(q)}`;
  }

  const NOT_SAVED = " Not saved. Check the tutor window is still open.";

  /* one attempt per item; the promise resolves to whether the tutor accepted it, or null when no
     reply came (the line may still have been saved). v 2 with ok null: a written answer, saved for
     the tutor to mark */
  function postAttempt(item, ok, sure, typed, v = 1) {
    const body = {
      v,
      type: "attempt",
      item: item.id,
      topic: item.topic,
      correct: ok,
      sure,
      answer: typed,
      ...(item.seed === undefined ? {} : { seed: item.seed }),
    };
    return fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => res.ok)
      .catch(() => null);
  }

  /* whether the tutor already holds an attempt for this item; false when it cannot say */
  function attempted(item) {
    return fetch(chatHref(item).replace("/chat.html?", "/api/chat?"))
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.attempted === true)
      .catch(() => false);
  }

  const SURE_NOTE =
    " Press Sure only if you would bet on it. Wrong after Sure is the most useful thing that can happen here: it shows which bit you only thought you knew.";

  /* ---- fresh numbers, from content/<subject>/generators.js when the page loads it ---- */

  function generators() {
    return (typeof window === "undefined" ? globalThis : window).GEN || null;
  }

  /* one .q element from an item, in the order the lessons wrote it by hand so style.css applies */
  function buildItem(item, number) {
    const q = document.createElement("div");
    q.className = "q";
    const stem = document.createElement("p");
    stem.className = "stem";
    stem.textContent = `${number}. ${item.stem}`;
    q.appendChild(stem);
    if (item.figure) {
      /* pack content, the same bytes the lesson held inline */
      const figure = document.createElement("div");
      figure.className = "figure";
      figure.innerHTML = item.figure;
      q.appendChild(figure);
    }
    if (item.scaffold) {
      const faded = document.createElement("div");
      faded.className = "working faded";
      const p = document.createElement("p");
      p.textContent = item.scaffold;
      faded.appendChild(p);
      q.appendChild(faded);
    }
    const label = document.createElement("label");
    label.textContent = "Your answer ";
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    label.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "check";
    btn.textContent = "Check";
    const fb = document.createElement("p");
    fb.className = "feedback";
    fb.hidden = true;
    q.append(label, btn, fb);
    if (item.hint) {
      const hint = document.createElement("p");
      hint.className = "hint";
      hint.hidden = true;
      hint.textContent = item.hint;
      q.appendChild(hint);
    }
    /* a named tab: the quiz keeps its progress and repeat clicks reuse one panel */
    const ask = document.createElement("p");
    ask.className = "ask";
    const link = document.createElement("a");
    link.target = "tutor";
    link.href = chatHref(item);
    link.textContent = "Ask the tutor";
    ask.appendChild(link);
    q.appendChild(ask);
    const work = document.createElement("div");
    work.className = "working";
    work.hidden = true;
    const wp = document.createElement("p");
    wp.textContent = item.working;
    work.appendChild(wp);
    q.appendChild(work);
    return q;
  }

  /* a written-answer item (no answers, a mark scheme): a text box that saves the answer for the
     tutor to mark. No working here: the teach-back shows it after marking */
  function buildOpen(item, number) {
    const q = document.createElement("div");
    q.className = "q open";
    const stem = document.createElement("p");
    stem.className = "stem";
    stem.textContent = `${number}. ${item.stem}`;
    q.appendChild(stem);
    if (item.figure) {
      const figure = document.createElement("div");
      figure.className = "figure";
      figure.innerHTML = item.figure;
      q.appendChild(figure);
    }
    const label = document.createElement("label");
    label.textContent = "Your answer ";
    const box = document.createElement("textarea");
    box.rows = 4;
    label.appendChild(box);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "check";
    btn.textContent = "Save my answer";
    const fb = document.createElement("p");
    fb.className = "feedback";
    fb.hidden = true;
    q.append(label, btn, fb);
    const ask = document.createElement("p");
    ask.className = "ask";
    const link = document.createElement("a");
    link.target = "tutor";
    link.href = chatHref(item);
    link.textContent = "Ask the tutor";
    ask.appendChild(link);
    const marked = document.createElement("p");
    marked.className = "marked";
    marked.hidden = true;
    const markLink = document.createElement("a");
    markLink.target = "tutor";
    markLink.href = chatHref(item);
    markLink.textContent = "Get it marked by the tutor";
    marked.appendChild(markLink);
    q.append(ask, marked);
    return q;
  }

  /* a whole quiz of fresh items. picks is [{ code, topic }] in play order; the caller does the
     round robin. Every item is seeded so it can be rebuilt from its event. */
  function buildQuiz(gens, picks, label) {
    const codes = [...new Set(picks.map((p) => p.code))];
    const section = document.createElement("section");
    section.className = "quiz";
    section.dataset.code = codes.length === 1 ? codes[0] : "mixed";
    if (label) section.dataset.label = label;
    const h = document.createElement("h2");
    h.textContent = label
      ? label.charAt(0).toUpperCase() + label.slice(1)
      : "Fresh set";
    const intro = document.createElement("p");
    intro.textContent =
      "New numbers. Answer from memory. The working appears only after you check.";
    section.append(h, intro);
    const items = picks.map(({ code, topic }) => {
      const seed = (Math.random() * 4294967296) >>> 0;
      return itemFromGenerated(topic, gens[code](lcg(seed)), seed);
    });
    return { section, items };
  }

  /* the button under a finished quiz, once per quiz */
  function offerFreshSet(section, items) {
    const gens = generators();
    const code = section.dataset.code;
    if (!gens || !code || typeof gens[code] !== "function") return;
    if (section.querySelector(".more")) return;
    const topic = items[0].topic;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "more";
    btn.textContent = "Five more, fresh numbers";
    btn.addEventListener("click", () => {
      const picks = Array.from({ length: 5 }, () => ({ code, topic }));
      const next = buildQuiz(
        gens,
        picks,
        `${(section.dataset.label || code).replace(/, fresh set$/, "")}, fresh set`,
      );
      btn.disabled = true;
      section.parentNode.insertBefore(next.section, section.nextSibling);
      initQuiz(next.section, next.items);
      next.section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    section.appendChild(btn);
  }

  let quizCount = 0;

  function initQuiz(section, all) {
    const items = (all || []).filter(
      (i) => Array.isArray(i.answers) && i.answers.length > 0,
    );
    /* a short or extended item has no answers to check here: it is saved for the tutor to mark */
    const open = (all || []).filter(
      (i) =>
        !(Array.isArray(i.answers) && i.answers.length > 0) &&
        typeof i.mark_scheme === "string" &&
        i.mark_scheme !== "",
    );
    if (!section || section.dataset.inited || (!items.length && !open.length))
      return;
    section.dataset.inited = "1";
    /* a lesson quiz and its fresh set share a data-code; the count keeps their radio groups apart */
    const quizN = ++quizCount;

    /* the "Try it" intro: the first paragraph that is a direct child, before .score exists */
    let intro = null;
    for (const child of section.children) {
      if (child.tagName === "P") {
        intro = child;
        break;
      }
    }
    if (intro && !intro.textContent.includes("would bet on it")) {
      intro.textContent = intro.textContent.replace(/\s+$/, "") + SURE_NOTE;
    }

    let done = 0;
    let right = 0;
    let wrong = 0;
    let sureWrong = 0;
    const summary = document.createElement("p");
    summary.className = "score";

    function render() {
      const code =
        section.dataset.label || section.dataset.code || "this topic";
      const sureText =
        sureWrong === 0
          ? "none"
          : sureWrong === wrong
            ? wrong === 1
              ? "it was"
              : wrong === 2
                ? "both"
                : "all"
            : sureWrong;
      const tail =
        wrong === 0
          ? "No wrong answers."
          : `${wrong} wrong, ${sureText} marked Sure.`;
      const finished = done === items.length;
      const line = finished
        ? `${right}/${items.length} on ${code}. ${tail}`
        : `So far ${right}/${done} on ${code}. ${tail}`;
      summary.innerHTML = `<span class="scoreline">${escapeHtml(line)}</span>`;
      if (finished) {
        offerFreshSet(section, items);
        summary.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }

    items.forEach((item, idx) => {
      const q = buildItem(item, idx + 1);
      section.appendChild(q);
      const input = q.querySelector("input");
      const btn = q.querySelector(".check");
      const fb = q.querySelector(".feedback");
      const hint = q.querySelector(".hint");
      const work = q.querySelector(".working:not(.faded)");
      let tries = 0;
      let sureAtFirst = null;
      let posted = false;

      /* Sure / Not sure, injected here so item markup never carries it */
      const name = `sure-${section.dataset.code || "q"}-${quizN}-${idx}`;
      const conf = document.createElement("span");
      conf.className = "confidence";
      conf.innerHTML =
        `<label><input type="radio" name="${name}" value="sure"> Sure</label> ` +
        `<label><input type="radio" name="${name}" value="notsure"> Not sure</label>`;
      btn.parentNode.insertBefore(conf, btn);
      function confidence() {
        const c = conf.querySelector("input:checked");
        return c ? c.value : null;
      }

      function check() {
        if (q.classList.contains("done")) return;
        if (!norm(input.value)) {
          fb.hidden = false;
          fb.textContent = "Write an answer first, even a guess.";
          return;
        }
        if (!confidence()) {
          fb.hidden = false;
          fb.textContent = "Sure or not sure first";
          return;
        }
        tries += 1;
        if (sureAtFirst === null) sureAtFirst = confidence() === "sure";
        const { ok, named } = mark(item, input.value);
        fb.hidden = false;
        /* the record is the first check: the bet, not the hinted second try */
        if (!posted) {
          posted = true;
          void postAttempt(item, ok, sureAtFirst, input.value.trim()).then(
            (saved) => {
              if (!saved) fb.textContent += NOT_SAVED;
            },
          );
        }
        if (!ok && tries < 2) {
          if (hint) {
            hint.hidden = false;
            fb.textContent =
              named ||
              "Not this time. Read the first step below, then try again.";
          } else {
            fb.textContent =
              named || "Not this time. Try once more before the working shows.";
          }
          input.focus();
          return;
        }
        q.classList.add("done", ok ? "right" : "wrong");
        fb.textContent = ok
          ? tries === 1
            ? "Correct."
            : "Correct on the second go."
          : named ||
            "Not this time. Read the working and find the step where yours went a different way.";
        if (work) work.hidden = false;
        input.disabled = true;
        btn.disabled = true;
        for (const r of conf.querySelectorAll("input")) r.disabled = true;
        done += 1;
        if (ok) right += 1;
        else {
          wrong += 1;
          if (sureAtFirst) sureWrong += 1;
        }
        render();
      }

      btn.addEventListener("click", check);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          check();
        }
      });
    });

    open.forEach((item, i) => {
      const idx = items.length + i;
      const q = buildOpen(item, idx + 1);
      section.appendChild(q);
      const box = q.querySelector("textarea");
      const btn = q.querySelector(".check");
      const fb = q.querySelector(".feedback");
      const ask = q.querySelector(".ask");
      const marked = q.querySelector(".marked");
      let lost = false;
      const name = `sure-${section.dataset.code || "q"}-${quizN}-${idx}`;
      const conf = document.createElement("span");
      conf.className = "confidence";
      conf.innerHTML =
        `<label><input type="radio" name="${name}" value="sure"> Sure</label> ` +
        `<label><input type="radio" name="${name}" value="notsure"> Not sure</label>`;
      btn.parentNode.insertBefore(conf, btn);

      /* no Enter handler: Enter in the box is a new line. A lost post stays retryable, because
         the tutor will not mark an answer it has no attempt for */
      btn.addEventListener("click", () => {
        if (q.classList.contains("done") || btn.disabled) return;
        const text = box.value.trim();
        const c = conf.querySelector("input:checked");
        fb.hidden = false;
        if (text === "") {
          fb.textContent = "Write an answer first, even a guess.";
          return;
        }
        if (!c) {
          fb.textContent = "Sure or not sure first";
          return;
        }
        btn.disabled = true;
        /* after a post with no reply, the line may have been saved and only the reply lost: ask first,
           so a retry cannot write a second attempt and its XP. A refusal saved nothing, so its retry
           posts straight away: an attempt from an earlier visit must not pass for today's */
        const already = lost ? attempted(item) : Promise.resolve(false);
        void already
          .then((saved) =>
            saved ? true : postAttempt(item, null, c.value === "sure", text, 2),
          )
          .then((saved) => {
            if (!saved) {
              lost = saved === null;
              fb.textContent = NOT_SAVED.trim();
              btn.disabled = false;
              return;
            }
            q.classList.add("done");
            box.disabled = true;
            for (const r of conf.querySelectorAll("input")) r.disabled = true;
            fb.textContent =
              "Saved. This page cannot mark a written answer. Open the tutor and explain your answer there, one point per line, to get it marked.";
            ask.hidden = true;
            marked.hidden = false;
          });
      });
    });
    section.appendChild(summary);
  }

  /* a lesson's quiz: the items file named on the section */
  function initLesson(section) {
    /* the scoreline names the topic, as the lesson's heading does, not its code */
    const title = document.querySelector("main h1")?.textContent.trim();
    if (title && !section.dataset.label) section.dataset.label = title;
    fetch(section.dataset.items)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((items) => initQuiz(section, items))
      .catch(() => {
        const intro = section.querySelector("p");
        if (intro)
          intro.textContent =
            "The questions did not load. Check the tutor window is still open.";
      });
  }

  /* a copy button per method step, so a stuck step becomes a question in one click.
     Numbering runs on across a second list, for topics with two methods. */
  function wireMethodSteps() {
    const lists = document.querySelectorAll("#method ol");
    if (!lists.length) return;
    const quiz = document.querySelector(".quiz[data-code]");
    const code = quiz
      ? quiz.dataset.code
      : document.title.split(" ")[0] || "this topic";
    let n = 0;
    for (const list of lists) {
      for (const li of list.children) {
        if (li.tagName !== "LI") continue;
        n += 1;
        if (li.querySelector(".copy")) continue;
        const step = li.textContent.replace(/\s+/g, " ").trim();
        li.dataset.prompt = `I don't get step ${n} of ${code}: ${step}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "copy";
        btn.setAttribute("aria-label", `Copy step ${n} as a question`);
        li.appendChild(document.createTextNode(" "));
        li.appendChild(btn);
      }
    }
  }

  /* the app pages' top bar, the same links in the same order; a lesson in content/ has no shell */
  const NAV = [
    ["/", "Lessons"],
    ["/map.html", "Map"],
    ["/practice.html", "Practice"],
    ["/case.html", "Today's case"],
    ["/squad.html", "Squad"],
    ["/coach.html", "Coach Dan"],
  ];

  function addNav() {
    const bar = document.createElement("header");
    bar.className = "topbar";
    const inner = document.createElement("div");
    inner.className = "inner";
    const brand = document.createElement("a");
    brand.className = "brand";
    brand.href = "/";
    brand.textContent = "Study tutor";
    const nav = document.createElement("nav");
    nav.className = "topnav";
    nav.setAttribute("aria-label", "Main");
    for (const [href, text] of NAV) {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = text;
      nav.appendChild(a);
    }
    inner.append(brand, nav);
    bar.appendChild(inner);
    document.body.prepend(bar);
  }

  function postEvent(body) {
    return fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => res.ok)
      .catch(() => false);
  }

  /* the lesson record the map's "Done with it" writes: the open lesson session's end, verbatim from
     /api/next. Opened from the lesson list, no lesson session is open, so this one starts and ends. */
  async function endLesson() {
    const get = (url) =>
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      });
    const [urls, next] = await Promise.all([
      get("/api/lessons"),
      get("/api/next"),
    ]);
    const topic = Object.keys(urls).find(
      (id) => urls[id] === location.pathname,
    );
    if (!topic) return false;
    const step = next.step;
    if (
      step.kind === "continue" &&
      step.mode === "lesson" &&
      step.topic === topic
    )
      return postEvent(step.end);
    const begin = {
      v: 1,
      type: "session",
      phase: "start",
      mode: "lesson",
      topic,
    };
    return (await postEvent(begin)) && postEvent({ ...begin, phase: "end" });
  }

  function addDone(main) {
    const box = document.createElement("section");
    box.id = "lesson-done";
    const p = document.createElement("p");
    p.textContent =
      "When you have worked through it, mark it done. That fills the first bar on your map.";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lesson-done-button";
    btn.textContent = "Done with this lesson";
    const note = document.createElement("p");
    note.className = "note";
    note.setAttribute("role", "status");
    btn.addEventListener("click", () => {
      btn.disabled = true;
      note.textContent = "";
      endLesson()
        .catch(() => false)
        .then((saved) => {
          if (!saved) {
            note.textContent = NOT_SAVED.trim();
            btn.disabled = false;
            return;
          }
          btn.hidden = true;
          const a = document.createElement("a");
          a.href = "/map.html";
          a.textContent = "Back to your map";
          note.replaceChildren("Saved. ", a, ".");
        });
    });
    box.append(p, btn, note);
    /* after the teach-back, the last thing the lesson asks for */
    const after = document.getElementById("teach-back");
    if (after?.parentNode === main) after.after(box);
    else main.insertBefore(box, main.querySelector(":scope > footer"));
  }

  function start() {
    for (const section of document.querySelectorAll(".quiz[data-items]"))
      initLesson(section);
    wireMethodSteps();
    /* a lesson page: a quiz from an items file and no app top bar */
    const main = document.querySelector("main.lesson");
    if (
      main &&
      document.querySelector(".quiz[data-items]") &&
      !document.querySelector(".topbar")
    ) {
      addNav();
      addDone(main);
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }

    /* copy buttons: show-me convention, one delegated listener */
    document.addEventListener("click", async (e) => {
      const btn = e.target.closest(".copy");
      if (!btn) return;
      const holder = btn.closest("[data-prompt]");
      if (!holder) return;
      const text = holder.dataset.prompt;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = Object.assign(document.createElement("textarea"), {
          value: text,
        });
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.append(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      btn.classList.add("copied");
      setTimeout(() => btn.classList.remove("copied"), 1200);
    });
  }

  const root = typeof window === "undefined" ? globalThis : window;
  root.quiz = {
    norm,
    vocabCanon,
    sequenceCanon,
    labelCanon,
    lcg,
    mark,
    itemFromGenerated,
    chatHref,
    buildQuiz,
    initQuiz,
  };
})();
