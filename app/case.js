/* Today's detective case. The server picked it (GET /api/case); this page shows it, takes a pick and
   a 1 to 3 bet, marks in the browser and posts one case event through POST /api/event.
   Invariant: the correct option and the working enter the DOM only after the pupil has answered:
   inside the check handler, or in renderDone for a day whose answer is already on record. The same
   way quiz.js hides an item's answer until the check.
   Runs in the browser. Loaded under Bun by src/marking/case.test.ts, so nothing here touches
   document at load time. */
(() => {
  const NOT_SAVED = " Not saved. Check the tutor window is still open.";
  const BETS = [
    ["1", "1 (a guess)"],
    ["2", "2"],
    ["3", "3 (would bet on it)"],
  ];

  /* the line under a checked case: what the pupil predicted against what the bets scored */
  function calibrationLine(cal) {
    if (cal.n === 0) return "";
    if (cal.n === 1)
      return `First case. You predicted ${cal.predicted}, you scored ${cal.scored}.`;
    return `Over your last ${cal.n} cases you predicted ${cal.predicted}, you scored ${cal.scored}.`;
  }

  /* the calibration after one more answer, for the line shown now; the server recomputes on the next load */
  function bump(cal, bet, correct) {
    return {
      predicted: cal.predicted + bet,
      scored: cal.scored + (correct ? bet : 0),
      n: cal.n + 1,
    };
  }

  /* the line under the title: which of the two puzzles today is */
  const AIMS = {
    mistake:
      "Kai has answered a question. Find the mistake, or say there is none. Three minutes.",
    rule: "Three questions, three answers. Find the rule behind them. Three minutes.",
  };

  /* a re-ask is owed when the day's only answer on record was a confident miss: after a reload the
     page shows it again instead of the done state alone (PR #31 F9) */
  function reaskOwed(record) {
    const first = record.bets[0];
    return (
      record.bets.length === 1 &&
      first !== undefined &&
      first[0] === 3 &&
      first[1] === false
    );
  }

  /* the working paragraph, or null on a rule case, where the working is the rule the feedback names */
  function workingOf(c) {
    return c.working === c.options[c.correct] ? null : el("p", "", c.working);
  }

  /* the case@1 body the page posts; t is stamped by the server */
  function eventFor(day, c, pick, bet, correct, reask) {
    return {
      v: 1,
      type: "case",
      day,
      kind: c.kind,
      topic: c.topic,
      ...(c.item ? { item: c.item } : {}),
      pick,
      bet,
      correct,
      reask,
    };
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

  /* what follows the save: the re-ask, "Back tomorrow.", or neither when nothing is on record */
  function afterSave(saved, isReask, bet, correct, hasReask) {
    if (!saved) return "unsaved";
    if (!isReask && bet === 3 && !correct && hasReask) return "reask";
    return "done";
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* the part of a case that is safe to show before the check: stem, figure, scaffold, Kai's answer
     or the three instances, and the question */
  function question(c) {
    const parts = [el("p", "stem", c.stem)];
    if (c.figure) {
      /* pack content, the same bytes the lesson held inline */
      const figure = el("div", "figure");
      figure.innerHTML = c.figure;
      parts.push(figure);
    }
    if (c.scaffold) {
      const faded = el("div", "working faded");
      faded.appendChild(el("p", "", c.scaffold));
      parts.push(faded);
    }
    if (c.kind === "mistake") {
      const p = el("p", "kai", "Kai's answer: ");
      p.appendChild(el("b", "", c.shown));
      parts.push(p);
    } else {
      const list = el("ol", "instances");
      for (const inst of c.instances) {
        const li = el("li", "", `${inst.stem} `);
        li.appendChild(el("b", "", `Answer: ${inst.answer}`));
        list.appendChild(li);
      }
      parts.push(list);
    }
    parts.push(el("p", "ask", c.question));
    return parts;
  }

  function radios(className, name, rows) {
    const box = el("div", className);
    for (const [value, text] of rows) {
      const label = el("label");
      const input = el("input");
      input.type = "radio";
      input.name = name;
      input.value = value;
      label.append(input, ` ${text}`);
      box.appendChild(label);
    }
    return box;
  }

  function checked(q, name) {
    const r = q.querySelector(`input[name="${name}"]:checked`);
    return r ? Number(r.value) : null;
  }

  /* the done state: today's case was answered on an earlier load, so no inputs, the note and the working.
     `owed` says a re-ask renders under it, so the closing note waits for that one. */
  function renderDone(holder, r, owed) {
    const c = r.case;
    if (!c) {
      holder.appendChild(el("p", "note", "Done for today."));
      return;
    }
    const first = r.record.bets[0];
    const right = first ? first[1] : false;
    const q = el("div", `q done ${right ? "right" : "wrong"}`);
    for (const part of question(c)) q.appendChild(part);
    q.appendChild(
      el(
        "p",
        "feedback",
        `${right ? "You had it." : "Not this time."} ${c.options[c.correct]}`,
      ),
    );
    const working = workingOf(c);
    if (working) {
      const work = el("div", "working");
      work.appendChild(working);
      q.appendChild(work);
    }
    q.appendChild(el("p", "calibration", calibrationLine(r.calibration)));
    holder.appendChild(q);
    if (!owed) holder.appendChild(el("p", "note", "Back tomorrow."));
  }

  /* one case, or the re-ask under a heading. `state.cal` is shared so the second line counts the first answer. */
  function render(holder, c, r, state, isReask) {
    const q = el("div", "q");
    if (isReask) q.appendChild(el("h2", "", "Same idea, new numbers."));
    for (const part of question(c)) q.appendChild(part);
    const pickName = isReask ? "pick2" : "pick";
    const betName = isReask ? "bet2" : "bet";
    q.appendChild(
      radios(
        "options",
        pickName,
        c.options.map((o, i) => [String(i), o]),
      ),
    );
    const bet = radios("confidence", betName, BETS);
    bet.prepend(el("span", "", "How sure are you? "));
    const btn = el("button", "check", "Check");
    btn.type = "button";
    const fb = el("p", "feedback");
    fb.hidden = true;
    const work = el("div", "working");
    work.hidden = true;
    const cal = el("p", "calibration");
    cal.hidden = true;
    const row = el("div", "case-controls");
    row.append(bet, btn);
    q.append(row, fb, work, cal);
    holder.appendChild(q);

    btn.addEventListener("click", () => {
      if (q.classList.contains("done")) return;
      const pick = checked(q, pickName);
      const bet = checked(q, betName);
      fb.hidden = false;
      if (pick === null) {
        fb.textContent = "Pick one first.";
        return;
      }
      if (bet === null) {
        fb.textContent = "How sure? 1, 2 or 3 first.";
        return;
      }
      const correct = pick === c.correct;
      q.classList.add("done", correct ? "right" : "wrong");
      /* the answer and the working enter the page here and nowhere earlier */
      fb.textContent = correct
        ? `Right. You bet ${bet}.`
        : `Not this time. You bet ${bet}. ${c.options[c.correct]}`;
      const working = workingOf(c);
      if (working) {
        work.hidden = false;
        work.appendChild(working);
      }
      for (const input of q.querySelectorAll("input")) input.disabled = true;
      btn.disabled = true;
      state.cal = bump(state.cal, bet, correct);
      cal.hidden = false;
      cal.textContent = calibrationLine(state.cal);
      /* a confident miss: the same idea again now, once the first answer is on record, so the log
         never holds a re-ask before its first answer (PR #31 F5); the server seeds tomorrow from the event */
      postEvent(eventFor(r.day, c, c.options[pick], bet, correct, isReask))
        .then((saved) => {
          const next = afterSave(
            saved,
            isReask,
            bet,
            correct,
            Boolean(r.reask),
          );
          /* a failed save leaves nothing on record, so no "Back tomorrow.": a reload shows the case again */
          if (next === "unsaved") fb.textContent += NOT_SAVED;
          else if (next === "reask") render(holder, r.reask, r, state, true);
          else holder.appendChild(el("p", "note", "Back tomorrow."));
        })
        .catch(() => {
          /* postEvent never rejects; this is the re-ask render throwing after the save. A reload
             shows the record and the re-ask it still owes (reaskOwed). */
          holder.appendChild(
            el("p", "note", "Something went wrong. Reload the page."),
          );
        });
    });
  }

  function load(holder) {
    /* only a well-formed ?day= reaches the route; anything else asks for today */
    const day = new URLSearchParams(location.search).get("day");
    const url =
      day && /^\d{4}-\d{2}-\d{2}$/.test(day)
        ? `/api/case?day=${day}`
        : "/api/case";
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((r) => {
        const aim = document.querySelector(".aim");
        if (aim && r.case) aim.textContent = AIMS[r.case.kind];
        if (r.record) {
          const owed = Boolean(r.reask) && reaskOwed(r.record);
          renderDone(holder, r, owed);
          if (owed) render(holder, r.reask, r, { cal: r.calibration }, true);
          return;
        }
        if (!r.case) {
          holder.appendChild(el("p", "note", "No case today."));
          return;
        }
        render(holder, r.case, r, { cal: r.calibration }, false);
      })
      .catch(() => {
        holder.appendChild(
          el(
            "p",
            "note",
            "The case did not load. Check the tutor window is still open.",
          ),
        );
      });
  }

  if (typeof document !== "undefined") {
    const holder = document.getElementById("case");
    if (holder) load(holder);
  }

  const root = typeof window === "undefined" ? globalThis : window;
  root.detective = { calibrationLine, eventFor, bump, reaskOwed, afterSave };
})();
