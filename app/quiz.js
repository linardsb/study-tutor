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
      .replace(/^(-?)\./, "$10.")
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
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
    const val = norm(typed);
    const ok = item.answers.some((a) => norm(a) === val);
    const named = ok
      ? null
      : (item.misconceptions.find((m) => norm(m.answer) === val)?.message ??
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

  const NOT_SAVED = " Not saved. Check the tutor window is still open.";

  /* one attempt per item; the promise resolves to whether the tutor accepted it */
  function postAttempt(item, ok, sure, typed) {
    const body = {
      v: 1,
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
    const work = document.createElement("div");
    work.className = "working";
    work.hidden = true;
    const wp = document.createElement("p");
    wp.textContent = item.working;
    work.appendChild(wp);
    q.appendChild(work);
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
      const next = buildQuiz(gens, picks, `${code}, fresh set`);
      btn.disabled = true;
      section.parentNode.insertBefore(next.section, section.nextSibling);
      initQuiz(next.section, next.items);
      next.section.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    section.appendChild(btn);
  }

  function initQuiz(section, items) {
    if (!section || section.dataset.inited || !items.length) return;
    section.dataset.inited = "1";

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
      const name = `sure-${section.dataset.code || "q"}-${idx}`;
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
          postAttempt(item, ok, sureAtFirst, input.value.trim()).then(
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
            "Not this time. Read the working, then tell Claude what you did differently.";
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
    section.appendChild(summary);
  }

  /* a lesson's quiz: the items file named on the section */
  function initLesson(section) {
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

  /* a copy button per method step, so a stuck step goes to Claude in one click.
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
        btn.setAttribute(
          "aria-label",
          `Copy step ${n} as a question for Claude`,
        );
        li.appendChild(document.createTextNode(" "));
        li.appendChild(btn);
      }
    }
  }

  function start() {
    for (const section of document.querySelectorAll(".quiz[data-items]"))
      initLesson(section);
    wireMethodSteps();
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
  root.quiz = { norm, lcg, mark, itemFromGenerated, buildQuiz, initQuiz };
})();
