import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { markAnswer } from "../marking/answer";
import { lcg, loadGenerators } from "./generators";
import type { Generated, Item } from "./types";

const SEEDS = Array.from({ length: 300 }, (_, i) => (0x5eed + i * 7919) >>> 0);

function asItem(q: Generated) {
  return {
    answers: q.answers,
    misconceptions: Object.entries(q.wrong ?? {}).map(([answer, message]) => ({
      answer,
      message,
    })),
  };
}

function hcf(a: number, b: number): number {
  return b === 0 ? a : hcf(b, a % b);
}

async function rolls(code: string): Promise<Generated[]> {
  const table = await loadGenerators("maths");
  const build = table[code];
  if (!build) throw new Error(`no generator ${code}`);
  return SEEDS.map((s) => build(lcg(s)));
}

test("every fraction answer a generator shows first is in its lowest terms, and a ratio to a fraction never pairs a part with itself", async () => {
  const table = await loadGenerators("maths");
  for (const code of Object.keys(table)) {
    for (const q of await rolls(code)) {
      if (q.type !== "fraction") continue;
      const [n, d] = (q.answers[0] ?? "").split("/").map(Number) as [
        number,
        number,
      ];
      expect(hcf(n, d), `${code}: ${q.stem} ${q.answers[0]}`).toBe(1);
      const ratio = /ratio (\d+) : (\d+)/.exec(q.stem);
      if (ratio) expect(ratio[1], q.stem).not.toBe(ratio[2]);
    }
  }
});

test("U176 ratio to fraction accepts the simplified and the unsimplified fraction", async () => {
  let checked = 0;
  for (const q of await rolls("U176")) {
    const ratio = /ratio (\d+) : (\d+), red to white/.exec(q.stem);
    if (!ratio) continue;
    const a = Number(ratio[1]);
    const whole = a + Number(ratio[2]);
    const g = hcf(a, whole);
    const item = asItem(q);
    expect(markAnswer(item, `${a / g}/${whole / g}`).ok, q.stem).toBe(true);
    expect(markAnswer(item, `${a}/${whole}`).ok, q.stem).toBe(true);
    checked += 1;
  }
  expect(checked).toBeGreaterThan(20);
});

const UNITS: [RegExp, string[]][] = [
  [/in terms of π, in cm²\./, ["cm²", "cm2", "cm^2"]],
  [/in terms of π, in cm³\./, ["cm³", "cm3", "cm^3"]],
  [/in cm²\./, ["cm²", "cm2", "cm^2"]],
  [/in cm³\./, ["cm³", "cm3", "cm^3"]],
  [/in cm\./, ["cm"]],
  [/in m²\./, ["m²", "m2", "m^2"]],
  [/in N\/m²\./, ["N/m²", "N/m2", "N/m^2"]],
  [/in N\./, ["N"]],
  [/in g\/cm³\./, ["g/cm³", "g/cm3", "g/cm^3"]],
  [/in m\/s²\./, ["m/s²", "m/s2", "m/s^2"]],
  [/in metres\./, ["m", "metres"]],
  [/, in g, /, ["g"]],
];

