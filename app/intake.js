/* The intake page: three ways to tell the tutor where the pupil stands (a school sheet or photo, three
   questions, a cold test), each ending on one confirm list. Nothing is saved until the pupil ticks rows
   and presses Save, which posts one intake@1 body to /api/event. The sheet and interview routes write
   nothing. The cold test is built and marked here, as the boss is: no attempt, XP or session line.
   Invariant: an item's answer and working enter the DOM only inside the check handler, as retest.js.
   Loaded under Bun by src/marking/intake.test.ts, so nothing here touches document at load time when
   there is none. */
(() => {
  const TEXT = {
    questions: {
      confident: "Which topics could you do in a test tomorrow?",
      unsure: "Which topics have you met but still feel shaky on?",
      stuck: "Which topics lose you, or have you not been taught yet?",
    },
    red: "Red",
    amber: "Amber",
    green: "Green",
    tick: "Save this",
    readAs: (code) => `read as ${code}`,
    save: "Save",
    saved: "Saved. Your map now shows these topics.",
    toMap: "Open the map",
    notSaved: "Not saved. Check the tutor window is still open.",
    nothingTicked: "Tick at least one topic to save.",
    confirmHead: "Check these, then save",
    pasteFirst: "Paste the text from the sheet first.",
    reading: "Reading the sheet. This can take a minute.",
    unknownHead: "Codes this tutor has no topic for yet",
    unknown: (code) => `${code}: no topic here yet.`,
    nothingFound: "No topic codes found in that text.",
    photoNoModel:
      "A photo needs a model to read it. Paste the text from the sheet instead, or type the codes.",
    photoFailed:
      "The photo could not be read this time. Try a clearer photo, or paste the text from the sheet.",
    heic: "This page cannot read that type of photo. Use a JPEG or PNG, or paste the text.",
    goesToModel:
      "The text or photo goes to the model a parent set up, so it can read the codes. The tutor does not keep a copy.",
    isAI: "This is an AI. It matches your words to topics. Check each one before you save.",
    match: "Match my answers",
    matching: "Matching your answers. This can take a minute.",
    writeFirst: "Write something for at least one question.",
    noMatch: "No topic matched your answers. Rate the topics yourself below.",
    matchFailed:
      "Matching your answers did not work this time. Rate the topics yourself below.",
    checklistHead: "Rate the topics you know about",
    can: "I can do this",
    shaky: "Shaky",
    lost: "Lost",
    coldIntro: (n) =>
      `${n} questions, each from a different topic. Answer from memory, then say whether you are sure. Nothing here adds XP.`,
    nothingToAsk: "There are no questions to ask right now.",
    noQuestions: "The questions could not be built. Tell a parent.",
    notLoaded: "This did not load. Check the tutor window is still open.",
    sheetRefused:
      "The tutor could not take that. Paste a shorter part of the sheet, or use a JPEG, PNG or WebP photo.",
    yourAnswer: "Your answer ",
    sure: "Sure",
    notSure: "Not sure",
    check: "Check",
    answerFirst: "Write an answer first, even a guess.",
    foundation: "Foundation",
    higher: "Higher",
    coursesLine: "Courses: ",
    changeCourses: "Change courses",
    coursesSaved: "Courses saved.",
    coursesNotSaved: "Could not save the courses.",
    sureFirst: "Pick Sure or Not sure first.",
    correct: "Correct.",
    wrong: "Not this time.",
  };
  const RAGS = [
    ["R", "red"],
    ["A", "amber"],
    ["G", "green"],
  ];
  /* the self-rating checklist's three levels, as CONFIDENCE_RAG in src/flow/intake.ts */
  const LEVELS = [
    ["G", "can"],
    ["A", "shaky"],
    ["R", "lost"],
  ];
  // Twins of app/snap.js (src/marking/intake.test.ts compares them). expected: Anthropic resizes above
  // 1568 px on the long side, and refuses an image over 5 MB.
  const LONG_SIDE = 1568;
  const MAX_BYTES = 5 * 1024 * 1024;
  const SENDABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

  /* the same rule as ragFor in src/flow/diagnostic.ts; intake.test.ts checks the copies agree */
  function ragFor(correct, sure) {
    if (!correct) return "R";
    return sure ? "G" : "A";
  }

  /* the intake@1 body, as intakeRecord in src/flow/intake.ts; null when no row is ticked */
  function intakeBody(door, rows) {
    if (rows.length === 0) return null;
    return {
      v: 1,
      type: "intake",
      door,
      topics: rows.map((r) => ({ topic: r.topic, rag: r.rag })),
    };
  }

  /* a row can be saved once it has an R/A/G */
  function tickable(row) {
    return row.rag === "R" || row.rag === "A" || row.rag === "G";
  }

  /* A data URL of the photo: the twin of encode in app/snap.js. Not loaded from there: snap.js runs
     its own start-up code. */
  function encode(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(
          1,
          LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (!SENDABLE.has(file.type) || file.size > MAX_BYTES) {
          reject(new Error(TEXT.heic));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(TEXT.heic));
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  }

  /* the seams a test uses: the canvas step (happy-dom has no canvas) and the page's own reload */
  const api = { encode, reload: () => undefined };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function getJson(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    });
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

  const globals = () => (typeof window === "undefined" ? globalThis : window);
  const byId = (id) => document.getElementById(id);
  const say = (text) => {
    byId("status").textContent = text;
  };

  /* what the page holds between clicks: the open door, the confirm rows, whether a model is set up,
     the /api/topics rows once fetched, whether this cold test is already saved, the /api/courses reply */
  const page = {
    door: "",
    rows: [],
    model: false,
    topics: null,
    coldSaved: false,
    courses: null,
  };

  function topicsOnce() {
    if (page.topics) return Promise.resolve(page.topics);
    return getJson("/api/topics").then((t) => {
      page.topics = t;
      return t;
    });
  }

  /* ---- the confirm list, shared by every door ---- */

  function ragRadios(row, i) {
    const span = el("span", "confidence segmented");
    for (const [rag, key] of RAGS) {
      const label = el("label");
      const input = el("input");
      input.type = "radio";
      input.name = `rag-${i}`;
      input.value = rag;
      input.checked = row.rag === rag;
      input.addEventListener("change", () => {
        row.rag = rag;
        renderConfirm();
      });
      label.append(input, ` ${TEXT[key]} `);
      span.appendChild(label);
    }
    return span;
  }

  function tickBox(row) {
    const label = el("label", "tick");
    const box = el("input");
    box.type = "checkbox";
    box.checked = row.ticked && tickable(row);
    box.disabled = !tickable(row);
    box.addEventListener("change", () => {
      row.ticked = box.checked;
    });
    label.append(box, ` ${TEXT.tick}`);
    return label;
  }

  function confirmItem(row, i) {
    const li = el("li");
    li.dataset.topic = row.topic;
    li.appendChild(el("span", "title", row.title));
    if (row.code) li.append(" ", el("span", "note", TEXT.readAs(row.code)));
    li.append(" ", ragRadios(row, i), " ", tickBox(row));
    return li;
  }

  function renderConfirm() {
    const holder = byId("confirm");
    holder.replaceChildren();
    holder.hidden = page.rows.length === 0;
    if (page.rows.length === 0) return;
    holder.appendChild(el("h2", "", TEXT.confirmHead));
    const list = el("ol", "rows");
    page.rows.forEach((row, i) => {
      list.appendChild(confirmItem(row, i));
    });
    const btn = el("button", "", TEXT.save);
    btn.type = "button";
    btn.id = "save";
    btn.addEventListener("click", () => save(btn));
    const p = el("p", "actions");
    p.appendChild(btn);
    holder.append(list, p);
  }

  /* Rows as {topic, title, rag, code?}. source "model": each starts unticked, so nothing a model read is
     saved until the pupil ticks it. source "code": a row with an R/A/G starts ticked. A row with no R/A/G
     cannot be ticked until one is picked. */
  function confirmRows(door, rows, source) {
    page.door = door;
    page.rows = rows.map((r) => ({
      topic: r.topic,
      title: r.title,
      rag: r.rag ?? null,
      code: source === "model" ? r.code : undefined,
      ticked: source === "code" && tickable(r),
    }));
    renderConfirm();
  }

  /* one row added or changed in place (the checklist): ticked, since the pupil picked it */
  function upsertRow(door, row) {
    if (page.door !== door) page.rows = [];
    page.door = door;
    const seen = page.rows.find((r) => r.topic === row.topic);
    if (seen) Object.assign(seen, { rag: row.rag, ticked: true });
    else page.rows.push({ ...row, ticked: true });
    renderConfirm();
  }

  async function save(btn) {
    const ticked = page.rows.filter((r) => r.ticked && tickable(r));
    const body = intakeBody(page.door, ticked);
    if (body === null) {
      say(TEXT.nothingTicked);
      return;
    }
    btn.disabled = true;
    if (!(await postEvent(body))) {
      say(TEXT.notSaved);
      btn.disabled = false;
      return;
    }
    /* one intake@1 per list: the saved list goes, and a saved cold test cannot be saved again */
    page.rows = [];
    renderConfirm();
    if (page.door === "diagnostic") {
      page.coldSaved = true;
      byId("cold-save").disabled = true;
    }
    say(TEXT.saved);
    const a = el("a", "", TEXT.toMap);
    a.href = "/map.html";
    byId("status").append(" ", a);
  }

  /* ---- sheet or photo ---- */

  function renderUnknown(codes) {
    const holder = byId("unknown");
    holder.replaceChildren();
    if (codes.length === 0) return;
    holder.appendChild(el("h3", "", TEXT.unknownHead));
    for (const code of codes)
      holder.appendChild(el("p", "note", TEXT.unknown(code)));
  }

  function renderSheetReply(reply) {
    if (reply.by === "none") {
      say(reply.reason === "no-model" ? TEXT.photoNoModel : TEXT.photoFailed);
      return;
    }
    say(
      reply.rows.length + reply.unknown.length === 0 ? TEXT.nothingFound : "",
    );
    confirmRows("sheet", reply.rows, reply.by === "model" ? "model" : "code");
    renderUnknown(reply.unknown);
  }

  async function sendSheet(body) {
    page.rows = [];
    renderConfirm();
    renderUnknown([]);
    say(TEXT.reading);
    try {
      const res = await fetch("/api/intake/sheet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 400) {
        say(TEXT.sheetRefused);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      renderSheetReply(await res.json());
    } catch {
      say(TEXT.notLoaded);
    }
  }

  function readText() {
    const text = byId("sheet-text").value.trim();
    if (!text) {
      say(TEXT.pasteFirst);
      return;
    }
    return sendSheet({ text });
  }

  async function readPhoto(file) {
    let image;
    try {
      image = await api.encode(file);
    } catch {
      say(TEXT.heic);
      return;
    }
    await sendSheet({ image });
  }

  function openSheet() {
    const line = byId("model-line");
    line.textContent = TEXT.goesToModel;
    line.hidden = !page.model;
  }

  /* ---- tell me ---- */

  function renderAnswers() {
    const holder = byId("answers");
    holder.replaceChildren();
    holder.hidden = !page.model;
    if (!page.model) return;
    for (const [key, q] of Object.entries(TEXT.questions)) {
      const label = el("label", "", q);
      label.htmlFor = `answer-${key}`;
      const area = el("textarea");
      area.id = `answer-${key}`;
      area.rows = 3;
      holder.append(label, area);
    }
    const btn = el("button", "", TEXT.match);
    btn.type = "button";
    btn.id = "match";
    btn.addEventListener("click", () => match(btn));
    const p = el("p", "actions");
    p.appendChild(btn);
    holder.appendChild(p);
  }

  function levelButton(topic, rag, key, pick) {
    const btn = el("button", "", TEXT[key]);
    btn.type = "button";
    btn.dataset.rag = rag;
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => pick(topic, rag));
    return btn;
  }

  function pickLevel(topic, rag) {
    for (const b of byId("checklist").querySelectorAll(
      `li[data-topic="${topic.id}"] button`,
    ))
      b.setAttribute("aria-pressed", String(b.dataset.rag === rag));
    upsertRow("interview", { topic: topic.id, title: topic.title, rag });
  }

  async function renderChecklist(lead) {
    const holder = byId("checklist");
    holder.replaceChildren();
    let topics;
    try {
      topics = await topicsOnce();
    } catch {
      say(TEXT.notLoaded);
      return;
    }
    if (lead) holder.appendChild(el("p", "note", lead));
    holder.appendChild(el("h3", "", TEXT.checklistHead));
    const list = el("ul", "rows");
    for (const t of topics) {
      const li = el("li");
      li.dataset.topic = t.id;
      li.appendChild(el("span", "title", t.title));
      const levels = el("span", "segmented");
      for (const [rag, key] of LEVELS)
        levels.appendChild(levelButton(t, rag, key, pickLevel));
      li.appendChild(levels);
      list.appendChild(li);
    }
    holder.appendChild(list);
  }

  function readAnswers() {
    const answers = {};
    for (const key of Object.keys(TEXT.questions))
      answers[key] = byId(`answer-${key}`).value.trim();
    return answers;
  }

  async function match(btn) {
    const answers = readAnswers();
    if (Object.values(answers).every((a) => a === "")) {
      say(TEXT.writeFirst);
      return;
    }
    btn.disabled = true;
    say(TEXT.matching);
    let reply;
    try {
      const res = await fetch("/api/intake/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error(String(res.status));
      reply = await res.json();
    } catch {
      reply = { by: "none", reason: "failed" };
    }
    btn.disabled = false;
    say("");
    showMatch(reply);
  }

  function showMatch(reply) {
    if (reply.by === "none") {
      void renderChecklist(reply.reason === "failed" ? TEXT.matchFailed : "");
      return;
    }
    if (reply.rows.length === 0) {
      void renderChecklist(TEXT.noMatch);
      return;
    }
    confirmRows("interview", reply.rows, "model");
  }

  function openInterview() {
    /* no model, no AI: the pupil rates the topics themselves */
    byId("ai-line").hidden = !page.model;
    renderAnswers();
    byId("checklist").replaceChildren();
    if (!page.model) void renderChecklist("");
  }

  /* ---- cold test ---- */

  function sureRadios(n) {
    const span = el("span", "confidence");
    for (const [value, text] of [
      ["sure", TEXT.sure],
      ["notsure", TEXT.notSure],
    ]) {
      const label = el("label");
      const input = el("input");
      input.type = "radio";
      input.name = `sure-cold-${n}`;
      input.value = value;
      label.append(input, ` ${text} `);
      span.appendChild(label);
    }
    return span;
  }

  /* one .q: numbered, no topic name, code or item id; Sure / Not sure as quiz.js lays it out */
  function coldQ(item, number) {
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
    q.append(label, sureRadios(number), btn, fb, work);
    return q;
  }

  /* one go: needs an answer and a Sure choice, then marks, shows the working, locks and reports */
  function wireCold(q, item, onDone) {
    const input = q.querySelector("input[type=text]");
    const btn = q.querySelector(".check");
    const fb = q.querySelector(".feedback");
    const work = q.querySelector(".working:not(.faded)");
    const quiz = globals().quiz;
    btn.addEventListener("click", () => {
      if (q.classList.contains("done")) return;
      fb.hidden = false;
      const picked = q.querySelector(".confidence input:checked");
      if (!quiz.norm(input.value)) {
        fb.textContent = TEXT.answerFirst;
        return;
      }
      if (!picked) {
        fb.textContent = TEXT.sureFirst;
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
      for (const r of q.querySelectorAll(".confidence input"))
        r.disabled = true;
      onDone(ok, picked.value === "sure");
    });
  }

  /* the diagnostic's questions, built as the boss's are: items files for the fixed slots only */
  async function buildCold(d) {
    const boss = globals().boss;
    const topics = await topicsOnce();
    const fixed = [
      ...new Set(d.slots.filter((s) => s.item !== null).map((s) => s.topic)),
    ];
    const itemsByTopic = {};
    for (const id of fixed) {
      const row = topics.find((t) => t.id === id);
      itemsByTopic[id] = row ? await getJson(boss.itemsFile(row)) : [];
    }
    const g = globals();
    return boss.buildItems(d, topics, itemsByTopic, g.GEN ?? {}, g.quiz);
  }

  function renderCold(built) {
    const titles = {};
    for (const t of page.topics) titles[t.id] = t.title;
    const results = [];
    const saveBtn = byId("cold-save");
    byId("cold-intro").appendChild(el("p", "", TEXT.coldIntro(built.length)));
    for (const [i, { slot, item }] of built.entries()) {
      const q = coldQ(item, i + 1);
      byId("cold").appendChild(q);
      wireCold(q, item, (ok, sure) => {
        results.push({
          topic: slot.topic,
          title: titles[slot.topic] ?? slot.topic,
          rag: ragFor(ok, sure),
        });
        saveBtn.disabled = page.coldSaved;
      });
    }
    saveBtn.onclick = () => confirmRows("diagnostic", results, "code");
  }

  async function openDiagnostic() {
    byId("cold-intro").replaceChildren();
    byId("cold").replaceChildren();
    byId("cold-save").disabled = true;
    page.coldSaved = false;
    let built;
    try {
      const d = await getJson("/api/intake/diagnostic");
      if (d === null) {
        byId("cold-intro").appendChild(el("p", "", TEXT.nothingToAsk));
        return;
      }
      built = await buildCold(d);
    } catch {
      say(TEXT.notLoaded);
      return;
    }
    if (built.length === 0) {
      say(TEXT.noQuestions);
      return;
    }
    renderCold(built);
  }

  /* ---- doors ---- */

  const OPEN = {
    sheet: openSheet,
    interview: openInterview,
    diagnostic: openDiagnostic,
  };

  function openDoor(door) {
    for (const d of Object.keys(OPEN)) byId(d).hidden = d !== door;
    for (const b of byId("doors").querySelectorAll("button"))
      b.setAttribute("aria-pressed", String(b.dataset.door === door));
    page.rows = [];
    renderConfirm();
    say("");
    return OPEN[door]();
  }

  /* ---- the pupil's courses: asked before the doors until one is saved ---- */

  const TIERS = [
    ["F", "foundation"],
    ["H", "higher"],
  ];

  function renderCourses(c) {
    const list = byId("course-list");
    list.replaceChildren();
    for (const course of c.courses) {
      const saved = c.chosen.find((x) => x.spec === course.spec);
      const row = el("p");
      const label = el("label");
      const box = el("input");
      box.type = "checkbox";
      box.dataset.spec = course.spec;
      box.checked = Boolean(saved);
      label.append(box, ` ${course.board} ${course.title}`);
      row.append(label);
      if (course.tiers.length > 0) {
        const span = el("span", "segmented");
        for (const [tier, key] of TIERS) {
          if (!course.tiers.includes(tier)) continue;
          const l = el("label");
          const radio = el("input");
          radio.type = "radio";
          radio.name = `tier-${course.spec}`;
          radio.value = tier;
          radio.checked = saved?.tier === tier;
          l.append(radio, ` ${TEXT[key]}`);
          span.append(l);
        }
        row.append(" ", span);
      }
      list.append(row);
    }
  }

  function courseName(course, tier) {
    const name = `${course.board} ${course.title}`;
    if (tier === "F") return `${name}, ${TEXT.foundation}`;
    if (tier === "H") return `${name}, ${TEXT.higher}`;
    return name;
  }

  function showCourses(c) {
    const none = c.chosen.length === 0;
    byId("courses").hidden = !none;
    byId("doors").hidden = none;
    const line = byId("courses-line");
    line.hidden = none;
    line.replaceChildren();
    if (none) return;
    const names = c.chosen.map((x) =>
      courseName(
        c.courses.find((k) => k.spec === x.spec) ?? {
          board: "",
          title: x.spec,
        },
        x.tier,
      ),
    );
    const change = el("button", "", TEXT.changeCourses);
    change.type = "button";
    change.onclick = () => {
      renderCourses(c);
      byId("courses").hidden = false;
    };
    line.append(`${TEXT.coursesLine}${names.join("; ")} `, change);
  }

  async function saveCourses() {
    const courses = [];
    for (const box of byId("course-list").querySelectorAll(
      "input[type=checkbox]",
    )) {
      if (!box.checked) continue;
      const tier = byId("course-list").querySelector(
        `input[name="tier-${box.dataset.spec}"]:checked`,
      );
      courses.push(
        tier
          ? { spec: box.dataset.spec, tier: tier.value }
          : { spec: box.dataset.spec },
      );
    }
    let res;
    let reply;
    try {
      res = await fetch("/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courses }),
      });
      reply = await res.json();
    } catch {
      say(TEXT.coursesNotSaved);
      return;
    }
    if (!res.ok) {
      say(reply?.error ?? TEXT.coursesNotSaved);
      return;
    }
    page.topics = null; // the topic list the doors match against has changed
    page.courses.chosen = reply.chosen;
    showCourses(page.courses);
    say(TEXT.coursesSaved);
  }

  async function load() {
    try {
      const c = await getJson("/api/config");
      page.model = Boolean(c.configured && c.config?.preset !== "none");
    } catch {
      page.model = false;
    }
    try {
      page.courses = await getJson("/api/courses");
      // No course to pick would leave the panel empty and the doors hidden.
      if (page.courses.courses.length === 0) throw new Error("no courses");
      renderCourses(page.courses);
      showCourses(page.courses);
    } catch {
      // No courses route, or no courses: the page as it was, doors first.
      page.courses = null;
      byId("doors").hidden = false;
      byId("courses").hidden = true;
      byId("courses-line").hidden = true;
    }
    byId("courses-save").onclick = () => saveCourses();
    for (const b of byId("doors").querySelectorAll("button"))
      b.onclick = () => openDoor(b.dataset.door);
    byId("sheet-read").onclick = () => readText();
    byId("sheet-file").onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) void readPhoto(file);
    };
  }

  if (typeof document !== "undefined" && document.getElementById("doors")) {
    api.reload = load;
    api.ready = load();
  }

  globals().intake = Object.assign(api, {
    TEXT,
    LONG_SIDE,
    MAX_BYTES,
    ragFor,
    intakeBody,
    confirmRows,
    tickable,
    openDoor,
    showCourses,
    page,
  });
})();
