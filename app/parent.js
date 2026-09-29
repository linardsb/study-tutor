/* The weekly digest page: this week so far and last week from GET /api/digest, each as a title and
   its lines. The server writes the words (src/digest.ts); this page only places them, with
   textContent only, and never rewords a line. A well-formed ?day= on the page URL is passed through.
   Runs in the browser. Loaded under Bun by src/marking/parent-dom.test.ts, so nothing here touches
   document at load time. */
(() => {
  const TEXT = {
    notLoaded: "The digest did not load. Check the tutor window is still open.",
    thisWeek: "This week so far",
    lastWeek: "Last week",
  };

  function el(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function dayQuery() {
    const day = new URLSearchParams(location.search).get("day");
    return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `?day=${day}` : "";
  }

  function section(holder, heading, digest) {
    holder.replaceChildren(el("h2", heading), el("h3", digest.title));
    const list = document.createElement("ul");
    for (const line of digest.lines) list.append(el("li", line));
    holder.append(list);
  }

  function render(ids, view) {
    section(ids.now, TEXT.thisWeek, view.now);
    section(ids.last, TEXT.lastWeek, view.last);
    ids.status.textContent = "";
  }

  async function load(ids) {
    let view;
    try {
      const res = await fetch(`/api/digest${dayQuery()}`);
      if (!res.ok) throw new Error(String(res.status));
      view = await res.json();
    } catch {
      ids.now.replaceChildren();
      ids.last.replaceChildren();
      ids.status.textContent = TEXT.notLoaded;
      return;
    }
    render(ids, view);
  }

  const api = {};
  if (typeof document !== "undefined") {
    const now = document.getElementById("now");
    if (now) {
      const ids = {
        now,
        last: document.getElementById("last"),
        status: document.getElementById("status"),
      };
      api.reload = () => load(ids);
      api.reload();
    }
  }

  const globals = () => (typeof window === "undefined" ? globalThis : window);
  globals().parent = Object.assign(api, { TEXT, render });
})();
