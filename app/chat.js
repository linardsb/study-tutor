/* The chat panel for one item. Every model string goes in with textContent: a reply is untrusted text.
   Only the figure, which is content-pack SVG, goes in as HTML (as quiz.js does). */
(() => {
  const page = new URLSearchParams(location.search);
  const ref = { item: page.get("item") || "" };
  if (page.has("seed")) ref.seed = page.get("seed");

  const $ = (id) => document.getElementById(id);
  const log = $("log");
  let topic = "";
  /* the job-marked item types in src/content/types.ts: a written answer is explained point by point */
  const WRITTEN = ["short", "extended", "practical-method"];

  /* one log entry; `lines` are shown as separate paragraphs */
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

  function show(state) {
    topic = state.topic;
    $("title").textContent = state.title;
    $("stem").textContent = state.stem;
    if (state.figure) {
      // Parsed as HTML, as innerHTML would be: the figures carry no xmlns, so an SVG parse would not render them.
      const doc = new DOMParser().parseFromString(state.figure, "text/html");
      $("figure").replaceChildren(...doc.body.childNodes);
      $("figure").hidden = false;
    }
    if (state.scaffold) {
      $("scaffold").querySelector("p").textContent = state.scaffold;
      $("scaffold").hidden = false;
    }
    if (WRITTEN.includes(state.type)) {
      document.querySelector('label[for="teach"]').textContent =
        "Explain your answer, one point per line.";
      $("teach-form").querySelector("button").textContent = "Mark my answer";
    }
    $("no-model").hidden = state.model;
    // only a set-up model can reply, so the AI note shows only then
    document.querySelector(".ai-note").hidden = !state.model;
    $("before").hidden = state.attempted;
    $("after").hidden = !state.attempted;
  }

  function load() {
    if (!ref.item) {
      $("stem").textContent =
        "Open the tutor chat from a question in a lesson or in practice.";
      return Promise.resolve();
    }
    return fetch(`/api/chat?${new URLSearchParams(ref)}`)
      .then((res) =>
        res.json().then((body) => {
          if (!res.ok) throw new Error(body.error || String(res.status));
          show(body);
        }),
      )
      .catch((err) => {
        $("stem").textContent =
          err instanceof TypeError
            ? "The question did not load. Check the tutor window is still open."
            : `The question did not load: ${err.message}`;
      });
  }

  function reply(body) {
    if (body.kind === "text") return say("tutor", body.text);
    if (body.kind === "marks") {
      const li = say(
        "tutor",
        ...body.marks.map(
          (m, i) =>
            `${body.per === "point" ? "Point" : "Line"} ${i + 1}: ${m.mark === 1 ? "1 mark" : "0 marks"}${m.note ? `. ${m.note}` : ""}`,
        ),
        `${body.score} of ${body.of}.`,
        "The tutor's marks can be wrong. Check them against the working:",
      );
      working(li, body.working);
      if (body.saved) {
        const p = document.createElement("p");
        p.className = "note";
        p.textContent = "Saved to your record.";
        li.appendChild(p);
        // O2: teaching beats preparing to teach, so Dan is offered right after a saved teach-back.
        const coach = document.createElement("p");
        const a = document.createElement("a");
        a.href = `/coach.html?${new URLSearchParams({ topic })}`;
        a.textContent = "Coach Dan on this topic";
        coach.appendChild(a);
        li.appendChild(coach);
      }
      return li;
    }
    if (body.kind === "no-verdict") {
      const li = say(
        "tutor",
        "No marks this time. Compare your steps with the working:",
      );
      working(li, body.working);
      return li;
    }
    return say("tutor", "No reply this time. Try again.");
  }

  function send(job, box) {
    const text = box.value.trim();
    if (!text && job !== "hint") return;
    const form = box.closest("form");
    const button = form.querySelector("button");
    // one paragraph per line, so a teach-back written one step per line keeps its lines
    say("you", ...`You: ${text || "(no working yet)"}`.split("\n"));
    const waiting = say("tutor", "Thinking…");
    button.disabled = true;
    fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        job,
        ...ref,
        ...(ref.seed === undefined ? {} : { seed: Number(ref.seed) }),
        text: text || "No working yet.",
      }),
    })
      .then((res) =>
        res.json().then((body) => {
          waiting.remove();
          if (res.status === 409) {
            say("tutor", body.error);
            return load();
          }
          if (!res.ok)
            return say("tutor", body.error || "Something went wrong.");
          reply(body);
          box.value = "";
        }),
      )
      .catch(() => {
        waiting.remove();
        say("tutor", "Not sent. Check the tutor window is still open.");
      })
      .finally(() => {
        button.disabled = false;
      });
  }

  for (const [form, job, box] of [
    ["guess-form", "guess_first", "guess"],
    ["hint-form", "hint", "working"],
    ["teach-form", "teachback_mark", "teach"],
  ])
    $(form).addEventListener("submit", (e) => {
      e.preventDefault();
      send(job, $(box));
    });

  void load();
})();
