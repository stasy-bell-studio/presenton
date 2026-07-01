/**
 * Pure, framework-free helpers for per-run ("rich text") editing of slide text
 * elements.
 *
 * A text element stores its content as an ordered list of runs, where each run
 * is a substring with its own font. This module owns the tricky bits: splitting
 * runs at character boundaries, applying a font change to only a selected
 * character range, and normalizing the result (merging adjacent runs that share
 * an identical font). Keeping this logic here — with no React/Konva imports —
 * makes it independently testable and reusable by both the renderer and editor.
 */

export type RichFont = {
  family: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  letterSpacing: number;
  wrap: string;
};

export type RichRun = {
  text: string;
  font: RichFont;
};

export function fontsEqual(a: RichFont, b: RichFont): boolean {
  return (
    a.family === b.family &&
    a.size === b.size &&
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.lineHeight === b.lineHeight &&
    a.letterSpacing === b.letterSpacing &&
    a.wrap === b.wrap
  );
}

/** Concatenated plain text across all runs. */
export function plainText(runs: RichRun[]): string {
  return runs.map((run) => run.text).join("");
}

/**
 * Merge neighbouring runs with identical fonts and drop empty runs. Always
 * returns at least one run (an empty run carrying the first/base font) so the
 * element never loses its styling anchor.
 */
export function normalizeRuns(runs: RichRun[], baseFont?: RichFont): RichRun[] {
  const result: RichRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const last = result[result.length - 1];
    if (last && fontsEqual(last.font, run.font)) {
      last.text += run.text;
    } else {
      result.push({ text: run.text, font: { ...run.font } });
    }
  }
  if (result.length === 0) {
    const anchor = baseFont ?? runs[0]?.font;
    if (anchor) return [{ text: "", font: { ...anchor } }];
  }
  return result;
}

/**
 * Return a copy of `runs` guaranteed to have a run boundary at `offset`
 * characters from the start (splitting a run in two if necessary).
 */
function splitAtOffset(runs: RichRun[], offset: number): RichRun[] {
  if (offset <= 0) return runs.map((run) => ({ ...run, font: { ...run.font } }));
  const result: RichRun[] = [];
  let consumed = 0;
  for (const run of runs) {
    const start = consumed;
    const end = consumed + run.text.length;
    if (offset > start && offset < end) {
      const cut = offset - start;
      result.push({ text: run.text.slice(0, cut), font: { ...run.font } });
      result.push({ text: run.text.slice(cut), font: { ...run.font } });
    } else {
      result.push({ text: run.text, font: { ...run.font } });
    }
    consumed = end;
  }
  return result;
}

/**
 * Apply a partial font change to the character range [start, end). Runs fully
 * outside the range are untouched; runs inside get `patch` merged onto their
 * font. Returns a normalized run list. When start === end (collapsed
 * selection) the runs are returned unchanged.
 */
export function applyFontToRange(
  runs: RichRun[],
  start: number,
  end: number,
  patch: Partial<RichFont>,
): RichRun[] {
  const total = runs.reduce((sum, run) => sum + run.text.length, 0);
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(total, Math.max(start, end));
  if (from >= to) return normalizeRuns(runs);

  const split = splitAtOffset(splitAtOffset(runs, from), to);
  let consumed = 0;
  const patched = split.map((run) => {
    const runStart = consumed;
    const runEnd = consumed + run.text.length;
    consumed = runEnd;
    if (runStart >= from && runEnd <= to && run.text.length > 0) {
      return { text: run.text, font: { ...run.font, ...patch } };
    }
    return run;
  });
  return normalizeRuns(patched);
}

/**
 * Replace the whole element's font (used when there is no active selection, so
 * the change applies to every run — matching the "style the entire element"
 * behaviour).
 */
export function applyFontToAll(
  runs: RichRun[],
  patch: Partial<RichFont>,
): RichRun[] {
  return normalizeRuns(
    runs.map((run) => ({ text: run.text, font: { ...run.font, ...patch } })),
  );
}

type CharFont = { ch: string; font: RichFont };

/** Expand runs into per-code-unit characters (aligned with textarea offsets). */
function charFonts(runs: RichRun[]): CharFont[] {
  const chars: CharFont[] = [];
  for (const run of runs) {
    for (let i = 0; i < run.text.length; i++) {
      chars.push({ ch: run.text[i], font: run.font });
    }
  }
  return chars;
}

function charsToRuns(chars: CharFont[], baseFont?: RichFont): RichRun[] {
  return normalizeRuns(
    chars.map((c) => ({ text: c.ch, font: c.font })),
    baseFont,
  );
}

/**
 * Reconcile a plain-text edit (from the textarea) back onto styled runs,
 * preserving the font of every character outside the edited region. Uses a
 * common-prefix/suffix diff, so single-caret typing, deletions, and pastes all
 * behave as one contiguous replacement. Inserted characters inherit the font of
 * the character immediately before the edit (or the following one at position
 * 0), which matches normal rich-text editor behaviour.
 */
export function spliceRuns(runs: RichRun[], newText: string): RichRun[] {
  const chars = charFonts(runs);
  const old = chars.map((c) => c.ch).join("");
  if (newText === old) return normalizeRuns(runs);

  let prefix = 0;
  const minLen = Math.min(old.length, newText.length);
  while (prefix < minLen && old[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    old[old.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removeStart = prefix;
  const removeEnd = old.length - suffix;
  const inserted = newText.slice(prefix, newText.length - suffix);

  const inheritFont =
    (removeStart > 0 ? chars[removeStart - 1]?.font : undefined) ??
    chars[removeEnd]?.font ??
    runs[0]?.font;

  const next: CharFont[] = [
    ...chars.slice(0, removeStart),
    ...Array.from({ length: inserted.length }, (_, i) => ({
      ch: inserted[i],
      font: inheritFont as RichFont,
    })),
    ...chars.slice(removeEnd),
  ];
  return charsToRuns(next, runs[0]?.font);
}
