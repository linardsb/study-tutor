/* The squad page: the week's shared round from GET /api/squad, built in the browser from the served
   seeds, so every member of the squad gets the same numbers. One go per question, marked here as right
   or not and marked again on the server, which saves the round and writes the pupil's file.
   After the round: each question with everyone's answer and working, in name order, and the squad's
   pooled total. No one is scored against anyone else. Then a parent round of three fresh questions,
   saved as a teachback through POST /api/event.
   Invariant: in the pupil's round an item's working enters the DOM only in the compare view, after the
   save, because a reload rolls the same questions. In the parent round it enters in the check handler.
   Friends' answers and working are typed by pupils, so they go in with textContent only.
   Runs in the browser. Loaded under Bun by src/marking/squad.test.ts, so nothing here touches
   document, window.GEN or window.quiz at load time. */
(() => {
  const PARENT_SLOTS = 3; // the same value as src/flow/squad.ts
  const TEXT = {
    joinTitle: "Join your squad",
    joinIntro:
      "Everyone in the squad types the same squad name. Use letters, numbers and dashes. For your own name, pick one no one else in the squad uses.",
    squadLabel: "Squad name ",
    pupilLabel: "Your name ",
    join: "Join",
    nameTaken: (name) =>
      `Someone else in this squad already uses the name ${name}. Pick another name so your rounds do not get mixed up.`,
    week: "This week",
    notLoaded:
      "The squad page did not load. Check the tutor window is still open.",
    noQuestions: "This week's questions could not be built. Tell a parent.",
    daysLeft: (n) =>
      `The squad week ends on Sunday. ${n} ${n === 1 ? "day" : "days"} left, today included.`,
    total: (score, of, rounds) =>
      `Squad total this week: ${score} of ${of} from ${rounds} ${rounds === 1 ? "round" : "rounds"}.`,
    solo: "Only your round so far.",
    folder: "Friends' files go in this folder on this computer:",
    unreadable: (n) =>
      `${n} ${n === 1 ? "file" : "files"} in the squad folder could not be read and ${n === 1 ? "is" : "are"} left out.`,
    notComparable:
      ": their tutor set different questions this week, so their round is not counted. Updating either tutor fixes it.",
    roundIntro: (title) =>
      `This week: ${title}. Five questions, one go each. Write your working if you can. Your squad sees it once they have done their own round.`,
    yourAnswer: "Your answer ",
    yourWorking: "Your working ",
    check: "Check",
    answerFirst: "Write an answer first, even a guess.",
    correct: "Correct.",
    wrong: "Not this time.",
    notSaved: "Not saved. Check the tutor window is still open.",
    retry: "Try saving again",
    saved: "Round saved.",
    done: "You have done this week's round.",
    notShared:
      "Saved to your record. Your squad file could not be written yet; the tutor tries again next time you open this page.",
    compare: "Question by question",
    worked: "Worked answer: ",
    you: "You",
    right: "right",
    notYet: "not yet",
    noWorking: "No working written.",
    parent: "Teach a parent",
    parentIntro:
      "Explain question 1 to a parent using your working. Then they answer these three on their own.",
    parentResult: (m, of) =>
      `Your parent got ${m} of ${of}. Saved as a teach-back.`,
    parentDone: "The parent round is done for this week.",
    share: "Share your round",
    shareIntro: "Save your file and give it to each friend's parent.",
    saveFile: "Save my file",
  };

  /* the round's questions from its seeds, in the quiz.js item shape; [] when the topic has no generator here */
  function buildRound(round, topics, gens, quiz, seeds = round.seeds) {
    const code = topics.find((t) => t.id === round.topic)?.aliases[0];
    if (!code || typeof gens[code] !== "function") return [];
    return seeds.map((s) =>
      quiz.itemFromGenerated(round.topic, gens[code](quiz.lcg(s)), s),
    );
  }

  /* the parent's three fresh questions: the same topic, the round's parent seeds, which roundOf picks so
     none repeats a pupil question (M4) */
  function parentItems(round, topics, gens, quiz) {
    return buildRound(round, topics, gens, quiz, round.parentSeeds);
  }

  /* the POST /api/squad body; the server marks it again */
  function roundBody(week, results) {
    return {
      week,
      answers: results.map((r) => ({ answer: r.answer, working: r.working })),
    };
  }

  function daysText(n) {
    return TEXT.daysLeft(n);
  }

  function totalText(total) {
    return TEXT.total(total.score, total.of, total.rounds);
  }

  /* friends by name, never by score */
  function memberOrder(members) {
    return [...members].sort((a, b) =>
      a.pupil < b.pupil ? -1 : a.pupil > b.pupil ? 1 : 0,
    );
  }

  /* the seam a test replaces: the page's own reload */
  const api = { reload: () => undefined };

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

  /* only a well-formed ?day= reaches the route; anything else asks for today */
  function dayQuery() {
    const day = new URLSearchParams(location.search).get("day");
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `?day=${day}` : "";
  }

  /* one .q: the stem, an answer box, and for the pupil's round a working box; no working shown yet */
  function buildQ(item, number, withWorking) {
    const q = el("div", "q");
    q.appendChild(el("p", "stem", `${number}. ${item.stem}`));
    const label = el("label", "", TEXT.yourAnswer);
    const input = el("input");
    input.type = "text";
    input.autocomplete = "off";
    input.maxLength = 100;
    label.appendChild(input);
    q.appendChild(label);
    if (withWorking) {
      const wl = el("label", "", TEXT.yourWorking);
      const area = el("textarea");
      area.maxLength = 500;
      area.rows = 2;
      wl.appendChild(area);
      q.appendChild(wl);
    }
    const btn = el("button", "check", TEXT.check);
    btn.type = "button";
    const fb = el("p", "feedback");
    fb.hidden = true;
    const work = el("div", "working");
    work.hidden = true;
    q.append(btn, fb, work);
    return q;
  }

  /* one go: the first check marks, locks the question and reports what was typed; reveal shows the working
     and any named mistake, which the pupil's round leaves for the compare view */
  function wireCheck(q, item, reveal, onDone) {
    const input = q.querySelector("input");
    const area = q.querySelector("textarea");
    const btn = q.querySelector(".check");
    const fb = q.querySelector(".feedback");
    const work = q.querySelector(".working");
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
      fb.textContent = ok ? TEXT.correct : (reveal && named) || TEXT.wrong;
      if (reveal) {
        work.appendChild(el("p", "", item.working));
        work.hidden = false;
      }
      input.disabled = true;
      btn.disabled = true;
      if (area) area.disabled = true;
      onDone({ ok, answer: input.value, working: area ? area.value : "" });
    }
    btn.addEventListener("click", check);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });
  }

  /* every question, then onAllDone with the results in question order */
  function renderQuestions(holder, items, withWorking, onAllDone) {
    const results = new Array(items.length);
    let left = items.length;
    for (const [i, item] of items.entries()) {
      const q = buildQ(item, i + 1, withWorking);
      holder.appendChild(q);
      wireCheck(q, item, !withWorking, (r) => {
        results[i] = r;
        left -= 1;
        if (left === 0) onAllDone(results);
      });
    }
  }

  /* taken: the saved profile when another tutor's file carries this name (F8); the squad stays, the name is asked again */
  function renderJoin(ids, taken = null) {
    const form = el("form");
    form.appendChild(el("h2", "", TEXT.joinTitle));
    form.appendChild(
      el("p", "note", taken ? TEXT.nameTaken(taken.pupil) : TEXT.joinIntro),
    );
    const field = (text, name) => {
      const label = el("label", "", text);
      const input = el("input");
      input.type = "text";
      input.name = name;
      input.maxLength = 32;
      input.autocomplete = "off";
      label.appendChild(input);
      form.appendChild(label);
      return input;
    };
    const squad = field(TEXT.squadLabel, "squad");
    const pupil = field(TEXT.pupilLabel, "pupil");
    const btn = el("button", "", TEXT.join);
    btn.type = "submit";
    const row = el("div", "actions");
    row.appendChild(btn);
    form.appendChild(row);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      btn.disabled = true;
      ids.status.textContent = "";
      let res = null;
      try {
        res = await fetch("/api/squad/join", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ squad: squad.value, pupil: pupil.value }),
        });
      } catch {
        res = null;
      }
      if (res?.ok) return api.reload();
      const body = res ? await res.json().catch(() => null) : null;
      ids.status.textContent = body?.error ?? TEXT.notSaved;
      btn.disabled = false;
    });
    ids.join.appendChild(form);
    if (taken) {
      squad.value = taken.squad;
      pupil.focus();
    }
  }

  function renderWeek(holder, view) {
    holder.appendChild(el("h2", "", TEXT.week));
    holder.appendChild(el("p", "days", daysText(view.daysLeft)));
    if (view.total.rounds > 0) {
      holder.appendChild(el("p", "total", totalText(view.total)));
      /* the pooled total as a bar; no text, so the sentence above stays the only figure */
      const bar = el("div", "meter");
      const fill = el("span");
      fill.style.width = `${Math.round((100 * view.total.score) / Math.max(1, view.total.of))}%`;
      bar.appendChild(fill);
      holder.appendChild(bar);
    }
    if (view.mine && view.members.length === 0)
      holder.appendChild(el("p", "note", TEXT.solo));
    holder.appendChild(el("p", "folder-label", TEXT.folder));
    holder.appendChild(el("p", "folder", view.folder ?? ""));
    if (view.unreadable > 0)
      holder.appendChild(el("p", "note", TEXT.unreadable(view.unreadable)));
    if (view.mine && !view.shared)
      holder.appendChild(el("p", "note", TEXT.notShared));
  }

  /* posts the round; a failure keeps the answers and offers the same body again */
  async function save(ids, body) {
    ids.status.textContent = "";
    let res = null;
    try {
      res = await fetch("/api/squad", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      res = null;
    }
    if (res?.ok) {
      render(ids, await res.json());
      ids.status.textContent = TEXT.saved;
      return;
    }
    /* already saved in another tab, or the week turned over: read the week again */
    if (res?.status === 409) return api.reload();
    ids.status.textContent = TEXT.notSaved;
    const btn = el("button", "", TEXT.retry);
    btn.type = "button";
    btn.addEventListener("click", () => {
      btn.remove();
      save(ids, body);
    });
    ids.round.appendChild(btn);
  }

  function renderRound(ids, view, items) {
    ids.round.appendChild(el("p", "intro", TEXT.roundIntro(view.round.title)));
    renderQuestions(ids.round, items, true, (results) =>
      save(ids, roundBody(view.week, results)),
    );
  }

  /* one person's answer to one question: name, answer, working, and right or not yet */
  function personRow(name, a) {
    const li = el("li");
    li.appendChild(el("b", "", name));
    li.appendChild(el("span", "answer", ` ${a.answer} `));
    li.appendChild(
      el(
        "span",
        a.correct ? "mark right" : "mark not-yet",
        a.correct ? TEXT.right : TEXT.notYet,
      ),
    );
    li.appendChild(el("p", "working", a.working || TEXT.noWorking));
    return li;
  }

  function renderCompare(holder, view, items) {
    holder.appendChild(el("p", "done-line", TEXT.done));
    holder.appendChild(el("h2", "", TEXT.compare));
    const members = memberOrder(view.members);
    const counted = members.filter((m) => m.comparable && m.answers);
    for (const [k, item] of items.entries()) {
      const block = el("div", "q");
      block.appendChild(el("p", "stem", `${k + 1}. ${item.stem}`));
      block.appendChild(el("p", "working", `${TEXT.worked}${item.working}`));
      const list = el("ul", "people");
      list.appendChild(personRow(TEXT.you, view.mine.answers[k]));
      for (const m of counted) {
        const a = m.answers[k];
        if (a) list.appendChild(personRow(m.pupil, a));
      }
      block.appendChild(list);
      holder.appendChild(block);
    }
    for (const m of members.filter((m) => !m.comparable)) {
      const p = el("p", "note");
      p.appendChild(el("b", "", m.pupil));
      p.append(TEXT.notComparable);
      holder.appendChild(p);
    }
  }

  function renderParent(holder, view, items) {
    if (view.parentDone) {
      holder.appendChild(el("p", "", TEXT.parentDone));
      return;
    }
    holder.appendChild(el("h2", "", TEXT.parent));
    holder.appendChild(el("p", "", TEXT.parentIntro));
    renderQuestions(holder, items, false, async (results) => {
      const marks = results.filter((r) => r.ok).length;
      let ok = false;
      try {
        const res = await fetch("/api/event", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            v: 1,
            type: "teachback",
            topic: view.round.topic,
            marks,
            of: PARENT_SLOTS,
          }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      holder.appendChild(
        el(
          "p",
          "result",
          ok ? TEXT.parentResult(marks, PARENT_SLOTS) : TEXT.notSaved,
        ),
      );
    });
  }

  function renderShare(holder, view) {
    holder.appendChild(el("h2", "", TEXT.share));
    holder.appendChild(el("p", "note", TEXT.shareIntro));
    const a = el("a", "button", TEXT.saveFile);
    a.download = `${view.profile.pupil}.json`;
    a.href = URL.createObjectURL(
      new Blob([`${JSON.stringify(view.mine, null, 2)}\n`], {
        type: "application/json",
      }),
    );
    holder.appendChild(a);
  }

  function clear(ids) {
    for (const k of ["join", "week", "round", "compare", "parent", "share"])
      ids[k].replaceChildren();
    ids.status.textContent = "";
  }

  function render(ids, view) {
    clear(ids);
    if (view.profile === null) {
      renderJoin(ids);
      return;
    }
    if (view.nameTaken) {
      renderJoin(ids, view.profile);
      return;
    }
    renderWeek(ids.week, view);
    const g = globals();
    const items = view.round
      ? buildRound(view.round, ids.topics, g.GEN ?? {}, g.quiz)
      : [];
    if (items.length === 0) {
      ids.status.textContent = TEXT.noQuestions;
      return;
    }
    if (view.mine === null) {
      renderRound(ids, view, items);
      return;
    }
    renderCompare(ids.compare, view, items);
    renderParent(
      ids.parent,
      view,
      parentItems(view.round, ids.topics, g.GEN ?? {}, g.quiz),
    );
    renderShare(ids.share, view);
  }

  async function load(ids) {
    clear(ids);
    let view;
    try {
      [view, ids.topics] = await Promise.all([
        getJson(`/api/squad${dayQuery()}`),
        getJson("/content/maths/topics.json"),
      ]);
    } catch {
      ids.status.textContent = TEXT.notLoaded;
      return;
    }
    render(ids, view);
  }

  if (typeof document !== "undefined") {
    const round = document.getElementById("round");
    if (round) {
      const ids = { topics: [] };
      for (const k of ["join", "week", "compare", "parent", "share", "status"])
        ids[k] = document.getElementById(k);
      ids.round = round;
      api.reload = () => load(ids);
      api.reload();
    }
  }

  globals().squad = Object.assign(api, {
    TEXT,
    PARENT_SLOTS,
    buildRound,
    parentItems,
    roundBody,
    daysText,
    totalText,
    memberOrder,
  });
})();
