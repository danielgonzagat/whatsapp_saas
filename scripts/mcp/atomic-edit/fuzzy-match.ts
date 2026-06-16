/**
 * 5-tier fuzzy selector matching — ported from CodeStruct (Amazon, ACL 2026)
 * `fuzzy_search.py`. When an LLM agent hallucinates a slightly wrong symbol name
 * (e.g. `calcuator` for `Calculator`, `guf` for `get_user_file`), this recovers
 * the intended target instead of returning "not found" and burning tokens on
 * retries. The cascading tiers are ordered by precision — each tier only fires
 * when all earlier tiers returned zero candidates (CodeStruct's "first-wins"
 * semantics, empirically tuned on SWE-Bench trajectories).
 *
 * Tiers:
 *   T1 — Exact:                full selector match (score 100)
 *   T2 — Case-insensitive:     lowercased full selector match (score 92)
 *   T3 — Prefix:               selector is a prefix of candidate name (score 95)
 *   T4 — CamelCase initials:   selector chars match the capitals in candidate (score 90)
 *   T5 — Subsequence:          selector chars appear in candidate in order (score 85)
 *   T6 — Consonant skeleton:   vowel-stripped selector matches vowel-stripped candidate (score 82)
 *   T7 — General fuzzy:        normalized edit-distance (score 70–82)
 *
 * The engine returns a SCORED candidate list; callers pick the top match (with
 * a minimum threshold, default 80) or report ambiguity with the full ranked list
 * so the agent can disambiguate.
 */

export interface FuzzyCandidate {
  selector: string;
  score: number;
  tier: string;
}

export interface FuzzyMatchOptions {
  /** Minimum score to consider a match (default 80). */
  minScore?: number;
  /** Maximum candidates to return (default 10). */
  maxCandidates?: number;
  /** Return ONLY the single best match (default false; returns top-N). */
  singleBest?: boolean;
}

// ──────────────────────── tier scorers ──────────────────────────

function exactMatch(selector: string, candidate: string): FuzzyCandidate | null {
  if (candidate === selector) return { selector: candidate, score: 100, tier: 'exact' };
  const ci = candidate.toLowerCase() === selector.toLowerCase();
  if (ci) return { selector: candidate, score: 92, tier: 'case_insensitive' };
  return null;
}

function prefixMatch(selector: string, candidate: string): FuzzyCandidate | null {
  if (candidate.toLowerCase().startsWith(selector.toLowerCase()) && selector.length >= 2) {
    const ratio = selector.length / candidate.length;
    const score = Math.round(95 * ratio);
    return { selector: candidate, score, tier: 'prefix' };
  }
  return null;
}

function camelCaseMatch(selector: string, candidate: string): FuzzyCandidate | null {
  const capitals = candidate.replace(/[^A-Z]/g, '');
  if (capitals.length < 2) return null;
  const selUpper = selector.toUpperCase();
  if (capitals === selUpper) return { selector: candidate, score: 90, tier: 'camelcase' };
  // partial: selector initials match SOME of the capitals
  if (capitals.includes(selUpper) && selUpper.length >= 2) {
    const ratio = selUpper.length / capitals.length;
    return { selector: candidate, score: Math.round(90 * ratio), tier: 'camelcase' };
  }
  return null;
}

function subsequenceMatch(selector: string, candidate: string): FuzzyCandidate | null {
  const s = selector.toLowerCase();
  const c = candidate.toLowerCase();
  let si = 0;
  for (let ci = 0; ci < c.length && si < s.length; ci += 1) {
    if (c[ci] === s[si]) si += 1;
  }
  if (si === s.length && s.length >= 2) {
    // score: higher for longer matches relative to candidate length
    const ratio = Math.min(s.length / c.length, 1);
    const score = Math.round(85 + 3 * ratio);
    return { selector: candidate, score, tier: 'subsequence' };
  }
  return null;
}

function consonantSkeletonMatch(selector: string, candidate: string): FuzzyCandidate | null {
  const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
  const skeleton = (w: string) => w.toLowerCase().split('').filter((ch) => !vowels.has(ch)).join('');
  const sSkel = skeleton(selector);
  const cSkel = skeleton(candidate);
  if (sSkel.length < 2) return null;
  if (cSkel === sSkel) return { selector: candidate, score: 82, tier: 'consonant' };
  if (cSkel.startsWith(sSkel) && sSkel.length >= 3) {
    const ratio = sSkel.length / cSkel.length;
    return { selector: candidate, score: Math.round(82 * ratio), tier: 'consonant' };
  }
  return null;
}

