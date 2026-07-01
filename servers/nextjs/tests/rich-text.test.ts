import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFontToRange,
  applyFontToAll,
  normalizeRuns,
  plainText,
  fontsEqual,
  spliceRuns,
  type RichFont,
  type RichRun,
} from "../app/(presentation-generator)/components/richText.ts";

const base: RichFont = {
  family: "Arial",
  size: 18,
  color: "#111827",
  bold: false,
  italic: false,
  underline: false,
  lineHeight: 1.15,
  letterSpacing: 0,
  wrap: "word",
};

function run(text: string, patch: Partial<RichFont> = {}): RichRun {
  return { text, font: { ...base, ...patch } };
}

test("bold only the selected middle range splits runs", () => {
  const out = applyFontToRange([run("Global Warming")], 7, 14, { bold: true });
  assert.equal(plainText(out), "Global Warming");
  assert.equal(out.length, 2);
  assert.equal(out[0].text, "Global ");
  assert.equal(out[0].font.bold, false);
  assert.equal(out[1].text, "Warming");
  assert.equal(out[1].font.bold, true);
});

test("styling a range inside a run yields 3 runs", () => {
  const out = applyFontToRange([run("abcdef")], 2, 4, { color: "#FF0000" });
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.text), ["ab", "cd", "ef"]);
  assert.equal(out[1].font.color, "#FF0000");
});

test("adjacent runs with equal font merge", () => {
  const out = normalizeRuns([run("a", { bold: true }), run("b", { bold: true })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "ab");
});

test("re-applying same style across boundary re-merges", () => {
  let out = applyFontToRange([run("abcdef")], 2, 4, { bold: true });
  out = applyFontToRange(out, 0, 6, { bold: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].font.bold, true);
});

test("collapsed selection is a no-op (normalized)", () => {
  const out = applyFontToRange([run("hello")], 3, 3, { bold: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].font.bold, false);
});

test("applyFontToAll changes every run", () => {
  const out = applyFontToAll([run("a", { bold: true }), run("b")], { color: "#00F" });
  assert.ok(out.every((r) => r.font.color === "#00F"));
});

test("range clamped to bounds", () => {
  const out = applyFontToRange([run("hi")], -5, 999, { italic: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].font.italic, true);
  assert.equal(out[0].text, "hi");
});

test("fontsEqual sanity", () => {
  assert.ok(fontsEqual(base, { ...base }));
  assert.ok(!fontsEqual(base, { ...base, bold: true }));
});

test("spliceRuns preserves styling of untouched characters when typing", () => {
  // "Global " (plain) + "Warming" (bold)
  const runs = [run("Global "), run("Warming", { bold: true })];
  // user types "X" right after "Global " (position 7), before the bold run
  const out = spliceRuns(runs, "Global X" + "Warming");
  assert.equal(plainText(out), "Global XWarming");
  // the bold run must remain bold
  const bolded = out.filter((r) => r.font.bold).map((r) => r.text).join("");
  assert.equal(bolded, "Warming");
});

test("spliceRuns keeps bold when editing inside the bold run", () => {
  const runs = [run("Global "), run("Warming", { bold: true })];
  // delete the trailing "g" of Warming
  const out = spliceRuns(runs, "Global Warmin");
  assert.equal(plainText(out), "Global Warmin");
  assert.equal(out.find((r) => r.text.includes("Warmin"))?.font.bold, true);
});

test("spliceRuns inserted char inherits preceding run font", () => {
  const runs = [run("AB", { bold: true }), run("CD")];
  // insert "X" between B and C (position 2) -> should inherit bold (preceding)
  const out = spliceRuns(runs, "ABXCD");
  assert.equal(plainText(out), "ABXCD");
  const first = out[0];
  assert.equal(first.text, "ABX");
  assert.equal(first.font.bold, true);
});

test("spliceRuns full replace collapses to single base run", () => {
  const runs = [run("old", { bold: true })];
  const out = spliceRuns(runs, "brand new");
  assert.equal(plainText(out), "brand new");
});

test("spliceRuns no-op returns normalized runs", () => {
  const runs = [run("a", { bold: true }), run("b", { bold: true })];
  const out = spliceRuns(runs, "ab");
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "ab");
});
