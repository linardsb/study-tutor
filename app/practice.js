/* The practice page: a picker built from topics.json and a Mixed 6 set from generators.js. */
(() => {
  const picker = document.querySelector(".picker");
  const holder = document.getElementById("set");
  const status = document.getElementById("status");
  const count = document.getElementById("count");

  function showCount() {
    const all = picker.querySelectorAll("input").length;
    count.textContent = `${picker.querySelectorAll("input:checked").length} of ${all} ticked`;
  }

  function ticked() {
    return [...picker.querySelectorAll("input:checked")].map((b) => ({
      code: b.dataset.code,
      topic: b.value,
    }));
  }
  function setAll(on) {
    for (const b of picker.querySelectorAll("input")) b.checked = on;
    showCount();
  }

  /* six picks, round robin over a shuffled list, so no two in a row share a code
     whenever more than one topic is ticked */
  function picks(rows, count) {
    const order = rows.slice();
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return Array.from({ length: count }, (_, n) => order[n % order.length]);
  }

  fetch("/content/maths/topics.json")
    .then((res) => res.json())
    .then((topics) => {
      /* ?topic= from the map ticks that one topic alone; anything else keeps every topic ticked */
      const only = new URLSearchParams(location.search).get("topic");
      const named = only !== null && topics.some((x) => x.id === only);
      for (const t of topics) {
        const code = t.aliases[0];
        /* a topic with no generator yet (the Year 11 rows) has nothing to mix */
        if (typeof window.GEN?.[code] !== "function") continue;
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = t.id;
        box.dataset.code = code;
        box.checked = !named || t.id === only;
        const span = document.createElement("span");
        span.className = "code";
        span.textContent = code;
        label.append(box, ` ${t.title} `, span);
        picker.appendChild(label);
      }
      showCount();
    })
    .catch(() => {
      status.textContent =
        "The topics did not load. Check the tutor window is still open.";
    });

  picker.addEventListener("change", showCount);
  document.getElementById("all").addEventListener("click", () => setAll(true));
  document
    .getElementById("none")
    .addEventListener("click", () => setAll(false));

  document.getElementById("mix").addEventListener("click", () => {
    const gens = window.GEN;
    if (!gens) {
      status.textContent =
        "No generators loaded. Check the tutor window is still open.";
      return;
    }
    const rows = ticked().filter((r) => typeof gens[r.code] === "function");
    if (!rows.length) {
      status.textContent = "Tick at least one topic first.";
      return;
    }
    const { section, items } = window.quiz.buildQuiz(
      gens,
      picks(rows, 6),
      "mixed set",
    );
    holder.innerHTML = "";
    holder.appendChild(section);
    window.quiz.initQuiz(section, items);
    status.textContent = `${rows.length} ${rows.length === 1 ? "topic" : "topics"} in the pot.`;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  });
})();
