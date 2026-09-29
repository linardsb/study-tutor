/* The boss: the cold re-test GET /api/next returns, built in the browser from pack items by id or
   seeded generator rolls. Mixed, numbered and unlabelled: no topic name or code, no hint, no Sure or
   Not sure, one go each. Marks with quiz.mark, then posts one retest event per topic and the session
   end body the server hands it, all through POST /api/event.
   Invariant: an item's answer and working enter the DOM only inside the check handler, as case.js.
   Runs in the browser. Loaded under Bun by src/marking/retest.test.ts, so nothing here touches
   document, window.GEN or window.quiz at load time. */
(() => {
  /* the same values as src/flow/ladder.ts; retest.test.ts checks the copies agree */
  const RUNGS = ["not started", "learning", "1 pass", "2 passes", "secure"];
  const NEXT_DAYS = { 1: 3, 2: 10, 3: 30, 4: 60 };
  const TEXT = {
    intro: (n, m) =>
      `${n} questions from ${m} ${m === 1 ? "topic" : "topics"}. Answer from memory. The working shows after each check.`,
    begin: "Begin",
    noBoss: "No boss today. Nothing is due.",
    otherOpen: "Something else is open. Finish it on the map first.",
    couldNotClose: "Could not close the earlier boss. Reload the page.",
    notLoaded: "The boss did not load. Check the tutor window is still open.",
    noQuestions: "The questions could not be built. Tell a parent.",
    answerFirst: "Write an answer first, even a guess.",
    yourAnswer: "Your answer ",
    check: "Check",
    correct: "Correct.",
    wrong: "Not this time.",
    over: "Boss over.",
    row: (title, score, of) => `${title}: ${score} of ${of}.`,
    notScored: "Not scored yet.",
    backToMap: "Back to the map",
    toMap: "Map",
    notSaved: " Not saved. Check the tutor window is still open.",
  };
  /* what the rung a topic lands on means as what the pupil can and cannot do yet; no grade */
  const RUNG_LINES = {
    1: `Not yet from memory. Back to learning. Do the lesson again and the re-test comes round in ${NEXT_DAYS[1]} days.`,
    2: `One cold pass. You did it from memory once. Next re-test in ${NEXT_DAYS[2]} days.`,
    3: `Two cold passes. One more and it is secure. Next re-test in ${NEXT_DAYS[3]} days.`,
    4: `Secure. You can do this from memory. It still comes round every ${NEXT_DAYS[4]} days.`,
  };

  /* the same rule as passes in src/flow/ladder.ts; the server refuses a retest whose passed disagrees */
  function passes(score, of) {
    return of > 0 && score * 3 >= of * 2;
  }

  /* the same file name as itemsFileName in src/content/pack.ts */
  function itemsFile(topic) {
    return `/content/maths/items/${topic.replaceAll("/", "-")}.json`;
  }

  /* a fresh roll from the slot's seed, or null when the topic has no generator here */
  function rollFor(slot, topics, gens, quiz) {
    const code = topics.find((t) => t.id === slot.topic)?.aliases[0];
    if (!code || typeof gens[code] !== "function") return null;
    return quiz.itemFromGenerated(
      slot.topic,
      gens[code](quiz.lcg(slot.seed)),
      slot.seed,
    );
  }

  /* [{slot, item}] in slot order: the named pack item, else a roll with the slot seed; a slot with neither is dropped */
  function buildItems(boss, topics, itemsByTopic, gens, quiz) {
    const out = [];
    for (const slot of boss.slots) {
      const fixed =
        slot.item === null
          ? undefined
          : (itemsByTopic[slot.topic] ?? []).find(
              (i) => i.id === slot.item && Array.isArray(i.answers),
            );
      const item = fixed ?? rollFor(slot, topics, gens, quiz);
      if (item) out.push({ slot, item });
    }
    return out;
  }

  /* one row per boss topic that had a question, in boss.topics order */
  function scoreOf(boss, results) {
    const rows = [];
    for (const topic of boss.topics) {
      const mine = results.filter((r) => r.topic === topic);
      if (mine.length === 0) continue;
      const score = mine.filter((r) => r.ok).length;
      rows.push({
        topic,
        score,
        of: mine.length,
        passed: passes(score, mine.length),
      });
    }
    return rows;
  }

  /* the retest@1 body; seed is the boss seed, so the boss can be rebuilt from the log */
  function retestBody(row, seed) {
    return {
      v: 1,
      type: "retest",
      topic: row.topic,
      score: row.score,
      of: row.of,
      passed: row.passed,
      seed,
    };
  }

  function rungLine(rung) {
    return RUNG_LINES[rung] ?? "";
  }

  function resultRow(title, row, rungAfter) {
    return `${TEXT.row(title, row.score, row.of)} ${rungLine(rungAfter)}`;
  }

  /* the seam a test replaces: the page's own reload */
  const api = { reload: () => undefined };

  function postEvent(body) {
    return fetch("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => res.ok)
      .catch(() => false);
  }

  function getJson(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  const globals = () => (typeof window === "undefined" ? globalThis : window);

  function mapLink(query, text) {
    const a = el("a", "", text);
    a.href = `/map.html${query}`;
    return a;
  }

  /* only a well-formed ?day= reaches the route; anything else asks for today */
  function dayQuery() {
    const day = new URLSearchParams(location.search).get("day");
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `?day=${day}` : "";
  }

  /* one .q, the quiz.js shape minus the hint and the Sure control; no topic name, code or item id */
  function buildQ(item, number) {
    const q = el("div", "q");
    q.appendChild(el("p", "stem", `${number}. ${item.stem}`));
    if (item.figure) {
      /* pack content, the same bytes the lesson held inline */
      const figure = el("div", "figure");
      figure.innerHTML = item.figure;
      q.appendChild(figure);
    }
    if (item.scaffold) {
      const faded = el("div", "working faded");
      faded.appendChild(el("p", "", item.scaffold));
      q.appendChild(faded);
    }
    const label = el("label", "", TEXT.yourAnswer);
    const input = el("input");
    input.type = "text";
    input.autocomplete = "off";
    label.appendChild(input);
    const btn = el("button", "check", TEXT.check);
    btn.type = "button";
    const fb = el("p", "feedback");
    fb.hidden = true;
    const work = el("div", "working");
    work.hidden = true;
    q.append(label, btn, fb, work);
    return q;
  }

  /* one go: the first check marks, shows the working, locks the question and reports ok */
  function wireCheck(q, item, onDone) {
    const input = q.querySelector("input");
    const btn = q.querySelector(".check");
    const fb = q.querySelector(".feedback");
    const work = q.querySelector(".working:not(.faded)");
    const quiz = globals().quiz;
    function check() {
      if (q.classList.contains("done")) return;
      fb.hidden = false;
      if (!quiz.norm(input.value)) {
        fb.textContent = TEXT.answerFirst;
        return;
      }
      const { ok, named } = quiz.mark(item, input.value);
      q.classList.add("done", ok ? "right" : "wrong");
      fb.textContent = ok ? TEXT.correct : named || TEXT.wrong;
      /* the working enters the page here and nowhere earlier */
      work.appendChild(el("p", "", item.working));
      work.hidden = false;
      input.disabled = true;
      btn.disabled = true;
      onDone(ok);
    }
    btn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });
  }

  function renderQuestions(holder, built, onAllDone) {
    const results = [];
    for (const [i, { slot, item }] of built.entries()) {
      const q = buildQ(item, i + 1);
      holder.appendChild(q);
      wireCheck(q, item, (ok) => {
        results.push({ topic: slot.topic, ok });
        if (results.length === built.length) onAllDone(results);
      });
    }
  }

  /* one retest per topic, in order; a failed post marks its row and the loop goes on */
  async function saveRows(rows, seed) {
    const saved = [];
    for (const row of rows) {
      const ok = await postEvent(retestBody(row, seed));
      saved.push({ ...row, saved: ok });
    }
    return saved;
  }

  /* the end body the server hands back for the open boss; nothing is composed here. Another mode
     open by now (a lesson started in a second tab) is left for the map to finish. */
  async function closeSession(query) {
    const next = await getJson(`/api/next${query}`).catch(() => null);
    if (next?.step.kind === "continue" && next.step.mode === "boss")
      await postEvent(next.step.end);
  }

  function renderResult(holder, rows, titles, after, query) {
    holder.hidden = false;
    holder.appendChild(el("h2", "", TEXT.over));
    const list = el("ol");
    for (const row of rows) {
      const title = titles[row.topic] ?? row.topic;
      const text = row.saved
        ? resultRow(title, row, after?.topics?.[row.topic]?.rung ?? 0)
        : `${TEXT.row(title, row.score, row.of)} ${TEXT.notScored}${TEXT.notSaved}`;
      const li = el("li");
      li.appendChild(el("span", "row", text));
      list.appendChild(li);
    }
    holder.appendChild(list);
    const p = el("p");
    p.appendChild(mapLink(query, TEXT.backToMap));
    holder.appendChild(p);
  }

  /* every question answered: save, close the session only when every row saved, then the result */
  async function finish(ids, boss, results, titles, query) {
    const rows = await saveRows(scoreOf(boss, results), boss.seed);
    if (rows.every((r) => r.saved)) await closeSession(query);
    const after = await getJson("/api/state").catch(() => null);
    renderResult(ids.result, rows, titles, after, query);
  }

  /* topics.json and the items file of each topic with a fixed slot, in parallel */
  async function fetchPack(boss) {
    const fixedTopics = [
      ...new Set(boss.slots.filter((s) => s.item !== null).map((s) => s.topic)),
    ];
    const [topics, ...lists] = await Promise.all([
      getJson("/content/maths/topics.json"),
      ...fixedTopics.map((id) => getJson(itemsFile(id))),
    ]);
    const itemsByTopic = {};
    for (const [i, id] of fixedTopics.entries()) itemsByTopic[id] = lists[i];
    return { topics, itemsByTopic };
  }

  async function begin(ids, step, built, titles, query, btn) {
    btn.disabled = true;
    if (!(await postEvent(step.start))) {
      ids.status.textContent = TEXT.notSaved;
      btn.disabled = false;
      return;
    }
    ids.intro.replaceChildren();
    renderQuestions(ids.boss, built, (results) =>
      finish(ids, step.boss, results, titles, query),
    );
  }

  /* the boss's questions built before anything is posted; null when the pack did not load */
  async function buildBoss(boss) {
    let pack;
    try {
      pack = await fetchPack(boss);
    } catch {
      return null;
    }
    const g = globals();
    const built = buildItems(
      boss,
      pack.topics,
      pack.itemsByTopic,
      g.GEN ?? {},
      g.quiz,
    );
    const titles = {};
    for (const t of pack.topics) titles[t.id] = t.title;
    return { built, titles };
  }

  async function renderIntro(ids, step, query) {
    const intro = ids.intro;
    if (step.kind === "continue") {
      intro.append(el("p", "", TEXT.otherOpen), mapLink(query, TEXT.toMap));
      return;
    }
    if (step.kind !== "boss") {
      intro.append(el("p", "", TEXT.noBoss), mapLink(query, TEXT.toMap));
      return;
    }
    const made = await buildBoss(step.boss);
    if (made === null) {
      ids.status.textContent = TEXT.notLoaded;
      return;
    }
    const { built, titles } = made;
    if (built.length === 0) {
      ids.status.textContent = TEXT.noQuestions;
      return;
    }
    /* the intro counts what was built, not what was served */
    intro.appendChild(
      el(
        "p",
        "",
        TEXT.intro(built.length, new Set(built.map((b) => b.slot.topic)).size),
      ),
    );
    const btn = el("button", "", TEXT.begin);
    btn.type = "button";
    btn.addEventListener("click", () =>
      begin(ids, step, built, titles, query, btn),
    );
    intro.appendChild(btn);
  }

  /* an open boss from an earlier load (a reload mid-boss) is ended with the served end body and
     the step read again once, so the same boss re-forms; null when it would not close */
  async function resolveStep(query) {
    const next = await getJson(`/api/next${query}`);
    if (next.step.kind !== "continue" || next.step.mode !== "boss")
      return next.step;
    await postEvent(next.step.end);
    const again = await getJson(`/api/next${query}`);
    return again.step.kind === "continue" ? null : again.step;
  }

  async function load(ids) {
    const query = dayQuery();
    ids.status.textContent = "";
    ids.result.hidden = true;
    for (const holder of [ids.intro, ids.boss, ids.result])
      holder.replaceChildren();
    let step;
    try {
      step = await resolveStep(query);
    } catch {
      ids.status.textContent = TEXT.notLoaded;
      return;
    }
    if (step === null) {
      ids.status.textContent = TEXT.couldNotClose;
      return;
    }
    await renderIntro(ids, step, query);
  }

  if (typeof document !== "undefined") {
    const boss = document.getElementById("boss");
    if (boss) {
      const ids = {
        intro: document.getElementById("intro"),
        boss,
        result: document.getElementById("result"),
        status: document.getElementById("status"),
      };
      api.reload = () => load(ids);
      api.reload();
    }
  }

  globals().boss = Object.assign(api, {
    TEXT,
    RUNG_LINES,
    RUNGS,
    NEXT_DAYS,
    passes,
    itemsFile,
    buildItems,
    scoreOf,
    retestBody,
    rungLine,
    resultRow,
  });
})();
