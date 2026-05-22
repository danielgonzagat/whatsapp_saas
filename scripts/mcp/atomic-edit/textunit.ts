/**
 * Text-unit module — the byte ↔ UTF-16 ↔ codepoint ↔ grapheme layer.
 *
 * Why this exists (the silent failure it kills): a JS string is UTF-16, so
 * naive index-by-index diffing splits an astral character (emoji = 2 UTF-16
 * code units / 1 codepoint / 1 grapheme) and combining sequences (e + ́ ,
 * 👨‍👩‍👧‍👦 ZWJ family). A char-level diff that splits these renders mojibake —
 * the "atomic proof" lies. Engine offsets stay UTF-16 on purpose (that is
 * the LSP / VS Code column contract); this module is the *display + safety*
 * layer so segmentation never cuts inside a user-perceived character.
 *
 * Pure, zero-dep: Intl.Segmenter (Node ≥16, present everywhere this runs)
 * for graphemes; Array.from / codePointAt for codepoints.
 */

/** Split into grapheme clusters (user-perceived characters). Never splits a
 * surrogate pair, combining mark, or ZWJ sequence. */
export function graphemes(s: string): string[] {
  // Intl.Segmenter is the Unicode-correct path; guard for exotic runtimes.
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Seg === 'function') {
    const seg = new Seg(undefined, { granularity: 'grapheme' });
    const out: string[] = [];
    for (const { segment } of seg.segment(s)) out.push(segment);
    return out;
  }
  // Fallback: codepoints (still never splits a surrogate pair).
  return [...s];
}

/** Split into Unicode codepoints (never splits a surrogate pair). */
export function codepoints(s: string): string[] {
  return Array.from(s);
}

/** UTF-8 byte length of a string (what files/terminals actually measure). */
export function utf8Length(s: string): number {
  return Buffer.byteLength(s, 'utf8');
}

/** UTF-16 code-unit length (JS `.length`; the LSP/editor column unit). */
export function utf16Length(s: string): number {
  return s.length;
}

/** Codepoint count (astral-safe). */
export function codepointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** Grapheme (user-perceived character) count. */
export function graphemeLength(s: string): number {
  return graphemes(s).length;
}

export interface TextUnits {
  utf8Bytes: number;
  utf16Units: number;
  codepoints: number;
  graphemes: number;
  /** true when every unit count agrees ⇒ pure ASCII, offsets unambiguous. */
  ascii: boolean;
}

/** All unit counts for a string — used to surface, in a trace, whether an
 * edit touched multi-unit territory (where naive offsets are unsafe). */
export function measure(s: string): TextUnits {
  const utf8Bytes = utf8Length(s);
  const utf16Units = s.length;
  const cp = codepointLength(s);
  const gr = graphemeLength(s);
  return {
    utf8Bytes,
    utf16Units,
    codepoints: cp,
    graphemes: gr,
    ascii: utf8Bytes === utf16Units && utf16Units === cp && cp === gr,
  };
}

/**
 * Grapheme-safe LCS diff. Operates on grapheme clusters, NOT UTF-16 code
 * units, so a removed/added segment is always a whole user-perceived
 * character — the rendered `[-x-]{+y+}` can never contain half an emoji.
 * Bounded by the caller (only the divergent block is fed in).
 */
export function graphemeDiff(
  oldStr: string,
  newStr: string,
  paint: { del: (s: string) => string; add: (s: string) => string },
): string {
  const a = graphemes(oldStr);
  const b = graphemes(newStr);
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  let out = '';
  let del = '';
  let addb = '';
  const flush = (): void => {
    if (del) out += paint.del(del);
    if (addb) out += paint.add(addb);
    del = '';
    addb = '';
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      flush();
      out += a[i];
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      del += a[i++];
    } else {
      addb += b[j++];
    }
  }
  while (i < n) del += a[i++];
  while (j < m) addb += b[j++];
  flush();
  return out;
}
