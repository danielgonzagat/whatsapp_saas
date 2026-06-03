/**
 * gates/security-gate.ts — the exoneration-free HARDCODED-SECRET fact (proof
 * #3's named-but-missing security layer).
 *
 * A source write must not INTRODUCE a hardcoded credential. That is a FACT
 * extractable from bytes: a token matching a known high-confidence secret shape
 * (AWS access key, private-key PEM header, Stripe/GitHub/GitLab/Slack/Google/
 * OpenAI/Anthropic/npm/GCP/Azure/DigitalOcean token, a JWT, a DB URL with an
 * embedded password, or a generic high-entropy secret assigned to a secret-named
 * identifier) that is NOT a placeholder and is NOT already present in the file's
 * prior bytes.
 *
 * Doctrine compliance (gates/contract.ts):
 *  - NEW-only delta: only a secret in the NEW content and ABSENT from priorOf() is
 *    this write's claim. A pre-existing secret never blocks an unrelated edit
 *    (history scanning is a different tool) — but no write may INTRODUCE one.
 *  - Exoneration-free / no red-by-guess: only high-confidence shapes red.
 *    Placeholders (XXXX, your-key-here, <...>, ${...}/$VAR, process.env, example,
 *    all-same-char) are exonerated. When the bytes do not unambiguously determine
 *    a real secret, the gate says nothing.
 *  - PERCEPTION CEILING (documented): a regex/entropy byte fact, not taint
 *    analysis. It proves a value has a credential SHAPE, not that it is USED as
 *    one. A secret split across concatenation / double-base64 / runtime fetch is
 *    out of scope (→ no red). Closing that needs the dynamic/data-flow tier.
 *
 * Mutation-Firewall law (mirrored): PERCEPTION only — it LOCATES the secret (file +
 * locus + fact); it never writes.
 */
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';
import { blankComments } from '../connection-gate.js';

const APPLIES_RE =
  /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|kt|c|h|cc|cpp|hpp|cs|rb|php|swift|scala|sh|bash|zsh|sql|ya?ml|toml|env|json|properties|ini|cfg|conf)$/i;

/** A token that is clearly a placeholder, not a live secret. */
function isPlaceholder(value: string): boolean {
  const v = value.trim();
  if (v.length === 0) return true;
  if (/\$\{?[A-Za-z_]/.test(v)) return true; // ${VAR} / $VAR interpolation
  if (/process\.env|os\.environ|ENV\[|getenv|System\.getenv/.test(v)) return true;
  if (/(?:XXXX|xxxx|placeholder|example|your[-_]?(?:key|token|secret|password)|changeme|redacted|dummy|sample|<[^>]+>|\.\.\.)/i.test(v))
    return true;
  if (/^(.)\1{6,}$/.test(v.replace(/[-_]/g, ''))) return true; // all-same-char
  return false;
}

/** Shannon entropy (bits/char) — for the generic high-entropy class. */
function entropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

interface SecretHit {
  token: string;
  kind: string;
}

/** High-confidence, shape-specific secret detectors (the unambiguous classes). */
const SHAPE_DETECTORS: { re: RegExp; kind: string }[] = [
  { re: /AKIA[0-9A-Z]{16}/g, kind: 'AWS access key id' },
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g, kind: 'private key PEM' },
  { re: /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}/g, kind: 'Stripe live secret key' },
  { re: /\bwhsec_[0-9A-Za-z]{16,}/g, kind: 'Stripe webhook secret' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g, kind: 'GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{40,}/g, kind: 'GitHub fine-grained PAT' },
  { re: /\bxox[baprs]-[0-9A-Za-z-]{20,}/g, kind: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z\-_]{35}/g, kind: 'Google API key' },
  // Anthropic BEFORE OpenAI: sk-ant-... is a more specific prefix of sk-...
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, kind: 'Anthropic API key' },
  { re: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g, kind: 'OpenAI API key' },
  { re: /\bnpm_[A-Za-z0-9]{36}/g, kind: 'npm access token' },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/g, kind: 'GitLab personal access token' },
  { re: /\bdop_v1_[a-f0-9]{64}/g, kind: 'DigitalOcean token' },
  { re: /"private_key_id"\s*:\s*"[a-f0-9]{40}"/g, kind: 'GCP service-account private_key_id' },
  { re: /AccountKey=[A-Za-z0-9+/]{80,}={0,2}/g, kind: 'Azure storage AccountKey' },
  { re: /eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}/g, kind: 'JWT' },
  // DB connection URL WITH an embedded password (user:password@host). A bare
  // `postgres://localhost/db` (no credentials) does NOT match — the user: and
  // :password@ segments are required. A placeholder host (example.com) is still
  // exonerated by isPlaceholder downstream.
  { re: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^:@/\s]+:[^@/\s]+@[^\s"'`]+/g, kind: 'database URL with embedded credentials' },
];