test("a generated answer typed with the unit the stem asks for is marked right", async () => {
  const table = await loadGenerators("maths");
  let checked = 0;
  for (const code of Object.keys(table)) {
    for (const q of await rolls(code)) {
      const hit = UNITS.find(([re]) => re.test(q.stem));
      if (!hit) continue;
      for (const unit of hit[1]) {
        const typed = `${q.answers[0]} ${unit}`;
        expect(markAnswer(asItem(q), typed).ok, `${code}: ${typed}`).toBe(true);
      }
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(1000);
});

test("a generated pi answer accepts the same written forms as the pi items", async () => {
  for (const code of ["U950", "U617", "U116"])
    for (const q of await rolls(code)) {
      const n = (q.answers[0] ?? "").replace(/pi$/, "");
      for (const typed of [`${n}*pi`, `${n}xpi`, `pi*${n}`, `${n} π`])
        expect(markAnswer(asItem(q), typed).ok, `${code}: ${typed}`).toBe(true);
    }
});

test("U687 accepts a simplified ratio written with 'to'", async () => {
  for (const q of await rolls("U687")) {
    const typed = (q.answers[0] ?? "").replace(":", " to ");
    expect(markAnswer(asItem(q), typed).ok, typed).toBe(true);
  }
});

test("U377 never asks for the line it gives, and accepts y = c + mx and either form without 'y ='", async () => {
  for (const q of await rolls("U377")) {
    if (q.type !== "text") continue;
    const given = /parallel to y = (-?\d+)x \+ 1 /.exec(q.stem);
    expect(given, q.stem).not.toBeNull();
    const m = Number(given?.[1]);
    const eq = /^y=(-?\d+)x\+(\d+)$/.exec(q.answers[0] ?? "");
    const c = Number(eq?.[2]);
    expect(c, q.stem).not.toBe(1);
    const flipped = `y = ${c}${m > 0 ? " + " : " - "}${Math.abs(m)}x`;
    expect(markAnswer(asItem(q), flipped).ok, flipped).toBe(true);
    for (const bare of [
      `${m}x + ${c}`,
      `${c}${m > 0 ? " + " : " - "}${Math.abs(m)}x`,
    ])
      expect(markAnswer(asItem(q), bare).ok, bare).toBe(true);
  }
});

test("U980 writes 'an S shape' and 'an upside down U', and accepts the shape with an article or a hyphen", async () => {
  const typed: Record<string, string[]> = {
    "S shape": ["an S shape", "S-shape", "an S-shape"],
    "U shape": ["a U shape", "U-shape", "a U-shape", "a parabola"],
    "upside down U": ["an upside down U", "an n shape", "n-shape"],
    "straight line": ["a straight line", "a line"],
  };
  let seen = 0;
  for (const q of await rolls("U980")) {
    expect(q.working).not.toMatch(/\ba (S|upside)\b/);
    const shape = Object.keys(typed).find((s) => q.working.endsWith(s));
    expect(shape, q.working).toBeDefined();
    for (const t of typed[shape ?? ""] ?? [])
      expect(markAnswer(asItem(q), t).ok, `${q.stem} ${t}`).toBe(true);
    seen += 1;
  }
  expect(seen).toBe(300);
});

async function items(subject: string, file: string): Promise<Item[]> {
  return Bun.file(path.join("content", subject, "items", file)).json();
}

test("items accept the equivalent forms their stems allow", async () => {
  const cases: [string, string, string, string[]][] = [
    ["maths", "1MA1-A12.json", "1MA1/A12#1", ["3+2x", "y=3+2x"]],
    ["maths", "1MA1-A12.json", "1MA1/A12#2", ["y=4-2x"]],
    ["maths", "1MA1-A12.json", "1MA1/A12#4", ["-4+3x", "y=-4+3x"]],
    ["maths", "1MA1-A9.json", "1MA1/A9#1", ["7+4x"]],
    ["maths", "1MA1-A9.json", "1MA1/A9#2", ["4+2x"]],
    ["maths", "1MA1-A9.json", "1MA1/A9#5", ["15+3n"]],
    ["maths", "1MA1-G16.json", "1MA1/G16#4", ["25π", "25*pi", "25pi cm²"]],
    ["maths", "1MA1-P8.json", "1MA1/P8#3", ["42/100"]],
    ["maths", "1MA1-R5.json", "1MA1/R5#3", ["750 g"]],
    ["maths", "1MA1-R10.json", "1MA1/R10#3", ["300 g", "300 grams"]],
    ["maths", "1MA1-G16.json", "1MA1/G16#1", ["30 cm^2"]],
    ["maths", "1MA1-G16.json", "1MA1/G16#2", ["84 cm^2"]],
    ["maths", "1MA1-G16.json", "1MA1/G16#3", ["42 cm^2"]],
    ["maths", "1MA1-R11-pressure.json", "1MA1/R11/pressure#1", ["200 N/m^2"]],
    ["maths", "1MA1-R11-pressure.json", "1MA1/R11/pressure#3", ["6 m^2"]],
    ["maths", "1MA1-R11-pressure.json", "1MA1/R11/pressure#4", ["8 g/cm^3"]],
    ["maths", "1MA1-A14.json", "1MA1/A14#2", ["80 metres"]],
    ["maths", "1MA1-A14.json", "1MA1/A14#5", ["20 metres"]],
    ["maths", "1MA1-G20-side.json", "1MA1/G20/side#5", ["6 metres"]],
    [
      "maths",
      "1MA1-R9-increase-decrease.json",
      "1MA1/R9/increase-decrease#2",
      ["69 kilograms"],
    ],
  ];
  for (const [subject, file, id, forms] of cases) {
    const item = (await items(subject, file)).find((i) => i.id === id);
    expect(item, id).toBeDefined();
    for (const f of forms)
      expect(markAnswer(item as Item, f).ok, `${id} ${f}`).toBe(true);
  }
});

test("the plant cell label item still wants 'cell membrane', and says so when B is just 'membrane'", async () => {
  const item = (await items("science", "8464-4.1.1.2.json")).find(
    (i) => i.id === "8464/4.1.1.2#4",
  ) as Item;
  for (const d of ["chloroplast", "chloroplasts"]) {
    const r = markAnswer(item, `cell wall, membrane, nucleus, ${d}`);
    expect(r.ok).toBe(false);
    expect(r.named ?? "").toMatch(/full name/);
    expect(r.named ?? "").not.toMatch(/cell membrane|wall|nucleus|chloro/i);
  }
  expect(
    markAnswer(item, "cell wall, cell membrane, nucleus, chloroplast").ok,
  ).toBe(true);
});

function pages(): string[] {
  const out: string[] = [];
  for (const subject of readdirSync("content"))
    for (const dir of ["lessons", "reference"]) {
      const at = path.join("content", subject, dir);
      try {
        for (const f of readdirSync(at))
          if (f.endsWith(".html")) out.push(path.join(at, f));
      } catch {
        // a subject may ship no reference sheets
      }
    }
  return out;
}

test("no lesson or reference sheet names a model provider", async () => {
  const files = pages();
  expect(files.length).toBeGreaterThan(40);
  for (const f of files)
    expect(await Bun.file(f).text(), f).not.toMatch(/Claude/);
});

test("every lesson and reference sheet breadcrumb goes to the map", async () => {
  for (const f of pages()) {
    const crumb = /<p class="crumb">(.*?)<\/p>/.exec(await Bun.file(f).text());
    expect(crumb?.[1] ?? "", f).toStartWith('<a href="/map.html">Map</a>');
  }
});

test("the content licences state the decided terms", async () => {
  for (const subject of ["maths", "science"]) {
    const text = await Bun.file(
      path.join("content", subject, "LICENCE.md"),
    ).text();
    expect(text, subject).not.toMatch(/Until the\s+repository licence/);
    expect(text, subject).toMatch(/MIT/);
    expect(text, subject).toMatch(/Open Government\s+Licence v3\.0/);
  }
});

test("no content text puts 'a' before a vowel sound such as S, n or upside", async () => {
  const files = [
    ...pages(),
    "content/maths/generators.js",
    ...readdirSync("content/maths/items").map((f) =>
      path.join("content/maths/items", f),
    ),
    ...readdirSync("content/science/items").map((f) =>
      path.join("content/science/items", f),
    ),
  ];
  for (const f of files)
    expect(await Bun.file(f).text(), f).not.toMatch(
      /\b[Aa] (S|n|upside)[ -]shape|\b[Aa] upside\b|\b[Aa] S\b/,
    );
});
