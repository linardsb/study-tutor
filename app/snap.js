/* The snap page: the phone's camera link and the PC's drop-a-file fallback. It reads the snap by its
   token, downscales the photo on a canvas, posts it, then polls until it is marked. Every model string
   goes in with textContent; only the figure, which is content-pack SVG, goes in as HTML (as chat.js does).
   Loaded under Bun by src/marking/snap-dom.test.ts, so nothing here touches document at load time
   when there is none. */
(() => {
  const TEXT = {
    unmarked: "Your photo is stored. It is not marked yet.",
    notRecorded:
      "It did not go into your record. Take a new photo from the map.",
    notSaved: "The photo was not saved. Take a new photo from the map.",
    marking: "Marking your working. This can take a minute.",
    closed: "This link has closed. Look at the map on the computer.",
    heic: "This page cannot read that type of photo. Take the photo with the camera button, or use a JPEG or PNG.",
    network:
      "The photo may not have been sent. Check your Wi-Fi and try again.",
    notLoaded: "The page did not load. Check your Wi-Fi and try again.",
    expired: "This link has expired. Open a new one from the map.",
    total: (marks, of) =>
      `${marks} of ${of}. Marks left on the table: ${of - marks}.`,
    clean: "Clean sheet.",
    notNeeded: "not needed",
  };
  const LABELS = {
    method: "Method",
    accuracy: "Accuracy",
    answer: "Answer",
    units: "Units",
    sense: "Sense",
  };
  // expected: Anthropic resizes above 1568 px on the long side, and refuses an image over 5 MB.
  const LONG_SIDE = 1568;
  const MAX_BYTES = 5 * 1024 * 1024;
  const SENDABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
  const POLL_MS = 2000;
  const TOKEN = /^[\w-]{43}$/;
  /* expected: 15 failed polls in a row (about 30 s) means the snap closed. On the phone a closed snap's
     listener is stopped, so the poll fails to connect rather than getting a 403. A reply that is not OK
     (a 409, a 500) counts as a failed poll too; only an OK reply resets the count. */
  const MAX_FAILED_POLLS = 15;

  /* A data URL of the photo, at most LONG_SIDE px on the long side, as JPEG 0.85. A file the browser
     cannot decode (HEIC in Chrome) is sent as it is when the server can read it, and refused otherwise. */
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
        // readAsDataURL: the result is a string
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(TEXT.heic));
        reader.readAsDataURL(file);
      };
      img.src = url;
    });
  }

  /* the seams a test uses: it replaces the canvas step (happy-dom has no canvas) and the wait between
     polls, and calls upload (set by start) in place of the file picker */
  const api = {
    encode,
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };

  /* what the pupil reads for a finished snap, one paragraph each */
  function resultLines(result) {
    if (result === null) return [TEXT.notSaved];
    const out = [];
    if (!result.marked) out.push(TEXT.unmarked);
    else {
      for (const l of result.lines) {
        const label = LABELS[l.kind];
        if (l.mark === null) out.push(`${label}: ${TEXT.notNeeded}`);
        else {
          const note = l.note ? `. ${l.note}` : "";
          out.push(`${label}: ${l.mark === 1 ? "1 mark" : "0 marks"}${note}`);
        }
      }
      out.push(TEXT.total(result.marks, result.of));
      if (result.clean) out.push(TEXT.clean);
    }
    if (!result.recorded) out.push(TEXT.notRecorded);
    return out;
  }

  function start() {
    const $ = (id) => document.getElementById(id);
    // A token is 32 random bytes as base64url (src/snap.ts). Any other value is not sent: the server
    // refuses the empty token with the expired sentence.
    const given = new URLSearchParams(location.search).get("token") || "";
    const token = TOKEN.test(given) ? given : "";
    const q = `/api/snap?token=${encodeURIComponent(token)}`;
    const form = $("snap-form");
    const status = $("status");
    const send = $("send");
    let sending = false;

    function render(result) {
      $("result").replaceChildren(
        ...resultLines(result).map((line) => {
          const p = document.createElement("p");
          p.textContent = line;
          return p;
        }),
      );
      status.textContent = "";
    }

    async function poll() {
      status.textContent = TEXT.marking;
      let failed = 0;
      for (;;) {
        await api.wait(POLL_MS);
        let res;
        let body;
        try {
          res = await fetch(q);
          body = await res.json();
        } catch {
          res = null;
        }
        if (res?.status === 403) {
          status.textContent = TEXT.closed;
          return;
        }
        if (res?.ok) {
          if (body.state === "done") {
            render(body.result);
            return;
          }
          failed = 0;
          continue;
        }
        // a failed poll is tried again on the next tick, up to the bound
        failed += 1;
        if (failed >= MAX_FAILED_POLLS) {
          status.textContent = TEXT.closed;
          return;
        }
      }
    }

    /* True when the snap already holds a photo: the form hides and the result shows, now or by polling. */
    async function taken() {
      try {
        const res = await fetch(q);
        const body = await res.json();
        if (!res.ok || body.state === "open") return false;
        form.hidden = true;
        if (body.state === "done") render(body.result);
        else poll();
        return true;
      } catch {
        return false;
      }
    }

    async function upload(file) {
      if (!file || sending) return;
      sending = true;
      send.disabled = true;
      status.textContent = "";
      try {
        let image;
        try {
          image = await api.encode(file);
        } catch (err) {
          status.textContent = err.message;
          return;
        }
        let res;
        let body;
        try {
          res = await fetch("/api/snap/photo", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, image }),
          });
          body = await res.json();
        } catch {
          status.textContent = TEXT.network;
          return;
        }
        if (res.status === 202) {
          form.hidden = true;
          poll();
          return;
        }
        // A 403 after a lost 202 (saved, but the reply never arrived): the snap says so, not "expired".
        if (res.status === 403 && (await taken())) return;
        status.textContent = body.error || TEXT.network;
        if (res.status === 403) form.hidden = true;
      } finally {
        sending = false;
        send.disabled = false;
      }
    }

    api.upload = upload;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      upload($("photo").files[0]);
    });
    const drop = $("drop");
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      upload(e.dataTransfer?.files[0]);
    });

    return fetch(q)
      .then((res) =>
        res.json().then((body) => {
          if (!res.ok) {
            $("stem").textContent = "";
            status.textContent = body.error || TEXT.expired;
            return;
          }
          $("title").textContent = body.title;
          $("stem").textContent = body.stem;
          if (body.figure) {
            // Parsed as HTML, as chat.js does: the figures carry no xmlns.
            const doc = new DOMParser().parseFromString(
              body.figure,
              "text/html",
            );
            $("figure").replaceChildren(...doc.body.childNodes);
            $("figure").hidden = false;
          }
          $("no-model").hidden = body.model;
          if (body.state === "open") form.hidden = false;
          else if (body.state === "done") render(body.result);
          else poll();
        }),
      )
      .catch(() => {
        $("stem").textContent = "";
        status.textContent = TEXT.notLoaded;
      });
  }

  if (typeof document !== "undefined" && document.getElementById("snap-form"))
    api.ready = start();

  const root = typeof window === "undefined" ? globalThis : window;
  root.snap = Object.assign(api, {
    TEXT,
    LABELS,
    MAX_FAILED_POLLS,
    resultLines,
  });
})();
