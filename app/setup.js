/* The parent's settings page: provider, key, model, monthly token limit, weekly target.
   The key is sent once on save and never comes back: /api/config has no key field, only keySet. */
(() => {
  const form = document.getElementById("setup");
  const preset = document.getElementById("preset");
  const fields = document.getElementById("model-fields");
  const limit = document.getElementById("limit");
  const baseUrl = document.getElementById("base_url");
  const model = document.getElementById("model");
  const key = document.getElementById("key");
  const keyNote = document.getElementById("key-note");
  const cap = document.getElementById("cap");
  const weekly = document.getElementById("weeklyTarget");
  const usage = document.getElementById("usage");
  const error = document.getElementById("error");
  const saved = document.getElementById("saved");

  let presets = [];
  let current = null;

  function host(url) {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  }

  /* The saved key is kept only for the same host (the server enforces this too). */
  function refreshKeyHint() {
    const same =
      current?.keySet && host(current.base_url) === host(baseUrl.value.trim());
    key.placeholder = same ? "Saved. Leave empty to keep it." : "";
    keyNote.textContent =
      preset.value === "anthropic" ? "Use a key made for one workspace." : "";
  }

  function showFields() {
    const none = preset.value === "none";
    fields.hidden = none;
    limit.hidden = none;
    refreshKeyHint();
  }

  preset.addEventListener("change", () => {
    const p = presets.find((x) => x.id === preset.value);
    if (p && current?.preset !== p.id) {
      baseUrl.value = p.base_url;
      model.value = p.model;
    } else if (p && current) {
      baseUrl.value = current.base_url;
      model.value = current.model;
    }
    key.value = "";
    showFields();
  });
  baseUrl.addEventListener("input", refreshKeyHint);

  function loadUsage() {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((u) => {
        usage.textContent =
          u.cap === null
            ? `This month: ${u.tokens} tokens`
            : `This month: ${u.tokens} of ${u.cap} tokens`;
      })
      .catch(() => {
        usage.textContent = "";
      });
  }

  function fill(view) {
    presets = view.presets;
    current = view.config;
    preset.replaceChildren();
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      preset.appendChild(opt);
    }
    const chosen = current ? current.preset : "none";
    preset.value = chosen;
    const p = presets.find((x) => x.id === chosen);
    baseUrl.value = current ? current.base_url : (p?.base_url ?? "");
    model.value = current ? current.model : (p?.model ?? "");
    cap.value = current ? current.cap : 1000000;
    weekly.value = view.weeklyTarget;
    key.value = "";
    showFields();
  }

  fetch("/api/config")
    .then((r) => r.json())
    .then(fill)
    .catch(() => {
      error.textContent =
        "The settings did not load. Check the tutor window is still open.";
    });
  loadUsage();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    error.textContent = "";
    saved.hidden = true;
    const body = {
      preset: preset.value,
      weeklyTarget: Number(weekly.value),
    };
    if (preset.value !== "none") {
      body.base_url = baseUrl.value;
      body.model = model.value;
      body.key = key.value;
      body.cap = Number(cap.value);
    }
    fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) {
          error.textContent = j.error || "The settings were not saved.";
          return;
        }
        fill(j);
        saved.hidden = false;
        loadUsage();
      })
      .catch(() => {
        error.textContent =
          "The settings were not saved. Check the tutor window is still open.";
      });
  });
})();
