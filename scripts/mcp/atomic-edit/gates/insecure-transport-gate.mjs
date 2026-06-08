/**
 * gates/insecure-transport-gate.mjs — a REAL, EXECUTABLE registry GateModule.
 *
 * This is the executable form the self-improving lattice admits: NOT a declarative
 * descriptor, but a module that exports `gate(ctx)` and states ONE exoneration-free
 * byte fact over a single edit. It is loaded and run by engine-gate-registry.ts
 * (loadGateModule → runRegistryGatesOverEdit) at the byte floor, and admitted only
 * after verifyMonotonicAdmission proves it reds none of the known-good corpus.
 *
 * THE FACT (a real prod-break class). A write may not INTRODUCE a hardcoded
 * insecure-transport URL — an `http://` (not `https://`) literal pointing at a
 * non-local host — into a source file. Insecure transport is a canonical
 * green-but-broken class: it passes every syntax/type/connection gate (the bytes
 * are valid, the import resolves, the type is `string`) yet breaks in production
 * (mixed-content blocked by the browser, credentials sent in clear, MITM). The
 * built-in floor (connection / supply-chain / type-soundness / iac / security)
 * does not assert it: security-gate catches committed SECRETS, not insecure
 * scheme. So this is exactly the "all-gates-passed vs prod-broke" delta the lattice
 * exists to close.
 *
 * EXONERATION-FREE + NEW-ONLY (mirrors the built-in gates' honesty doctrine):
 *  - NEW-only: a literal is this write's claim ONLY if it is present in `after` but
 *    ABSENT from `before`. A pre-existing insecure URL in legacy bytes never blocks
 *    an unrelated edit (no retroactive red) — but no write may INTRODUCE one.
 *  - LOCALHOST EXONERATED: http://localhost, 127.0.0.1, ::1, 0.0.0.0, *.local, and
 *    RFC-1918 private ranges are legitimately plaintext (dev servers, sidecars) →
 *    green, never red-by-guess.
 *  - SCHEMA / EXAMPLE EXONERATED: http://www.w3.org/…, http://schemas.… , and
 *    http://example.* are namespace/identifier URIs, not live transport → green.
 *  - COMMENTS NOT JUDGED: a `// see http://…` reference is documentation, not a
 *    runtime endpoint. We only judge a URL that is the value of a string LITERAL,
 *    approximated byte-decidably by requiring it to sit inside quotes; a URL that
 *    appears only after a line-comment marker is skipped (honest degrade — a real
 *    JS grammar would distinguish comment from string node; this gate is the
 *    bounded byte approximation, never red-by-guess on a documentation reference).
 *
 * CEILING (documented, deferred): this is a byte/scheme fact, not a reachability
 * proof — it does not assert the URL is actually requested at runtime. A genuinely
 * dead insecure literal is still flagged (conservative on the safe side: removing
 * an insecure literal is always additive-correctness). Distinguishing live from
 * dead needs the dynamic/effect tier, out of scope for a static registry gate.
 */

/** This gate judges source files where a URL literal is a runtime endpoint, not config noise. */
const JUDGED_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

export const id = 'insecure-transport';

export function appliesTo(file) {
  const i = file.lastIndexOf('.');
  const ext = i < 0 ? '' : file.slice(i).toLowerCase();
  return JUDGED_EXT.has(ext);
}

/**
 * Hosts that are legitimately plaintext or are namespace/example identifiers, not
 * live secure-transport endpoints. Matched against the URL's host (lowercased).
 */
function isExoneratedHost(host) {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h === '[::1]') return true;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
  // RFC-1918 private ranges + link-local (dev sidecars, internal-only plaintext).
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  // Namespace / schema / example identifiers — URIs, not transport.
  if (h === 'www.w3.org' || h === 'w3.org' || h.endsWith('.w3.org')) return true;
  if (h.startsWith('schemas.') || h.startsWith('schema.')) return true;
  if (h === 'example.com' || h === 'example.org' || h === 'example.net' || h.endsWith('.example.com')) return true;
  if (h === 'xmlns.com' || h.endsWith('.xmlns.com')) return true;
  return false;
}

/**
 * Length-preserving blanking of line- and block-comment bodies so a URL that lives
 * ONLY in a comment is never judged. Strings are deliberately PRESERVED (a runtime
 * endpoint legitimately lives in a string literal — that is exactly what we judge).
 * This is the same "blank comments, keep strings" discipline the IaC gate uses.
 */
function blankComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let inStr = null; // the active string quote char, or null
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (inStr) {
      if (c === '\\') {
        out += src.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === inStr) inStr = null;
      out += c;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && c2 === '/') {
      while (i < n && src[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      continue;
    }
    if (c === '/' && c2 === '*') {
      out += '  ';
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < n) {
        out += '  ';
        i += 2;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Extract the set of insecure-transport host URLs in `src` (after comment-blanking). */
function insecureUrlsIn(src) {
  const scrubbed = blankComments(src);
  const found = new Set();
  // http:// followed by a host (no whitespace/quote/closing). Captures the host
  // segment up to the first /, :, ", ', `, or whitespace.
  const re = /http:\/\/([^/:"'`\s)]+)/gi;
  let m;
  while ((m = re.exec(scrubbed)) !== null) {
    const host = m[1];
    if (!host) continue;
    if (isExoneratedHost(host)) continue;
    found.add(`http://${host}`);
  }
  return found;
}

/**
 * The fact over one edit. Red ⟺ the write INTRODUCES (present in after, absent in
 * before) an insecure-transport URL to a non-exonerated host. Green ⟺ it does not.
 * Unjudged is never returned here: the byte fact is total over the judged extensions
 * (every insecure literal is either new-and-non-exonerated → red, or not → green).
 */
export function gate(ctx) {
  const beforeUrls = insecureUrlsIn(ctx.before || '');
  const afterUrls = insecureUrlsIn(ctx.after || '');
  const introduced = [...afterUrls].filter((u) => !beforeUrls.has(u));
  if (introduced.length === 0) {
    return { id, status: 'green', fact: 'no new insecure-transport (http://) URL to a non-local host was introduced' };
  }
  return {
    id,
    status: 'red',
    fact:
      `introduces hardcoded insecure-transport URL(s): ${introduced.slice(0, 3).join(', ')}` +
      `${introduced.length > 3 ? ` (+${introduced.length - 3} more)` : ''} — use https:// (localhost/private/schema hosts are exonerated)`,
    locus: ctx.file,
  };
}

export default { id, appliesTo, gate };
