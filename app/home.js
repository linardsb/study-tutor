// The home page's getting-started list: each step is ticked from what the server already knows, the
// next open step gets the filled button, and the whole list hides once every step is done.
(() => {
  const box = document.getElementById("getting-started");
  if (!box) return;
  const get = (url) => fetch(url).then((r) => (r.ok ? r.json() : null));
  Promise.all([get("/api/config"), get("/api/state")])
    .then(([config, state]) => {
      if (!config || !state) return;
      const done = {
        settings: config.configured === true,
        intake: Object.values(state.topics ?? {}).some((t) => t.rag !== null),
        first: (state.xp?.total ?? 0) > 0,
      };
      if (Object.values(done).every(Boolean)) return;
      let next = true;
      for (const li of box.querySelectorAll("li[data-step]")) {
        const ok = done[li.dataset.step];
        li.classList.toggle("done", ok);
        const btn = li.querySelector(".button");
        btn.hidden = ok;
        btn.classList.toggle("secondary", !ok && !next);
        if (!ok) next = false;
      }
      box.hidden = false;
    })
    .catch(() => {});
})();