function generalFuzzyMatch(selector: string, candidate: string): FuzzyCandidate | null {
  const s = selector.toLowerCase();
  const c = candidate.toLowerCase();

  // Levenshtein-like normalized similarity
  const m = s.length;
  const n = c.length;
  if (m === 0 || n === 0) return null;

  // quick substring check
  if (c.includes(s)) {
    const ratio = m / n;
    return { selector: candidate, score: Math.round(75 + 10 * ratio), tier: 'substring' };
  }
  if (s.includes(c)) {
    const ratio = n / m;
    return { selector: candidate, score: Math.round(72 + 8 * ratio), tier: 'substring' };
  }

  // token-based matching for snake_case / kebab-case / dot-notation
  const sTokens = s.split(/[._\-:]/);
  const cTokens = c.split(/[._\-:]/);
  const tail = sTokens[sTokens.length - 1];
  const cTail = cTokens[cTokens.length - 1];

  // tail match (last segment)
  if (cTail === tail && tail.length >= 2) {
    return { selector: candidate, score: 80, tier: 'tail_match' };
  }
  if (cTail.startsWith(tail) && tail.length >= 2) {
    const ratio = tail.length / cTail.length;
    return { selector: candidate, score: Math.round(78 * ratio), tier: 'tail_prefix' };
  }

  // rapidfuzz-like WRatio: character overlap
  const sSet = new Set(s.split(''));
  const cSet = new Set(c.split(''));
  let overlap = 0;
  for (const ch of sSet) if (cSet.has(ch)) overlap += 1;
  const union = new Set([...sSet, ...cSet]).size;
  const jaccard = union > 0 ? overlap / union : 0;
  if (jaccard >= 0.55) {
    return { selector: candidate, score: Math.round(70 + 12 * jaccard), tier: 'jaccard' };
  }

  return null;
}

// ──────────────────────── public API ──────────────────────────

/**
 * Fuzzy-match a user-provided selector against a list of candidate symbol
 * names (e.g. from `code_outline`). Cascading tiers: exact → prefix →
 * CamelCase → subsequence → consonant → general. Each tier only fires when
 * all earlier tiers returned zero candidates at/above the minimum score.
 *
 * The cascade is "first-wins" per CodeStruct: we do NOT merge across tiers
 * because lower tiers are increasingly noisy and mixing them creates false
 * ambiguity. If T2 (prefix) returns 1 candidate, we return that and stop.
 *
 * When `singleBest` is true, returns only the highest-scored candidate.
 */
export function fuzzyMatch(
  selector: string,
  candidates: string[],
  opts: FuzzyMatchOptions = {},
): FuzzyCandidate[] {
  const minScore = opts.minScore ?? 80;
  const maxCandidates = opts.maxCandidates ?? 10;
  const selectors = candidates.filter((c, i, arr) => arr.indexOf(c) === i);

  if (selectors.length === 0) return [];

  // T1: exact + case-insensitive
  {
    const results: FuzzyCandidate[] = [];
    for (const c of selectors) {
      const m = exactMatch(selector, c);
      if (m && m.score >= minScore) results.push(m);
    }
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxCandidates);
    if (top.length > 0) return top;
  }

  // T2: prefix
  {
    const results: FuzzyCandidate[] = [];
    for (const c of selectors) {
      const m = prefixMatch(selector, c);
      if (m && m.score >= minScore) results.push(m);
    }
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxCandidates);
    if (top.length > 0) return top;
  }

  // T3: CamelCase initials
  {
    const results: FuzzyCandidate[] = [];
    for (const c of selectors) {
      const m = camelCaseMatch(selector, c);
      if (m && m.score >= minScore) results.push(m);
    }
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxCandidates);
    if (top.length > 0) return top;
  }

  // T4: subsequence
  {
    const results: FuzzyCandidate[] = [];
    for (const c of selectors) {
      const m = subsequenceMatch(selector, c);
      if (m && m.score >= minScore) results.push(m);
    }
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxCandidates);
    if (top.length > 0) return top;
  }

  // T5: consonant skeleton
  {
    const results: FuzzyCandidate[] = [];
    for (const c of selectors) {
      const m = consonantSkeletonMatch(selector, c);
      if (m && m.score >= minScore) results.push(m);
    }
    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, maxCandidates);
    if (top.length > 0) return top;
  }

  // T6: general fuzzy (lowest precision)
  {
    const results: FuzzyCandidate[] = [];
    for (const c of selectors) {
      const m = generalFuzzyMatch(selector, c);
      if (m && m.score >= minScore) results.push(m);
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxCandidates);
  }
}

/**
 * Single-best-match convenience: returns the top fuzzy match above threshold,
 * or null when nothing passes. When multiple candidates tie, returns the
 * highest-scored one (ties broken by insertion order).
 */
export function fuzzyMatchBest(
  selector: string,
  candidates: string[],
  minScore = 80,
): FuzzyCandidate | null {
  const results = fuzzyMatch(selector, candidates, { minScore, maxCandidates: 1, singleBest: true });
  return results.length > 0 ? results[0] : null;
}
