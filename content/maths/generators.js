/* Fresh-number question generators, one per lesson code.
   Runs in the browser (window.GEN) and under node (globalThis.GEN) with no build step.

   Contract. Each generator takes rng, a function returning a float in [0, 1), and returns:
     stem     the question, as a sentence
     answers  every accepted form, ASCII only, first one is the canonical answer
     working  the method applied, ending "= <answer>" with at most a unit after it
     hint     one sentence, the first step and nothing further
     wrong    { typedAnswer: message } for the named misconceptions
     type     number | pi | ratio | fraction | text   (number when left out)

   Two rules the test in .claude/tools/test-generators.js enforces:
     every number in the stem appears again in the working
     the working's last "=" is followed by the answer
*/
(function () {
  "use strict";

  var root = typeof window === "undefined" ? globalThis : window;

  function int(rng, lo, hi) {
    return lo + Math.floor(rng() * (hi - lo + 1));
  }
  function pick(rng, list) {
    return list[Math.floor(rng() * list.length)];
  }
  function money(n) {
    return "£" + (n % 1 === 0 ? n : n.toFixed(2));
  }
  function hcf(a, b) {
    while (b) {
      var t = b;
      b = a % b;
      a = t;
    }
    return a;
  }
  function tidy(n) {
    return Math.round(n * 1000) / 1000;
  }
  /* the same answers again with each unit the stem names typed after them; a squared or cubed
     unit also in its ^2 / ^3 spelling, which the marker keeps as typed */
  function withUnit(list, units) {
    var out = list.slice();
    units.forEach(function (u) {
      var caret = u.replace(/²/g, "^2").replace(/³/g, "^3");
      list.forEach(function (a) {
        out.push(a + u);
        if (caret !== u) out.push(a + caret);
      });
    });
    return out;
  }
  /* the ways of writing n lots of pi that the pi items accept */
  function piForms(n) {
    return [n + "pi", n + "π", n + "*pi", n + "xpi", "pi*" + n];
  }

  var GEN = {};

  /* U349 percentage of an amount. Amounts are multiples of 10, percentages built from 10, 5 and 1. */
  GEN.U349 = function (rng) {
    var pct = pick(rng, [15, 20, 25, 30, 35, 40, 60, 65, 70, 12, 45, 55]);
    var amount = pick(rng, [40, 60, 80, 120, 150, 200, 240, 300, 350, 400]);
    var ten = amount / 10;
    var ans = tidy((amount * pct) / 100);
    var tens = Math.floor(pct / 10);
    var rest = pct - tens * 10;
    var parts = [];
    if (tens)
      parts.push(
        tens + "0% = " + tens + " × " + tidy(ten) + " = " + tidy(tens * ten),
      );
    if (rest === 5) parts.push("5% = half of that = " + tidy(ten / 2));
    else if (rest)
      parts.push(
        rest +
          "% = " +
          rest +
          " × " +
          tidy(ten / 10) +
          " = " +
          tidy((rest * ten) / 10),
      );
    var sum = tens ? tidy(tens * ten) : 0;
    var extra = tidy(ans - sum);
    return {
      stem: "Find " + pct + "% of " + amount + ".",
      answers: [String(ans), ans.toFixed(1)],
      working:
        "10% of " +
        amount +
        " = " +
        tidy(ten) +
        ". " +
        parts.join(". ") +
        (parts.length > 1 ? ". Add them: " + tidy(sum) + " + " + extra : "") +
        ". So " +
        pct +
        "% of " +
        amount +
        " = " +
        ans,
      hint:
        "10% of " +
        amount +
        " is " +
        tidy(ten) +
        ". Build " +
        pct +
        "% out of that.",
      wrong: (function () {
        var w = {};
        w[String(tidy(ten))] =
          "That is 10% of " +
          amount +
          ". There is more of the percentage still to find.";
        w[String(tidy(amount / pct))] =
          "You divided by the percentage. Per cent means out of 100, so find 10% first.";
        w[String(amount + pct)] =
          "You added " +
          pct +
          " on. The question wants a part of " +
          amount +
          ".";
        return w;
      })(),
    };
  };

  /* U687 simplifying ratio. */
  GEN.U687 = function (rng) {
    if (rng() < 0.35) {
      var m = pick(rng, [2, 3, 4, 5]);
      var cm = pick(rng, [20, 25, 40, 50, 75]);
      var big = m * 100;
      var h = hcf(big, cm);
      return {
        stem: "Simplify the ratio " + m + " m : " + cm + " cm.",
        answers: [big / h + ":" + cm / h, big / h + " to " + cm / h],
        type: "ratio",
        working:
          m +
          " m is " +
          big +
          " cm, so the ratio is " +
          big +
          " : " +
          cm +
          ". The highest common factor of " +
          big +
          " and " +
          cm +
          " is " +
          h +
          ". " +
          big +
          " ÷ " +
          h +
          " = " +
          big / h +
          " and " +
          cm +
          " ÷ " +
          h +
          " = " +
          cm / h +
          ". So the answer = " +
          big / h +
          ":" +
          cm / h,
        hint:
          "Make both sides the same unit first. " + m + " m is " + big + " cm.",
        wrong: (function () {
          var w = {};
          w[m + ":" + cm] =
            "You simplified before matching the units. Turn the metres into centimetres first.";
          w[big + ":" + cm] = "The units match now. It still divides down.";
          return w;
        })(),
      };
    }
    var k = pick(rng, [3, 4, 6, 7, 8, 9, 12]);
    var a = k * pick(rng, [2, 3, 4, 5]);
    var b = k * pick(rng, [3, 5, 7, 9]);
    var g = hcf(a, b);
    return {
      stem: "Simplify the ratio " + a + " : " + b + ".",
      answers: [a / g + ":" + b / g, a / g + " to " + b / g],
      type: "ratio",
      working:
        "The highest common factor of " +
        a +
        " and " +
        b +
        " is " +
        g +
        ". " +
        a +
        " ÷ " +
        g +
        " = " +
        a / g +
        " and " +
        b +
        " ÷ " +
        g +
        " = " +
        b / g +
        ". So the answer = " +
        a / g +
        ":" +
        b / g,
      hint:
        "What is the biggest number that divides into both " +
        a +
        " and " +
        b +
        "?",
      wrong: (function () {
        var w = {};
        w[a + ":" + b] =
          "That is the ratio you were given. It still divides down.";
        w[b / g + ":" + a / g] =
          "The right numbers, the wrong way round. Keep the order of the question.";
        return w;
      })(),
    };
  };

  /* U753 using equivalent ratios. */
  GEN.U753 = function (rng) {
    var a = pick(rng, [2, 3, 4, 5, 7]);
    var b = pick(rng, [3, 5, 6, 8, 9]);
    var k = pick(rng, [3, 4, 5, 6, 8, 10]);
    var known = a * k;
    var want = b * k;
    return {
      stem:
        "Squash is mixed in the ratio " +
        a +
        " : " +
        b +
        ", squash to water. " +
        "You use " +
        known +
        " ml of squash. How much water do you need, in ml?",
      answers: [String(want), want + "ml"],
      working:
        a +
        " becomes " +
        known +
        ", so the multiplier is " +
        known +
        " ÷ " +
        a +
        " = " +
        k +
        ". Do the same to the other part: " +
        b +
        " × " +
        k +
        " = " +
        want,
      hint: "What do you multiply " + a + " by to get " + known + "?",
      wrong: (function () {
        var w = {};
        w[String(known + (b - a))] =
          "You added the difference on. Ratios scale by multiplying, not by adding.";
        w[String(a * b)] =
          "You multiplied the two parts of the ratio together. Find the multiplier first.";
        w[String(known)] =
          "That is the squash. The question asks for the water.";
        return w;
      })(),
    };
  };

  /* U558 probability trees. Answers stay as fractions. */
  GEN.U558 = function (rng) {
    var red = int(rng, 2, 5);
    var blue = int(rng, 2, 5);
    var total = red + blue;
    var replace = rng() < 0.5;
    if (replace) {
      var num = red * red,
        den = total * total;
      var g = hcf(num, den);
      return {
        stem:
          "A bag holds " +
          red +
          " red counters and " +
          blue +
          " blue counters. One is taken, its colour written down, " +
          "then put back. A second is taken. What is the probability that both are red? Give a fraction.",
        answers: [num / g + "/" + den / g, num + "/" + den],
        type: "fraction",
        working:
          "There are " +
          red +
          " red and " +
          blue +
          " blue, so " +
          total +
          " counters and P(red) = " +
          red +
          "/" +
          total +
          ". The counter goes back, so the second branch is the same. Multiply along the branches: " +
          red +
          "/" +
          total +
          " × " +
          red +
          "/" +
          total +
          (g > 1 ? " = " + num + "/" + den : "") +
          " = " +
          num / g +
          "/" +
          den / g,
        hint:
          "There are " +
          total +
          " counters in all, so the chance of red is " +
          red +
          "/" +
          total +
          ".",
        wrong: (function () {
          var w = {};
          w[2 * red + "/" + 2 * total] =
            "You added along the branches. Along a path you multiply.";
          w[red + "/" + total] = "That is one draw. There are two.";
          return w;
        })(),
      };
    }
    var n2 = red * (red - 1),
      d2 = total * (total - 1);
    var g2 = hcf(n2, d2) || 1;
    return {
      stem:
        "A bag holds " +
        red +
        " red counters and " +
        blue +
        " blue counters. Two are taken, without putting the first back. " +
        "What is the probability that both are red? Give a fraction.",
      answers: [n2 / g2 + "/" + d2 / g2, n2 + "/" + d2],
      type: "fraction",
      working:
        "First draw: " +
        red +
        " red out of " +
        total +
        ", so " +
        red +
        "/" +
        total +
        ". One red is gone, so the second draw is " +
        (red - 1) +
        "/" +
        (total - 1) +
        " (the " +
        blue +
        " blue have not changed). Multiply along the path: " +
        red +
        "/" +
        total +
        " × " +
        (red - 1) +
        "/" +
        (total - 1) +
        (g2 > 1 ? " = " + n2 + "/" + d2 : "") +
        " = " +
        n2 / g2 +
        "/" +
        d2 / g2,
      hint:
        "After one red is taken there are " +
        (red - 1) +
        " red left out of " +
        (total - 1) +
        ".",
      wrong: (function () {
        var w = {};
        w[red * red + "/" + total * total] =
          "You kept the first counter in the bag. It is not put back, so both numbers drop by 1.";
        w[red + "/" + total] = "That is the first draw only. There are two.";
        return w;
      })(),
    };
  };

  /* U993 area of shapes. */
  GEN.U993 = function (rng) {
    var kind = pick(rng, ["triangle", "trapezium", "compound"]);
    if (kind === "triangle") {
      var b = pick(rng, [6, 8, 10, 12, 14, 16]);
      var h = pick(rng, [5, 7, 9, 11, 15]);
      return {
        stem:
          "A triangle has a base of " +
          b +
          " cm and a perpendicular height of " +
          h +
          " cm. Find its area in cm².",
        answers: withUnit([String((b * h) / 2)], ["cm²"]),
        working:
          "Area of a triangle is ½ × base × height. ½ × " +
          b +
          " × " +
          h +
          " = " +
          (b * h) / 2,
        hint: "Multiply " + b + " by " + h + " first, then halve it.",
        wrong: (function () {
          var w = {};
          w[String(b * h)] =
            "That is the rectangle around it. A triangle is half of that.";
          w[String(b + h)] = "You added the two lengths. Area multiplies them.";
          return w;
        })(),
      };
    }
    if (kind === "trapezium") {
      var a = pick(rng, [6, 8, 10, 12]);
      var c = pick(rng, [14, 16, 18, 20]);
      var hh = pick(rng, [4, 6, 8, 10]);
      return {
        stem:
          "A trapezium has parallel sides of " +
          a +
          " cm and " +
          c +
          " cm, and a height of " +
          hh +
          " cm. Find its area in cm².",
        answers: withUnit([String(((a + c) * hh) / 2)], ["cm²"]),
        working:
          "Area of a trapezium is ½ × (a + b) × h. " +
          a +
          " + " +
          c +
          " = " +
          (a + c) +
          ". ½ × " +
          (a + c) +
          " × " +
          hh +
          " = " +
          ((a + c) * hh) / 2,
        hint: "Add the two parallel sides first: " + a + " + " + c + ".",
        wrong: (function () {
          var w = {};
          w[String((a + c) * hh)] = "You left out the half.";
          w[String(a * c)] =
            "You multiplied the parallel sides. They get added, then halved, then times the height.";
          return w;
        })(),
      };
    }
    var L = pick(rng, [10, 12, 14, 16, 20]);
    var W = pick(rng, [6, 8, 10, 12]);
    var l2 = pick(rng, [3, 4, 5, 6]);
    var w2 = pick(rng, [2, 3, 4, 5]);
    return {
      stem:
        "A rectangle " +
        L +
        " cm by " +
        W +
        " cm has a rectangle " +
        l2 +
        " cm by " +
        w2 +
        " cm cut out of one corner. " +
        "Find the area of the shape that is left, in cm².",
      answers: withUnit([String(L * W - l2 * w2)], ["cm²"]),
      working:
        "Big rectangle: " +
        L +
        " × " +
        W +
        " = " +
        L * W +
        ". The piece cut out: " +
        l2 +
        " × " +
        w2 +
        " = " +
        l2 * w2 +
        ". Take it away: " +
        L * W +
        " − " +
        l2 * w2 +
        " = " +
        (L * W - l2 * w2),
      hint: "Find the whole rectangle first: " + L + " × " + W + ".",
      wrong: (function () {
        var w = {};
        w[String(L * W)] =
          "That is the whole rectangle. The corner is still to come off.";
        w[String(L * W + l2 * w2)] =
          "You added the cut-out piece instead of taking it away.";
        return w;
      })(),
    };
  };

  /* U980 identifying graphs. The answer is the shape, in words. */
  GEN.U980 = function (rng) {
    var shapes = [
      {
        eq: function (a, b) {
          return "y = " + a + "x + " + b;
        },
        ans: ["straight line", "a straight line", "line", "a line", "linear"],
        why: "the highest power of x is 1",
        shape: "a straight line",
      },
      {
        eq: function (a, b) {
          return "y = " + a + "x² + " + b;
        },
        ans: [
          "u shape",
          "a u shape",
          "u-shape",
          "a u-shape",
          "parabola",
          "a parabola",
          "quadratic",
        ],
        why: "the highest power of x is 2",
        shape: "a U shape",
      },
      {
        eq: function (a, b) {
          return "y = −" + a + "x² + " + b;
        },
        ans: [
          "upside down u",
          "an upside down u",
          "upside-down u",
          "an upside-down u",
          "n shape",
          "an n shape",
          "n-shape",
          "an n-shape",
        ],
        why: "the highest power of x is 2 and it is negative",
        shape: "an upside down U",
      },
      {
        eq: function (a, b) {
          return "y = " + a + "x³ + " + b;
        },
        ans: ["s shape", "an s shape", "s-shape", "an s-shape", "cubic"],
        why: "the highest power of x is 3",
        shape: "an S shape",
      },
    ];
    var s = pick(rng, shapes);
    var a = int(rng, 2, 6),
      b = int(rng, 1, 9);
    return {
      stem: "What shape is the graph of " + s.eq(a, b) + "? Answer in words.",
      answers: s.ans,
      type: "text",
      working:
        "In " +
        s.eq(a, b) +
        ", ignore the " +
        a +
        " and the " +
        b +
        " and look at the power of x. Here " +
        s.why +
        ". That gives " +
        s.shape,
      hint: "Look at the highest power of x, not at the numbers in front.",
      wrong: (function () {
        var w = {};
        w["straight line"] =
          "A straight line needs x on its own, with no power above it.";
        return w;
      })(),
    };
  };

  /* U527 pressure, force, area. */
  GEN.U527 = function (rng) {
    var area = pick(rng, [2, 4, 5, 8, 10, 20]);
    var press = pick(rng, [3, 5, 6, 10, 12, 15]);
    var force = area * press;
    var ask = pick(rng, ["p", "f", "a"]);
    if (ask === "p") {
      return {
        stem:
          "A force of " +
          force +
          " N presses on an area of " +
          area +
          " m². Find the pressure in N/m².",
        answers: withUnit([String(press)], ["N/m²"]),
        working:
          "Cover P on the triangle and force sits above area, so divide. Pressure = force ÷ area = " +
          force +
          " ÷ " +
          area +
          " = " +
          press,
        hint: "Pressure = force ÷ area.",
        wrong: (function () {
          var w = {};
          w[String(force * area)] =
            "You multiplied. Force sits above area on the triangle, so it is a divide.";
          w[String(area / force)] =
            "You divided the wrong way round. Force goes on top.";
          return w;
        })(),
      };
    }
    if (ask === "f") {
      return {
        stem:
          "A pressure of " +
          press +
          " N/m² acts on an area of " +
          area +
          " m². Find the force in N.",
        answers: withUnit([String(force)], ["N"]),
        working:
          "Cover F on the triangle and P and A sit side by side, so multiply. Force = pressure × area = " +
          press +
          " × " +
          area +
          " = " +
          force,
        hint: "F is on top of the triangle, so the other two multiply.",
        wrong: (function () {
          var w = {};
          w[String(tidy(press / area))] =
            "You divided. P and A sit side by side, so they multiply.";
          w[String(press + area)] =
            "You added them. The triangle says multiply.";
          return w;
        })(),
      };
    }
    return {
      stem:
        "A force of " +
        force +
        " N gives a pressure of " +
        press +
        " N/m². Find the area in m².",
      answers: withUnit([String(area)], ["m²"]),
      working:
        "Cover A on the triangle and force sits above pressure, so divide. Area = force ÷ pressure = " +
        force +
        " ÷ " +
        press +
        " = " +
        area,
      hint: "Area = force ÷ pressure.",
      wrong: (function () {
        var w = {};
        w[String(force * press)] =
          "You multiplied. F is on top, so this one is a divide.";
        return w;
      })(),
    };
  };

  /* U910 density, mass, volume. */
  GEN.U910 = function (rng) {
    var dens = pick(rng, [2, 3, 4, 5, 8, 10]);
    var vol = pick(rng, [5, 10, 20, 25, 40, 50]);
    var mass = dens * vol;
    var ask = pick(rng, ["d", "m", "v"]);
    if (ask === "d") {
      return {
        stem:
          "A block has a mass of " +
          mass +
          " g and a volume of " +
          vol +
          " cm³. Find its density in g/cm³.",
        answers: withUnit([String(dens)], ["g/cm³"]),
        working:
          "Cover D and mass sits above volume, so divide. Density = mass ÷ volume = " +
          mass +
          " ÷ " +
          vol +
          " = " +
          dens,
        hint: "The unit g/cm³ tells you: grams divided by cm³.",
        wrong: (function () {
          var w = {};
          w[String(mass * vol)] =
            "You multiplied. M sits on top of the triangle, so it is a divide.";
          w[String(tidy(vol / mass))] = "Upside down. Mass goes on top.";
          return w;
        })(),
      };
    }
    if (ask === "m") {
      return {
        stem:
          "A liquid has a density of " +
          dens +
          " g/cm³. Find the mass, in g, of " +
          vol +
          " cm³ of it.",
        answers: withUnit([String(mass)], ["g"]),
        working:
          "Cover M and D and V sit side by side, so multiply. Mass = density × volume = " +
          dens +
          " × " +
          vol +
          " = " +
          mass,
        hint: "M is on top of the triangle, so the other two multiply.",
        wrong: (function () {
          var w = {};
          w[String(tidy(vol / dens))] =
            "You divided. D and V sit side by side, so they multiply.";
          return w;
        })(),
      };
    }
    return {
      stem:
        "A metal has a density of " +
        dens +
        " g/cm³. A piece of it has a mass of " +
        mass +
        " g. Find its volume in cm³.",
      answers: withUnit([String(vol)], ["cm³"]),
      working:
        "Cover V and mass sits above density, so divide. Volume = mass ÷ density = " +
        mass +
        " ÷ " +
        dens +
        " = " +
        vol,
      hint: "Volume = mass ÷ density.",
      wrong: (function () {
        var w = {};
        w[String(mass * dens)] =
          "You multiplied. M is on top, so this one is a divide.";
        return w;
      })(),
    };
  };

  /* U377 equations of parallel lines. */
  GEN.U377 = function (rng) {
    var m = pick(rng, [2, 3, 4, 5, -2, -3]);
    var c = int(rng, 1, 9);
    if (rng() < 0.5) {
      return {
        stem:
          "A line has equation y = " +
          m +
          "x + " +
          c +
          ". What is the gradient of any line parallel to it?",
        answers: [String(m)],
        working:
          "In y = " +
          m +
          "x + " +
          c +
          " the number in front of x is the gradient, so it is " +
          m +
          ". Parallel lines keep the same gradient = " +
          m,
        hint: "The gradient is the number in front of x, minus sign included.",
        wrong: (function () {
          var w = {};
          w[String(c)] =
            "That is c, where the line crosses the y-axis. The gradient is the number in front of x.";
          return w;
        })(),
      };
    }
    /* c = 1 would make the answer the given line itself; only those seeds roll again */
    if (c === 1) c = int(rng, 2, 9);
    var x0 = int(rng, 1, 5);
    var y0 = m * x0 + c;
    return {
      stem:
        "Write the equation of the line parallel to y = " +
        m +
        "x + 1 that passes through (" +
        x0 +
        ", " +
        y0 +
        ").",
      answers: [
        "y=" + m + "x+" + c,
        "y=" + m + "x + " + c,
        "y=" + c + (m > 0 ? "+" : "") + m + "x",
        m + "x+" + c,
        c + (m > 0 ? "+" : "") + m + "x",
      ],
      type: "text",
      working:
        "Parallel means the same gradient, so it starts y = " +
        m +
        "x + c. The 1 is only the old line's c. " +
        "Put in x = " +
        x0 +
        " and y = " +
        y0 +
        ": " +
        y0 +
        " = " +
        m +
        " × " +
        x0 +
        " + c, so c = " +
        c +
        ". The equation is y=" +
        m +
        "x+" +
        c,
      hint: "Keep the gradient, then put the point into y = mx + c to find c.",
      wrong: (function () {
        var w = {};
        w["y=" + m + "x+1"] =
          "That is the line you were given. It has to pass through the point, so c changes.";
        return w;
      })(),
    };
  };

  /* U296 Venn diagrams. */
  GEN.U296 = function (rng) {
    var both = int(rng, 2, 8);
    var onlyA = int(rng, 3, 12);
    var onlyB = int(rng, 3, 12);
    var outside = int(rng, 1, 8);
    var setA = onlyA + both,
      setB = onlyB + both;
    var total = onlyA + onlyB + both + outside;
    var ask = pick(rng, ["onlyA", "outside", "either"]);
    if (ask === "onlyA") {
      return {
        stem:
          "In a class of " +
          total +
          " students, " +
          setA +
          " play football, " +
          setB +
          " play tennis and " +
          both +
          " play both. How many play football only?",
        answers: [String(onlyA)],
        working:
          "Put the " +
          both +
          " who do both in the overlap first. Football only = " +
          setA +
          " − " +
          both +
          " = " +
          onlyA +
          ". (Tennis only would be " +
          setB +
          " − " +
          both +
          ", and " +
          total +
          " covers the whole class.) Football only = " +
          onlyA,
        hint:
          "The " +
          setA +
          " who play football already includes the " +
          both +
          " who play both.",
        wrong: (function () {
          var w = {};
          w[String(setA)] =
            "That is everyone who plays football, the " +
            both +
            " who play both included.";
          return w;
        })(),
      };
    }
    if (ask === "outside") {
      return {
        stem:
          "In a class of " +
          total +
          " students, " +
          setA +
          " play football, " +
          setB +
          " play tennis and " +
          both +
          " play both. How many play neither?",
        answers: [String(outside)],
        working:
          "Inside the circles: football only " +
          setA +
          " − " +
          both +
          " = " +
          onlyA +
          ", tennis only " +
          setB +
          " − " +
          both +
          " = " +
          onlyB +
          ", both " +
          both +
          ". That is " +
          (onlyA + onlyB + both) +
          ". Neither = " +
          total +
          " − " +
          (onlyA + onlyB + both) +
          " = " +
          outside,
        hint: "Fill the three regions inside the circles first, then take them off the class total.",
        wrong: (function () {
          var w = {};
          w[String(total - setA - setB)] =
            "You took both totals off, so the " +
            both +
            " who do both came off twice.";
          return w;
        })(),
      };
    }
    return {
      stem:
        "In a class of " +
        total +
        " students, " +
        setA +
        " play football, " +
        setB +
        " play tennis and " +
        both +
        " play both. How many play at least one of the two?",
      answers: [String(onlyA + onlyB + both)],
      working:
        "Football only = " +
        setA +
        " − " +
        both +
        " = " +
        onlyA +
        ". Tennis only = " +
        setB +
        " − " +
        both +
        " = " +
        onlyB +
        ". Add the three regions inside the circles, with " +
        total +
        " as the class: " +
        onlyA +
        " + " +
        onlyB +
        " + " +
        both +
        " = " +
        (onlyA + onlyB + both),
      hint: "Count each student once. The overlap must not be counted twice.",
      wrong: (function () {
        var w = {};
        w[String(setA + setB)] =
          "The " + both + " who play both got counted twice.";
        return w;
      })(),
    };
  };

  /* U176 ratios, fractions and percentages. */
  GEN.U176 = function (rng) {
    var mode = pick(rng, ["dec2pct", "pct2frac", "ratio2frac"]);
    if (mode === "dec2pct") {
      var d = pick(rng, [0.35, 0.4, 0.06, 0.125, 0.8, 0.45, 0.02, 0.72]);
      var p = tidy(d * 100);
      return {
        stem: "Write " + d + " as a percentage.",
        answers: [String(p), p + "%"],
        working:
          "Decimal to percentage: multiply by 100, so every digit moves two places left. " +
          d +
          " × 100 = " +
          p,
        hint: "Multiply by 100. The digits move two places left.",
        wrong: (function () {
          var w = {};
          w[String(tidy(d / 100))] =
            "You went the wrong way. Percentage to decimal divides by 100; this one multiplies.";
          w[String(d)] = "That is still the decimal.";
          return w;
        })(),
      };
    }
    if (mode === "pct2frac") {
      var pc = pick(rng, [20, 25, 35, 40, 45, 60, 75, 80, 15]);
      var g = hcf(pc, 100);
      return {
        stem: "Write " + pc + "% as a fraction in its simplest form.",
        answers: [pc / g + "/" + 100 / g],
        type: "fraction",
        working:
          "Per cent means out of 100, so " +
          pc +
          "% is " +
          pc +
          "/100. The highest common factor of " +
          pc +
          " and 100 is " +
          g +
          ". Divide top and bottom by it = " +
          pc / g +
          "/" +
          100 / g,
        hint: "Write it over 100 first, then simplify.",
        wrong: (function () {
          var w = {};
          w[pc + "/100"] = "Right start. It still simplifies.";
          return w;
        })(),
      };
    }
    var a = pick(rng, [2, 3, 4, 5]);
    /* never 3 : 3 or 5 : 5, one pick either way so the seeds stay aligned */
    var b = pick(
      rng,
      [3, 5, 6, 7].filter(function (x) {
        return x !== a;
      }),
    );
    var gr = hcf(a, a + b);
    return {
      stem:
        "Paint is mixed in the ratio " +
        a +
        " : " +
        b +
        ", red to white. What fraction of the mix is red?",
      answers: [a / gr + "/" + (a + b) / gr, a + "/" + (a + b)],
      type: "fraction",
      working:
        "Add the parts for the bottom of the fraction: " +
        a +
        " + " +
        b +
        " = " +
        (a + b) +
        ". Red is " +
        a +
        " of those parts = " +
        a +
        "/" +
        (a + b) +
        (gr > 1 ? " = " + a / gr + "/" + (a + b) / gr : ""),
      hint: "Add the two parts of the ratio to find how many parts there are in all.",
      wrong: (function () {
        var w = {};
        w[a + "/" + b] =
          "That compares red with white. A fraction compares red with the whole mix.";
        return w;
      })(),
    };
  };

  /* U562 velocity-time graphs. */
  GEN.U562 = function (rng) {
    var v = pick(rng, [8, 10, 12, 15, 16, 20, 24]);
    var t1 = pick(rng, [2, 4, 5, 8]);
    if (rng() < 0.5) {
      return {
        stem:
          "On a velocity-time graph a car speeds up from rest to " +
          v +
          " m/s in " +
          t1 +
          " seconds. Find its acceleration in m/s².",
        answers: withUnit([String(tidy(v / t1))], ["m/s²"]),
        working:
          "Acceleration is the gradient of the line: change in velocity ÷ time taken. " +
          v +
          " ÷ " +
          t1 +
          " = " +
          tidy(v / t1),
        hint: "Acceleration = change in velocity ÷ time taken.",
        wrong: (function () {
          var w = {};
          w[String(v * t1)] =
            "That is the area shape, not the slope. Acceleration divides.";
          w[String(tidy((v * t1) / 2))] =
            "That is the distance travelled, the area under the line.";
          return w;
        })(),
      };
    }
    var t2 = pick(rng, [6, 10, 12, 20]);
    return {
      stem:
        "A velocity-time graph rises from rest to " +
        v +
        " m/s over the first " +
        t1 +
        " seconds, then stays flat at " +
        v +
        " m/s for a further " +
        t2 +
        " seconds. Find the total distance in metres.",
      answers: withUnit([String((v * t1) / 2 + v * t2)], ["m", "metres"]),
      working:
        "Distance is the area under the graph. Triangle: ½ × " +
        t1 +
        " × " +
        v +
        " = " +
        (v * t1) / 2 +
        ". Rectangle: " +
        t2 +
        " × " +
        v +
        " = " +
        v * t2 +
        ". Add them: " +
        (v * t1) / 2 +
        " + " +
        v * t2 +
        " = " +
        ((v * t1) / 2 + v * t2),
      hint: "Split the area into a triangle and a rectangle.",
      wrong: (function () {
        var w = {};
        w[String(v * t1 + v * t2)] =
          "You treated the sloping part as a rectangle. It is a triangle, so halve it.";
        w[String(v * t2)] =
          "That is the flat part only. The sloping part covers distance too.";
        return w;
      })(),
    };
  };

  /* U554 percentage increase and decrease. */
  GEN.U554 = function (rng) {
    var amount = pick(rng, [40, 60, 80, 120, 150, 200, 240, 300]);
    var pct = pick(rng, [5, 10, 15, 20, 25, 30, 40]);
    var up = rng() < 0.5;
    var part = tidy((amount * pct) / 100);
    var ans = up ? amount + part : amount - part;
    return {
      stem: up
        ? "A season ticket costs " +
          money(amount) +
          ". The price goes up by " +
          pct +
          "%. Find the new price in pounds."
        : "A coat costs " +
          money(amount) +
          ". In a sale it is reduced by " +
          pct +
          "%. Find the sale price in pounds.",
      answers: [String(ans), "£" + ans],
      working:
        "10% of " +
        amount +
        " = " +
        tidy(amount / 10) +
        ", so " +
        pct +
        "% of " +
        amount +
        " = " +
        part +
        ". " +
        (up
          ? "Increase, so add it on: " + amount + " + " + part
          : "Decrease, so take it off: " + amount + " − " + part) +
        " = " +
        ans,
      hint:
        "Find " +
        pct +
        "% of " +
        amount +
        " first, then " +
        (up ? "add it on" : "take it off") +
        ".",
      wrong: (function () {
        var w = {};
        w[String(part)] =
          "That is the " +
          pct +
          "% on its own. The question wants the " +
          (up ? "new price" : "sale price") +
          ".";
        w[String(up ? amount - part : amount + part)] =
          "You went the wrong way. This one is " +
          (up ? "an increase" : "a decrease") +
          ".";
        return w;
      })(),
    };
  };

  /* U332 repeated percentage change. */
  GEN.U332 = function (rng) {
    var start = pick(rng, [200, 400, 500, 800, 1000, 2000]);
    var rate = pick(rng, [5, 10, 20]);
    var years = pick(rng, [2, 3]);
    var compound = rng() < 0.6;
    if (compound) {
      var lines = [],
        run = start;
      for (var i = 1; i <= years; i += 1) {
        var add = tidy((run * rate) / 100);
        run = tidy(run + add);
        lines.push(
          "Year " +
            i +
            ": " +
            rate +
            "% of " +
            tidy(run - add) +
            " = " +
            add +
            ", total " +
            run,
        );
      }
      return {
        stem:
          money(start) +
          " is put in an account paying " +
          rate +
          "% compound interest a year. " +
          "What is it worth after " +
          years +
          " years, in pounds?",
        answers: [String(run), "£" + run],
        working:
          lines.join(". ") +
          ". Each year the interest is worked out on the new total = " +
          run,
        hint:
          "Work out year 1 first, then do year 2 on the new total, not on " +
          start +
          ".",
        wrong: (function () {
          var w = {};
          var simple = tidy(start + ((start * rate) / 100) * years);
          w[String(simple)] =
            "That is simple interest. Compound works each year on the bigger total.";
          w[String(tidy(start + (start * rate) / 100))] =
            "That is one year only.";
          return w;
        })(),
      };
    }
    var per = tidy((start * rate) / 100);
    var tot = tidy(start + per * years);
    return {
      stem:
        money(start) +
        " earns " +
        rate +
        "% simple interest a year for " +
        years +
        " years. " +
        "What is the account worth at the end, in pounds?",
      answers: [String(tot), "£" + tot],
      working:
        "Simple interest is the same every year. " +
        rate +
        "% of " +
        start +
        " = " +
        per +
        ". Over " +
        years +
        " years that is " +
        years +
        " × " +
        per +
        " = " +
        tidy(per * years) +
        ". Add it to the start: " +
        start +
        " + " +
        tidy(per * years) +
        " = " +
        tot,
      hint: "Find one year of interest, then multiply by " + years + ".",
      wrong: (function () {
        var w = {};
        w[String(tidy(per * years))] =
          "That is the interest only. The question asks what the account is worth.";
        return w;
      })(),
    };
  };

  /* U721 direct proportion. */
  GEN.U721 = function (rng) {
    var n = pick(rng, [3, 4, 5, 6, 8]);
    var unitCost = pick(rng, [2, 3, 5, 6, 10, 15]);
    var cost = n * unitCost;
    var want = pick(rng, [7, 9, 10, 12, 15]);
    return {
      stem:
        n +
        " notebooks cost " +
        money(cost) +
        ". At the same rate, what do " +
        want +
        " notebooks cost, in pounds?",
      answers: [String(want * unitCost), "£" + want * unitCost],
      working:
        "Find one first: " +
        cost +
        " ÷ " +
        n +
        " = " +
        unitCost +
        " each. Then " +
        want +
        " of them: " +
        want +
        " × " +
        unitCost +
        " = " +
        want * unitCost,
      hint: "Work out the cost of one notebook first.",
      wrong: (function () {
        var w = {};
        w[String(cost + (want - n) * 1)] =
          "You added on rather than scaling. Find the cost of one first.";
        w[String(cost * want)] =
          "You multiplied the whole price by " +
          want +
          ". That is " +
          want +
          " lots of " +
          n +
          " notebooks.";
        return w;
      })(),
    };
  };

  /* U950 area of a circle, pi left in. */
  GEN.U950 = function (rng) {
    var r = int(rng, 2, 12);
    if (rng() < 0.4) {
      var d = 2 * r;
      return {
        stem:
          "A circle has a diameter of " +
          d +
          " cm. Find its area in terms of π, in cm².",
        answers: withUnit(piForms(r * r), ["cm²"]),
        type: "pi",
        working:
          "Halve the diameter for the radius: " +
          d +
          " ÷ 2 = " +
          r +
          ". Area = πr², so " +
          r +
          " × " +
          r +
          " = " +
          r * r +
          ". Area = " +
          r * r +
          "π",
        hint: "The formula needs the radius, so halve " + d + " first.",
        wrong: (function () {
          var w = {};
          w[d * d + "pi"] =
            "You squared the diameter. Halve it for the radius first.";
          w[2 * r + "pi"] =
            "That is the circumference formula, 2πr. Area squares the radius.";
          return w;
        })(),
      };
    }
    return {
      stem:
        "A circle has a radius of " +
        r +
        " cm. Find its area in terms of π, in cm².",
      answers: withUnit(piForms(r * r), ["cm²"]),
      type: "pi",
      working:
        "Area = πr². Square the radius: " +
        r +
        " × " +
        r +
        " = " +
        r * r +
        ". Then multiply by π. Area = " +
        r * r +
        "π",
      hint: "Square the radius first, then put the π on.",
      wrong: (function () {
        var w = {};
        w[2 * r + "pi"] =
          "That is 2πr, the circumference. Area squares the radius.";
        return w;
      })(),
    };
  };

  /* U617 volume of a sphere. The radius is a multiple of 3 so the 4/3 divides cleanly. */
  GEN.U617 = function (rng) {
    var r = pick(rng, [3, 6, 9]);
    var v = (4 * r * r * r) / 3;
    if (rng() < 0.35) {
      var half = v / 2;
      return {
        stem:
          "A hemisphere has a radius of " +
          r +
          " cm. Find its volume in terms of π, in cm³.",
        answers: withUnit(piForms(half), ["cm³"]),
        type: "pi",
        working:
          "Full sphere: V = 4/3 πr³. " +
          r +
          " × " +
          r +
          " × " +
          r +
          " = " +
          r * r * r +
          ". " +
          r * r * r +
          " ÷ 3 = " +
          (r * r * r) / 3 +
          ", × 4 = " +
          v +
          ", so the sphere is " +
          v +
          "π. A hemisphere is half of it: " +
          v +
          " ÷ 2 = " +
          half +
          ". Volume = " +
          half +
          "π",
        hint: "Find the whole sphere first, then halve it.",
        wrong: (function () {
          var w = {};
          w[v + "pi"] = "That is the whole sphere. A hemisphere is half.";
          return w;
        })(),
      };
    }
    var d = 2 * r;
    var useD = rng() < 0.4;
    return {
      stem: useD
        ? "A ball has a diameter of " +
          d +
          " cm. Find its volume in terms of π, in cm³."
        : "A ball has a radius of " +
          r +
          " cm. Find its volume in terms of π, in cm³.",
      answers: withUnit(piForms(v), ["cm³"]),
      type: "pi",
      working:
        (useD
          ? "Halve the diameter for the radius: " + d + " ÷ 2 = " + r + ". "
          : "") +
        "V = 4/3 πr³. Cube the radius: " +
        r +
        " × " +
        r +
        " × " +
        r +
        " = " +
        r * r * r +
        ". Divide by 3: " +
        (r * r * r) / 3 +
        ". Multiply by 4: " +
        v +
        ". Volume = " +
        v +
        "π",
      hint: "Cube the radius first, then divide by 3 and multiply by 4.",
      wrong: (function () {
        var w = {};
        w[r * r * r + "pi"] =
          "You stopped after cubing. The 4/3 still has to go on.";
        w[r * r + "pi"] =
          "That is the area of a circle. A sphere cubes the radius.";
        return w;
      })(),
    };
  };

  /* U116 volume of a cone. The height is a multiple of 3 so the divide by 3 stays clean. */
  GEN.U116 = function (rng) {
    var r = int(rng, 2, 8);
    var h = pick(rng, [3, 6, 9, 12, 15]);
    var v = (r * r * h) / 3;
    return {
      stem:
        "A cone has a base radius of " +
        r +
        " cm and a perpendicular height of " +
        h +
        " cm. Find its volume in terms of π, in cm³.",
      answers: withUnit(piForms(v), ["cm³"]),
      type: "pi",
      working:
        "V = πr²h ÷ 3. Square the radius: " +
        r +
        " × " +
        r +
        " = " +
        r * r +
        ". Times the height: " +
        r * r +
        " × " +
        h +
        " = " +
        r * r * h +
        ". Divide by 3: " +
        r * r * h +
        " ÷ 3 = " +
        v +
        ". Volume = " +
        v +
        "π",
      hint: "Square the radius, multiply by the height, then divide by 3.",
      wrong: (function () {
        var w = {};
        w[r * r * h + "pi"] =
          "You left out the divide by 3. A cone is a third of the cylinder round it.";
        w[r * r + "pi"] =
          "That is the base circle. The height still has to go in.";
        return w;
      })(),
    };
  };

  /* U871 surface area of a square-based pyramid. */
  GEN.U871 = function (rng) {
    var b = pick(rng, [4, 6, 8, 10, 12]);
    var s = pick(rng, [5, 7, 9, 11, 13, 15]);
    var tri = 4 * ((b * s) / 2);
    var total = b * b + tri;
    if (rng() < 0.3) {
      return {
        stem:
          "A square-based pyramid has a base of side " +
          b +
          " cm and a slant height of " +
          s +
          " cm. It is open at the bottom. Find the area of the four sloping faces in cm².",
        answers: withUnit([String(tri)], ["cm²"]),
        working:
          "One triangle: ½ × " +
          b +
          " × " +
          s +
          " = " +
          (b * s) / 2 +
          ". There are four of them: 4 × " +
          (b * s) / 2 +
          " = " +
          tri +
          ". Open at the bottom, so no base = " +
          tri,
        hint: "Find one triangle first, then multiply by 4.",
        wrong: (function () {
          var w = {};
          w[String(total)] =
            "You added the base. This pyramid is open at the bottom.";
          w[String((b * s) / 2)] = "That is one face. There are four.";
          return w;
        })(),
      };
    }
    return {
      stem:
        "A square-based pyramid has a base of side " +
        b +
        " cm and a slant height of " +
        s +
        " cm. Find its total surface area in cm².",
      answers: withUnit([String(total)], ["cm²"]),
      working:
        "Base: " +
        b +
        " × " +
        b +
        " = " +
        b * b +
        ". One triangle: ½ × " +
        b +
        " × " +
        s +
        " = " +
        (b * s) / 2 +
        ". Four triangles: " +
        tri +
        ". Add: " +
        b * b +
        " + " +
        tri +
        " = " +
        total,
      hint: "Square base plus four triangles. Do the base first.",
      wrong: (function () {
        var w = {};
        w[String(tri)] =
          "You left the base out. The question asks for the total.";
        w[String(b * b + (b * s) / 2)] =
          "You counted one triangle. There are four.";
        return w;
      })(),
    };
  };

  /* U283 trigonometry, find a side. Paper 1 angles only, and only the ratios that give a half or a whole. */
  GEN.U283 = function (rng) {
    var cases = [
      {
        ratio: "sin",
        angle: 30,
        have: "hypotenuse",
        want: "opposite",
        word: "SOH",
        val: 0.5,
      },
      {
        ratio: "cos",
        angle: 60,
        have: "hypotenuse",
        want: "adjacent",
        word: "CAH",
        val: 0.5,
      },
      {
        ratio: "tan",
        angle: 45,
        have: "adjacent",
        want: "opposite",
        word: "TOA",
        val: 1,
      },
    ];
    var c = pick(rng, cases);
    var given = pick(rng, [4, 6, 8, 10, 12, 14, 16, 20]);
    var ans = tidy(given * c.val);
    return {
      stem:
        "A right-angled triangle has an angle of " +
        c.angle +
        "°. The " +
        c.have +
        " is " +
        given +
        " cm. Find the " +
        c.want +
        " in cm.",
      answers: withUnit([String(ans)], ["cm"]),
      working:
        c.word +
        ": " +
        c.ratio +
        " " +
        c.angle +
        "° = " +
        c.want.charAt(0).toUpperCase() +
        " ÷ " +
        c.have.charAt(0).toUpperCase() +
        ". From the table " +
        c.ratio +
        " " +
        c.angle +
        "° = " +
        c.val +
        ". The unknown is on top, so multiply: " +
        given +
        " × " +
        c.val +
        " = " +
        ans,
      hint:
        "Label the sides from the " +
        c.angle +
        "° angle, then pick " +
        c.word +
        ".",
      wrong: (function () {
        var w = {};
        w[String(tidy(given / c.val))] =
          "You divided. The unknown is on top of the fraction, so this one multiplies.";
        w[String(given)] = "That is the side you were given.";
        return w;
      })(),
    };
  };

  /* U545 trigonometry, find an angle. The two sides always give a table value. */
  GEN.U545 = function (rng) {
    var cases = [
      {
        ratio: "sin",
        angle: 30,
        top: "opposite",
        bot: "hypotenuse",
        word: "SOH",
        k: 2,
      },
      {
        ratio: "cos",
        angle: 60,
        top: "adjacent",
        bot: "hypotenuse",
        word: "CAH",
        k: 2,
      },
      {
        ratio: "tan",
        angle: 45,
        top: "opposite",
        bot: "adjacent",
        word: "TOA",
        k: 1,
      },
    ];
    var c = pick(rng, cases);
    var small = pick(rng, [3, 4, 5, 6, 7, 9]);
    var big = small * c.k;
    return {
      stem:
        "In a right-angled triangle the " +
        c.top +
        " is " +
        small +
        " cm and the " +
        c.bot +
        " is " +
        big +
        " cm. Find the marked angle in degrees.",
      answers: [String(c.angle), c.angle + "°"],
      working:
        c.word +
        ": " +
        c.ratio +
        " of the angle = " +
        c.top.charAt(0).toUpperCase() +
        " ÷ " +
        c.bot.charAt(0).toUpperCase() +
        " = " +
        small +
        "/" +
        big +
        " = " +
        (c.k === 1 ? "1" : "1/2") +
        ". Read that off the table: the angle = " +
        c.angle,
      hint:
        "Write the fraction " +
        small +
        " over " +
        big +
        " and simplify it, then look it up.",
      wrong: (function () {
        var w = {};
        w[String(90 - c.angle)] =
          "That is the other angle in the triangle. Label the sides from the angle you want.";
        w[String(tidy(small / big))] =
          "That is the value of the ratio. The question wants the angle it belongs to.";
        return w;
      })(),
    };
  };

  /* Fresh numbers sometimes make a misconception's value land on the right answer (a cone of
     radius 7 and height 3 has volume 49pi, and 49pi is also the "you forgot the divide by 3"
     value). Dropping the clash keeps the page from handing the answer over in a feedback line. */
  function normKey(v) {
    var t = String(v)
      .toLowerCase()
      .replace(/[£\s,]/g, "")
      .replace(/π/g, "pi");
    return /^-?\d+(\.\d+)?$/.test(t) ? String(Number(t)) : t;
  }

  Object.keys(GEN).forEach(function (code) {
    var build = GEN[code];
    GEN[code] = function (rng) {
      var q = build(rng);
      var right = (q.answers || []).map(normKey);
      var kept = {};
      Object.keys(q.wrong || {}).forEach(function (k) {
        if (right.indexOf(normKey(k)) === -1) kept[k] = q.wrong[k];
      });
      q.wrong = kept;
      return q;
    };
  });

  root.GEN = GEN;
})();
