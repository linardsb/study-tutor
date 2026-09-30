/* The parent's settings page: provider, key, model, monthly token limit, weekly target, squad folder.
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
  const keyField = document.getElementById("key-field");
  const keyHint = document.getElementById("key-hint");
  const cap = document.getElementById("cap");
  const weekly = document.getElementById("weeklyTarget");
  const squadFolder = document.getElementById("squadFolder");
  const usage = document.getElementById("usage");
  const error = document.getElementById("error");
  const saved = document.getElementById("saved");

  let presets = [];
  let current = null;

  /* how to get each provider's key: [site, link, the path on the site]; plain text, nothing fetched */
  const KEY_FROM = {
    openai: [
      "platform.openai.com",
      "https://platform.openai.com/api-keys",
      "API keys › Create new secret key",
    ],
    anthropic: [
      "platform.claude.com",
      "https://platform.claude.com/settings/keys",
      "API keys › Create key",
    ],
    openrouter: [
      "openrouter.ai",
      "https://openrouter.ai/keys",
      "Keys › Create key",
    ],
    groq: [
      "console.groq.com",
      "https://console.groq.com/keys",
      "API keys › Create API key",
    ],
    mistral: [
      "console.mistral.ai",
      "https://console.mistral.ai/api-keys",
      "API keys › Create new key",
    ],
    deepseek: [
      "platform.deepseek.com",
      "https://platform.deepseek.com/api_keys",
      "API keys › Create new API key",
    ],
  };

  /* the line under the key field: where the key comes from, or that none is needed */
  function keyPath(id, needsKey) {
    const from = KEY_FROM[id];
    if (from) {
      const [site, href, path] = from;
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = site;
      return ["Get a key: ", a, ` › ${path}`];
    }
    if (needsKey === false && id !== "custom") return ["No key needed."];
    return ["Get a key from your provider's website."];
  }

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
    /* "Other" says needsKey false but many such services still want one, so its field stays */
    const p = presets.find((x) => x.id === preset.value);
    keyField.hidden = p?.needsKey === false && preset.value !== "custom";
    keyHint.replaceChildren(...keyPath(preset.value, p?.needsKey));
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
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((u) => {
        if (typeof u.tokens !== "number") throw new Error();
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
    cap.value = current ? current.cap : view.defaultCap;
    weekly.value = view.weeklyTarget;
    squadFolder.value = current?.squadFolder ?? "";
    key.value = "";
    showFields();
  }

  fetch("/api/config")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then(fill)
    .catch(() => {
      error.textContent =
        "The settings did not load. Check the tutor window is still open.";
    });
  loadUsage();
  /* the running version, for a parent checking which release is installed */
  fetch("/api/update")
    .then((r) => (r.ok ? r.json() : null))
    .then((u) => {
      if (u?.version)
        document.getElementById("version").textContent =
          `Study tutor version ${u.version}.`;
    })
    .catch(() => {});

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    error.textContent = "";
    saved.hidden = true;
    const body = {
      preset: preset.value,
      weeklyTarget: Number(weekly.value),
      squadFolder: squadFolder.value,
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
