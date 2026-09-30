/* Coach Dan (O2). Dan tries a fresh-number question and goes wrong; the pupil types the right answer.
   Every server string goes in with textContent: Dan's lines are untrusted text. Only the figure, which
   is content-pack SVG, goes in as parsed HTML (as chat.js does). Nothing here writes a file: both POSTs
   go to /api/coach, which saves the attempt and the coach record on the server.
   Loaded under Bun by src/marking/coach.test.ts, so nothing here touches document at load time. */
(() => {
  const RANKS = 5;

  /* "Dan is Noob, rank 1 of 5. 3 more catches to the next rank." */
  function rankLine(rank) {
    let line = `Dan is ${rank.name}, rank ${rank.level + 1} of ${RANKS}.`;
    if (rank.toNext !== null)
      line += ` ${rank.toNext} more ${rank.toNext === 1 ? "catch" : "catches"} to the next rank.`;
    return line;
  }

  /* what the pupil reads after a check; the working follows as its own paragraph */
  function resultLines(body) {
    const lines = body.caught
      ? ["You caught it. Dan says thanks.", `Dan's mistake: ${body.note}`]
      : [
          "Not this time.",
          `Dan's mistake: ${body.note}`,
          body.named
            ? `Your answer: ${body.named}`
            : "Your answer was not right either. Read the working.",
        ];
    lines.push("Check it against the working:");
    return lines;
  }

  const NOT_READY = {
    "no-topic": "No such topic.",
    "try-first": "Try a question on this topic first.",
    "no-item": "No question for Dan on this topic yet.",
  };
  const NOT_SAVED = "Not saved. Check the tutor window is still open.";
  const OFFLINE =
    "The question did not load. Check the tutor window is still open.";

  function load() {
    const $ = (id) => document.getElementById(id);
    const log = $("log");
    const page = new URLSearchParams(location.search);
    const topic = page.get("topic");
    const ref = {};

    function say(cls, ...lines) {
      const li = document.createElement("li");
      li.className = cls;
      for (const line of lines) {
        const p = document.createElement("p");
        p.textContent = line;
        li.appendChild(p);
      }
      log.appendChild(li);
      li.scrollIntoView({ block: "nearest" });
      return li;
    }

    function working(li, text) {
      if (!text) return;
      const p = document.createElement("p");
      p.className = "working";
      p.textContent = text;
      li.appendChild(p);
    }

    function failed(err) {
      $("item").hidden = false;
      $("stem").textContent =
        err instanceof TypeError
          ? OFFLINE
          : `The question did not load: ${err.message}`;
    }

    function readJson(res) {
      return res.json().then((body) => {
        if (!res.ok) throw new Error(body.error || String(res.status));
        return body;
      });
    }

    /* the topic list: every topic the pupil has tried, and Dan's rank */
    function showList(body) {
      $("pick").hidden = false;
      $("rank").textContent = rankLine(body.rank);
      if (body.topics.length === 0) {
        $("topics").appendChild(document.createElement("li")).textContent =
          "Try a question on a topic first. Then Dan can have a go.";
        return;
      }
      for (const t of body.topics) {
        const a = document.createElement("a");
        a.href = `/coach.html?${new URLSearchParams({ topic: t.id })}`;
        a.textContent = t.title;
        $("topics").appendChild(document.createElement("li")).appendChild(a);
      }
    }

    /* the question side, then Dan's attempt, then the form */
    function showQuestion(body) {
      $("title").textContent = body.title;
      $("item").hidden = false;
      $("stem").textContent = body.stem;
      if (body.figure) {
        // Parsed as HTML, as innerHTML would be: the figures carry no xmlns, so an SVG parse would not render them.
        const doc = new DOMParser().parseFromString(body.figure, "text/html");
        $("figure").replaceChildren(...doc.body.childNodes);
        $("figure").hidden = false;
      }
      if (body.scaffold) {
        $("scaffold").querySelector("p").textContent = body.scaffold;
        $("scaffold").hidden = false;
      }
      $("no-model").hidden = body.model;
      // only a set-up model writes Dan's lines, so the AI note shows only then
      document.querySelector(".ai-note").hidden = !body.model;
      ref.item = body.item;
      if (body.seed !== undefined) ref.seed = body.seed;
      const waiting = say("dan", "Dan is working on it…");
      fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "dan", ...ref }),
      })
        .then((res) =>
          res.json().then((body) => {
            waiting.remove();
            if (res.status === 409) {
              say("tutor", body.error);
              return setTimeout(() => location.reload(), 1500);
            }
            if (!res.ok)
              return say("tutor", body.error || "Something went wrong.");
            say("dan", ...body.lines.map((l) => `Dan: ${l}`));
            $("correct-form").hidden = false;
            $("answer").focus();
          }),
        )
        .catch(() => {
          waiting.remove();
          say("tutor", "Not sent. Check the tutor window is still open.");
        });
    }

    function check(e) {
      e.preventDefault();
      const typed = $("answer").value.trim();
      if (!typed) return;
      // as on the lesson pages: nothing is ticked until the pupil picks one
      if (!$("sure").checked && !$("notsure").checked) {
        $("sure-fb").textContent = "Sure or not sure first";
        return;
      }
      $("sure-fb").textContent = "";
      const button = $("correct-form").querySelector("button");
      button.disabled = true;
      say("you", `You: ${typed}`);
      fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step: "correct",
          ...ref,
          answer: typed,
          sure: $("sure").checked,
        }),
      })
        .then((res) =>
          res.json().then((body) => {
            if (res.status === 409) {
              say("tutor", body.error);
              return setTimeout(() => location.reload(), 1500);
            }
            if (!res.ok) {
              button.disabled = false;
              return say("tutor", body.error || "Something went wrong.");
            }
            const li = say("tutor", ...resultLines(body));
            working(li, body.working);
            say("tutor", rankLine(body.rank));
            if (!body.saved) say("tutor", NOT_SAVED);
            $("correct-form").hidden = true;
            $("after").hidden = false;
          }),
        )
        .catch(() => {
          button.disabled = false;
          say("tutor", "Not sent. Check the tutor window is still open.");
        });
    }

    $("correct-form").addEventListener("submit", check);
    // The shown count moved on the server, so the next GET picks a new question.
    $("another").addEventListener("click", () => location.reload());

    if (topic === null) {
      fetch("/api/coach").then(readJson).then(showList).catch(failed);
      return;
    }
    fetch(`/api/coach?${new URLSearchParams({ topic })}`)
      .then(readJson)
      .then((body) => {
        if (body.ready) return showQuestion(body);
        if (body.title) $("title").textContent = body.title;
        $("item").hidden = false;
        $("stem").textContent =
          NOT_READY[body.reason] || "Dan cannot try this one.";
        $("another").hidden = true;
        $("after").hidden = false;
      })
      .catch(failed);
  }

  if (typeof document !== "undefined" && document.getElementById("coach"))
    load();

  const root = typeof window === "undefined" ? globalThis : window;
  root.coach = { rankLine, resultLines };
})();