/**
 * Generic class: a secret-named assignment whose RHS string literal is long and
 * high-entropy. `secret_key = "Abc9...x"` with entropy >= 3.5 bits/char and length
 * >= 20 is a credential shape; placeholders/env are exonerated.
 */
const SECRET_ASSIGN_RE =
  /\b([A-Za-z_][A-Za-z0-9_]*(?:secret|passwd|password|api[_-]?key|apikey|token|private[_-]?key|access[_-]?key|client[_-]?secret)[A-Za-z0-9_]*)\b\s*[:=]\s*["'`]([^"'`\n]{20,})["'`]/gi;

function isBarePublicUrl(v: string): boolean {
  // A public endpoint URL is not a credential. Require an http(s) scheme and NO
  // userinfo (@), query (?), fragment (#) or whitespace - a secret hides in
  // @user:pass, a ?token= param, or a high-entropy path segment. Exonerate only when
  // none of those is present, so a secret-bearing URL (webhook path token,
  // credentialed DB URL) is NEVER exonerated.
  if (!v.startsWith('http://') && !v.startsWith('https://')) return false;
  if (/[\s?#@]/.test(v)) return false;
  const afterScheme = v.slice(v.indexOf('://') + 3);
  const segments = afterScheme.split('/').slice(1);
  for (const seg of segments) {
    if (seg.length >= 16 && entropy(seg) >= 3.5) return false; // secret-shaped path segment
  }
  return true;
}

function findSecrets(body: string): SecretHit[] {
  const scan = blankComments(body);
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  for (const det of SHAPE_DETECTORS) {
    det.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = det.re.exec(scan)) !== null) {
      const tok = m[0];
      if (isPlaceholder(tok)) continue;
      const key = det.kind + ':' + tok;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ token: tok, kind: det.kind });
    }
  }
  SECRET_ASSIGN_RE.lastIndex = 0;
  let am: RegExpExecArray | null;
  while ((am = SECRET_ASSIGN_RE.exec(scan)) !== null) {
    const name = am[1];
    const val = am[2];
    if (isPlaceholder(val)) continue;
    if (isBarePublicUrl(val)) continue; // a public endpoint URL is not a credential
    if (entropy(val) < 3.5) continue; // not high-entropy → likely not a real secret
    const key = 'assign:' + name + ':' + val;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ token: `${name}=${val.slice(0, 6)}…`, kind: `hardcoded ${name}` });
  }
  return hits;
}

function lineOf(body: string, anchor: string): number {
  const idx = body.indexOf(anchor);
  if (idx < 0) return 1;
  let line = 1;
  for (let i = 0; i < idx; i += 1) if (body[i] === '\n') line += 1;
  return line;
}

const securityGate: GateModule = {
  name: 'security',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return APPLIES_RE.test(rel);
  },
  run(ctx: GateContext): GateResult {
    const note =
      'a write must not INTRODUCE a hardcoded secret (AWS/PEM/Stripe/GitHub/GitLab/Slack/Google/OpenAI/Anthropic/npm/GCP/Azure/DO/JWT shape, a DB URL with embedded password, or a high-entropy secret-named assignment); NEW-only vs prior, placeholders exonerated';
    const reds: GateRed[] = [];
    for (const rel of ctx.changedFiles) {
      if (!APPLIES_RE.test(rel)) continue;
      const body = ctx.readFile(rel);
      if (body === null) continue;
      const beforeTokens = new Set(findSecrets(ctx.priorOf(rel)).map((h) => h.token));
      for (const hit of findSecrets(body)) {
        if (beforeTokens.has(hit.token)) continue; // pre-existing — not this write's claim
        reds.push({
          file: rel,
          locus: `L${lineOf(body, hit.token.split('=')[0])}`,
          fact: `introduces a hardcoded ${hit.kind} — move it to an env var / secret manager (never commit credentials)`,
        });
      }
    }
    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default securityGate;
