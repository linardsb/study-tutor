// Shows one line when the start-up check found a newer release. Included by index.html and the map (T6).
// Built with textContent and append, never innerHTML.
fetch("/api/update")
  .then((r) => (r.ok ? r.json() : null))
  .then((u) => {
    if (!u?.update) return;
    const link = document.createElement("a");
    link.href = u.update.url;
    link.textContent = "A parent can download it here";
    const line = document.createElement("p");
    line.className = "update";
    line.append(`Version ${u.update.version} of the tutor is out. `, link, ".");
    document.querySelector("main")?.prepend(line);
  })
  .catch(() => {});
