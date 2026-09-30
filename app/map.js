/* The level map: one card per topic with its four-rung ladder, the weekly flame, total XP, and the
   one step GET /api/next returns. The map posts the session start and end bodies the server hands
   it, verbatim, through POST /api/event; it never composes a session event (flow stays in src/flow).
   Runs in the browser. Loaded under Bun by src/marking/map.test.ts, so nothing here touches
   document at load time. */
(() => {
  /* the same names as RUNGS in src/flow/ladder.ts; map.test.ts checks the two agree */
  const RUNGS = ["not started", "learning", "1 pass", "2 passes", "secure"];
  /* one name per session mode in src/events/types.ts */
  const MODE_NAMES = {
    lesson: "Lesson",
    practice: "Practice",
    retest: "Re-test",
    boss: "Boss",
    case: "Case",
    coach: "Coach",
    squad: "Squad",
    intake: "Intake",
  };
  const TEXT = {
    flame: (days, target) => `${days} of your ${target} this week`,
    statWeek: "days with practice",
    statXp: "XP",
    statStarted: (started, total) => `${started} of ${total}`,
    statStartedLabel: "topics started",
    open: (mode, title) =>
      `${MODE_NAMES[mode]} open${title ? `: ${title}` : ""}.`,
    boss: (n, m) =>
      `Boss ready. ${n} questions from ${m} ${m === 1 ? "topic" : "topics"} due a re-test. No hints, one go each.`,
    lesson: (title) => `Next: ${title}.`,
    practice: (title) => `Practice: ${title}.`,
    none: "Nothing to do. The pack is empty.",
    openIt: "Open it",
    done: "Done with it",
    startBoss: "Start the boss",
    startLesson: "Start the lesson",
    startPractice: "Start",
    noLesson: "no lesson yet",
    lessonLink: "lesson",
    dueToday: "re-test due today",
    dueIn: (n) => `re-test in ${n} ${n === 1 ? "day" : "days"}`,
    overdue: (n) => `re-test ${n} ${n === 1 ? "day" : "days"} overdue`,
    notLoaded: "The map did not load. Check the tutor window is still open.",
    lessonsNotLoaded:
      "The lessons did not load. Check the tutor window is still open.",
    notSaved: " Not saved. Check the tutor window is still open.",
    statLeft: "marks left on the table this week",
    statLastLeft: (n) => `last week ${n}`,
    statClean: "clean sheets this week",
    snapScan:
      "Scan this with your phone on the same Wi-Fi. It works once, for 15 minutes.",
    snapLocal: "Or drop a photo on this computer",
    snapFirewall:
      "If the phone cannot open the link, Windows may be blocking it. Use the link below to drop a photo on this computer instead.",
    snapNoModel:
      "No model is set up, so the tutor will store the photo but not mark it.",
    snapNoLan:
      "The phone cannot reach this computer from here. Drop a photo on this computer instead.",
    snapFailed:
      "The photo link did not open. Check the tutor window is still open.",
  };

  /* the two seams a test replaces: where a click sends the pupil, and the page's own reload */
  const api = {
    go: (href) => location.assign(href),
    reload: () => undefined,
  };

  const utcOf = (day) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };

  /* whole days from b to a, both YYYY-MM-DD; calendar arithmetic, so no DST effect */
  function dayDiff(a, b) {
    return Math.round((utcOf(a) - utcOf(b)) / 864e5);
  }

  function dueText(nextDue, day) {
    if (nextDue === null) return "";
    const n = dayDiff(nextDue, day);
    if (n === 0) return TEXT.dueToday;
    return n > 0 ? TEXT.dueIn(n) : TEXT.overdue(-n);
  }

  function cardClass(rag) {
    return { R: "r", A: "a", G: "g" }[rag] ?? "o";
  }

  const titleOf = (titles, topic) => titles[topic] ?? topic;

  function stepText(step, titles) {
    if (step.kind === "continue")
      return TEXT.open(
        step.mode,
        step.topic ? titleOf(titles, step.topic) : "",
      );
    if (step.kind === "boss")
      return TEXT.boss(step.boss.slots.length, step.boss.topics.length);
    if (step.kind === "lesson") return TEXT.lesson(titleOf(titles, step.topic));
    if (step.kind === "practice")
      return TEXT.practice(titleOf(titles, step.topic));
    return TEXT.none;
  }

  const practiceHref = (topic) =>
    `/practice.html?topic=${encodeURIComponent(topic)}`;

  /* the page an open session can be reopened on, or null for a mode with no page here */
  function pageFor(mode, topic, lessons, query) {
    if (mode === "boss") return `/retest.html${query}`;
    if (topic === null) return null;
    if (mode === "lesson") return lessons[topic] ?? null;
    if (mode === "practice") return practiceHref(topic);
    return null;
  }

  /* [{label, href}] opens a page; [{label, post, href?}] posts the body the server gave, then goes */
  function stepActions(step, lessons, query) {
    if (step.kind === "continue") {
      const href = pageFor(step.mode, step.topic, lessons, query);
      const actions = href ? [{ label: TEXT.openIt, href }] : [];
      actions.push({ label: TEXT.done, post: step.end });
      return actions;
    }
    if (step.kind === "boss")
      return [{ label: TEXT.startBoss, href: `/retest.html${query}` }];
    if (step.kind === "lesson") {
      const href = lessons[step.topic];
      return [
        href
          ? { label: TEXT.startLesson, post: step.start, href }
          : { label: TEXT.startLesson, post: step.start },
      ];
    }
    if (step.kind === "practice")
      return [
        {
          label: TEXT.startPractice,
          post: step.start,
          href: practiceHref(step.topic),
        },
      ];
    return [];
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

  function stat(big, label) {
    const box = el("div", "stat");
    box.append(el("b", "", big), el("span", "", label));
    return box;
  }

  /* ISO 8601 week of a YYYY-MM-DD, as isoWeek in src/mcp/clock.ts (the page cannot import it). */
  function isoWeek(day) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Thursday of this week
    const year = d.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week =
      1 +
      Math.round(
        ((d.getTime() - jan4.getTime()) / 864e5 -
          3 +
          ((jan4.getUTCDay() + 6) % 7)) /
          7,
      );
    return `${year}-W${String(week).padStart(2, "0")}`;
  }

  /* marks left on the table (of − marks) this week and the ISO week before it, and this week's clean
     sheets. Null with no marked photo this week: unmarked photos (no model) have no marks to leave. */
  function photoStats(state, next) {
    const photos = state.photos ?? {};
    const w = photos[next.flame.week];
    if (w === undefined || w.marked === 0) return null;
    const d = new Date(`${next.day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7);
    const b = photos[isoWeek(d.toISOString().slice(0, 10))];
    return {
      left: w.of - w.marks,
      lastLeft: b === undefined || b.marked === 0 ? null : b.of - b.marks,
      clean: w.clean,
    };
  }

  function renderStats(holder, state, next, topics) {
    const started = topics.filter(
      (t) => (state.topics[t.id]?.rung ?? 0) >= 1,
    ).length;
    holder.append(
      stat(TEXT.flame(next.flame.days, next.flame.target), TEXT.statWeek),
      stat(String(state.xp.total), TEXT.statXp),
      stat(TEXT.statStarted(started, topics.length), TEXT.statStartedLabel),
    );
    const photos = photoStats(state, next);
    if (photos === null) return;
    const left = stat(String(photos.left), TEXT.statLeft);
    if (photos.lastLeft !== null)
      left.appendChild(el("span", "", TEXT.statLastLeft(photos.lastLeft)));
    holder.append(left, stat(String(photos.clean), TEXT.statClean));
  }

  /* the examiner block: mint a snap for the last attempt, then the QR code (the tutor's own SVG from
     uqr, never model text) and the local link for a dropped file */
  async function openSnap(holder, btn) {
    btn.disabled = true;
    holder.replaceChildren();
    /* false only when the settings say no model; a failed read says nothing either way */
    const model = getJson("/api/config")
      .then((c) => Boolean(c.configured && c.config?.preset !== "none"))
      .catch(() => true);
    let res;
    let body;
    try {
      res = await fetch("/api/snap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      body = await res.json();
    } catch {
      holder.appendChild(el("p", "note", TEXT.snapFailed));
      btn.disabled = false;
      return;
    }
    btn.disabled = false;
    if (res.status !== 201) {
      holder.appendChild(el("p", "note", body.error || TEXT.snapFailed));
      return;
    }
    holder.appendChild(el("p", "stem", body.stem));
    if (!(await model)) holder.appendChild(el("p", "note", TEXT.snapNoModel));
    if (body.qr) {
      const svg = new DOMParser().parseFromString(body.qr, "image/svg+xml");
      const box = el("div", "qr");
      box.appendChild(document.importNode(svg.documentElement, true));
      holder.append(
        box,
        el("p", "", TEXT.snapScan),
        el("p", "note", TEXT.snapFirewall),
      );
    } else holder.appendChild(el("p", "note", TEXT.snapNoLan));
    const a = el("a", "", TEXT.snapLocal);
    a.href = body.local;
    holder.appendChild(el("p")).appendChild(a);
  }

  /* a post action: the button posts the served body, then goes to its page or re-renders in place */
  function actionButton(holder, action, ids) {
    const btn = el("button", "", action.label);
    btn.type = "button";
    btn.addEventListener("click", () => {
      btn.disabled = true;
      postEvent(action.post).then((saved) => {
        if (saved) {
          if (action.href) api.go(action.href);
          else load(ids);
          return;
        }
        const note = holder.querySelector(".note") ?? el("p", "note");
        note.textContent = TEXT.notSaved;
        holder.appendChild(note);
        btn.disabled = false;
      });
    });
    return btn;
  }

  function renderToday(holder, step, titles, lessons, query, ids) {
    holder.hidden = false;
    holder.appendChild(el("p", "", stepText(step, titles)));
    for (const action of stepActions(step, lessons, query)) {
      if (action.post === undefined) {
        const a = el("a", "", action.label);
        a.href = action.href;
        holder.appendChild(a);
      } else holder.appendChild(actionButton(holder, action, ids));
    }
  }

  function ladder(rung) {
    const box = el("div", "ladder");
    box.setAttribute("role", "img");
    box.setAttribute("aria-label", `${RUNGS[rung]}, rung ${rung} of 4`);
    for (let i = 0; i < 4; i += 1)
      box.appendChild(el("i", i < rung ? "on" : ""));
    return box;
  }

  function card(t, ts, day, lesson) {
    const box = el("div", `card ${cardClass(ts.rag)}`);
    box.append(
      el("span", "code", t.aliases[0] ?? ""),
      el("span", "topic", t.title),
      ladder(ts.rung),
    );
    const due = dueText(ts.nextDue, day);
    box.appendChild(
      el("span", "rung", `${RUNGS[ts.rung]}${due ? ` · ${due}` : ""}`),
    );
    box.appendChild(document.createTextNode(" · "));
    if (lesson) {
      const a = el("a", "meta", TEXT.lessonLink);
      a.href = lesson;
      box.appendChild(a);
    } else box.appendChild(el("span", "meta", TEXT.noLesson));
    return box;
  }

  function renderCards(holder, state, topics, day, lessons) {
    for (const t of topics) {
      const ts = state.topics[t.id] ?? { rung: 0, nextDue: null, rag: null };
      holder.appendChild(card(t, ts, day, lessons[t.id]));
    }
  }

  /* only a well-formed ?day= reaches the route; anything else asks for today */
  function dayQuery() {
    const day = new URLSearchParams(location.search).get("day");
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `?day=${day}` : "";
  }

  /* re-entrant: "Done with it" calls it again to re-render in place */
  async function load(ids) {
    const query = dayQuery();
    ids.status.textContent = "";
    ids.today.hidden = true;
    for (const holder of [ids.stats, ids.today, ids.cards])
      holder.replaceChildren();
    /* null when the lessons did not load; said only once the map itself has loaded */
    const lessons = getJson("/api/lessons").catch(() => null);
    let state;
    let next;
    let topics;
    try {
      [state, next, topics] = await Promise.all([
        getJson("/api/state"),
        getJson(`/api/next${query}`),
        getJson("/api/topics"),
      ]);
    } catch {
      ids.status.textContent = TEXT.notLoaded;
      return;
    }
    const loaded = await lessons;
    if (loaded === null) ids.status.textContent = TEXT.lessonsNotLoaded;
    const urls = loaded ?? {};
    const titles = {};
    for (const t of topics) titles[t.id] = t.title;
    renderStats(ids.stats, state, next, topics);
    renderToday(ids.today, next.step, titles, urls, query, ids);
    renderCards(ids.cards, state, topics, next.day, urls);
  }

  if (typeof document !== "undefined") {
    const cards = document.getElementById("cards");
    if (cards) {
      const ids = {
        stats: document.getElementById("stats"),
        today: document.getElementById("today"),
        cards,
        status: document.getElementById("status"),
      };
      api.reload = () => load(ids);
      api.reload();
      const snapBtn = document.getElementById("snap-open");
      const snapBox = document.getElementById("snap");
      if (snapBtn && snapBox)
        snapBtn.addEventListener("click", () => openSnap(snapBox, snapBtn));
    }
  }

  const root = typeof window === "undefined" ? globalThis : window;
  root.map = Object.assign(api, {
    TEXT,
    MODE_NAMES,
    RUNGS,
    dayDiff,
    dueText,
    cardClass,
    stepText,
    stepActions,
    photoStats,
  });
})();
