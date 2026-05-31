// Pure parser/normalizer helpers extracted from
// `check-cross-boundary-utils-drift.mjs` so the gate's entrypoint stays under
// the architectural file-size cap. Behaviour is byte-equivalent to the
// previous inline implementations — see the original file's revision history
// for the JSDoc that documented each step.

/** Locate `export function|class|const <name>` in a source string. */
export function locateExport(source, name, kind) {
  const patterns =
    kind === 'class'
      ? [new RegExp(`export\\s+class\\s+${name}\\b`)]
      : [
          new RegExp(`export\\s+async\\s+function\\s+${name}\\b`),
          new RegExp(`export\\s+function\\s+${name}\\b`),
          new RegExp(`export\\s+const\\s+${name}\\s*=`),
        ];
  for (const pat of patterns) {
    const m = pat.exec(source);
    if (m) return { start: m.index, source };
  }
  return null;
}

/** Walk past a JS/TS string or template literal, returning the index after the closing quote. */
export function skipString(source, i) {
  const quote = source[i];
  i++;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) return i + 1;
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        if (depth === 0) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

/**
 * From `start` (which sits at `export ...`), walk forward to the end of the
 * declaration: matching closing brace for function/class, or terminating
 * semicolon for const-arrow.
 */
export function extractDeclaration(source, start) {
  let i = start;
  let firstBrace = -1;
  let depthParen = 0;
  let depthAngle = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (ch === '(') depthParen++;
    else if (ch === ')') depthParen--;
    else if (ch === '<') depthAngle++;
    else if (ch === '>' && depthAngle > 0) depthAngle--;
    else if (ch === '{' && depthParen === 0) {
      firstBrace = i;
      break;
    } else if (ch === ';' && depthParen === 0 && depthAngle === 0) {
      return source.slice(start, i + 1);
    }
    i++;
  }
  if (firstBrace < 0) return null;
  let depth = 0;
  let j = firstBrace;
  while (j < source.length) {
    const ch = source[j];
    if (ch === '"' || ch === "'" || ch === '`') {
      j = skipString(source, j);
      continue;
    }
    if (ch === '/' && source[j + 1] === '/') {
      while (j < source.length && source[j] !== '\n') j++;
      continue;
    }
    if (ch === '/' && source[j + 1] === '*') {
      j += 2;
      while (j < source.length && !(source[j] === '*' && source[j + 1] === '/')) j++;
      j += 2;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, j + 1);
    }
    j++;
  }
  return null;
}

/** Strip JSDoc/line comments, normalize quotes, drop TS inference shims, collapse whitespace. */
export function normalize(decl) {
  if (!decl) return '';
  let s = decl;
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, "'$1'");
  s = s.replace(/\s+as\s+Iterable<[^>]+>/g, '');
  s = s.replace(/\s+as\s+[A-Z][A-Za-z0-9_]*\[\]/g, '');
  s = s.replace(/\s+as\s+never\s+as\s+[A-Za-z0-9_.<>]+/g, '');
  s = s.replace(/Array<([A-Za-z0-9_]+)>/g, '$1[]');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Token-set Jaccard similarity over normalized declarations. Score in [0,1]. */
export function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const tokenize = (s) =>
    s
      .split(/([^A-Za-z0-9_$])/)
      .map((t) => t.trim())
      .filter(Boolean);
  const ta = tokenize(a);
  const tb = tokenize(b);
  const ma = new Map();
  const mb = new Map();
  for (const t of ta) ma.set(t, (ma.get(t) ?? 0) + 1);
  for (const t of tb) mb.set(t, (mb.get(t) ?? 0) + 1);
  let inter = 0;
  let union = 0;
  const keys = new Set([...ma.keys(), ...mb.keys()]);
  for (const k of keys) {
    const x = ma.get(k) ?? 0;
    const y = mb.get(k) ?? 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union === 0 ? 1 : inter / union;
}
