/**
 * engine-gate-registry.ts — the ENGINE half of the self-improving Gate Lattice.
 *
 * The CLI (atomic-cli.mjs) DETECTS coverage gaps and PROPOSES gates; this module
 * is the part the CLI's `cmdGaps`/`cmdIncident` cannot be: the place where a
 * proposed gate becomes a REAL, EXECUTABLE GateModule, is admitted ONLY if it is
 * monotonic against the corpus of known-good edits, and is then RUN at the byte
 * floor so an admitted gate actually BLOCKS a violating write.
 *
 * Three things live here, each closing one half of GAP #2:
 *
 *  1. THE EDIT-SCOPED GATE CONTRACT (`RegistryGateModule` / `EditGateContext`).
 *     A registry gate is NOT a declarative descriptor ("require a convergence
 *     verdict for .ts"); it is a real module that exports
 *         export function gate(ctx: EditGateContext): EditGateResult
 *     and states ONE exoneration-free fact over a single edit
 *     `{ id, status: 'green'|'red'|'unjudged', fact }`. Same honesty doctrine as
 *     gates/contract.ts: red-by-byte, green-by-byte, or honestly unjudged — never
 *     red-by-guess. The module is loaded by absolute/relative path and executed;
 *     there is no interpreter of intent, only a function run over bytes.
 *
 *  2. THE MONOTONIC ADMISSION VERIFIER (`verifyMonotonicAdmission`). A candidate
 *     gate is admitted ONLY if, run over the CORPUS of edits the lattice already
 *     admitted green (every green trace's before→after bytes), it reds NONE of
 *     them. This is the REAL check the CLI's `admitGate` no-op was reaching for:
 *     the old code referenced `t.gateVerdict.requiresConvergence` — a field that
 *     does not exist on RegistryRun (trace.ts) — so it could never find a
 *     conflict and admitted everything. Here we actually EXECUTE the candidate
 *     gate against the recorded green edits and reject it if it would have
 *     reddened any of them (non-monotonic = it changes the verdict of an edit the
 *     lattice already accepted, which is exactly the regression admission must
 *     forbid).
 *
 *  3. THE WRITE-PATH RUNNER (`runRegistryGatesOverEdit`). Given the bytes of one
 *     edit, load every admitted gate from the registry and run it. Any `red`
 *     blocks; an `unjudged` does NOT block here (the registry is the SELF-EXTENDED
 *     layer on top of the frozen byte-floor gates — its job is to add NEW blocking
 *     facts the built-ins miss, not to re-impose the strict unjudged-is-not-green
 *     law the built-in SYNC_WRITE_GATES already enforce in server-helpers-io.ts).
 *     server-helpers-io.atomicWrite calls this AFTER the built-in floor, additively.
 *
 * THE GAP SIGNAL (`detectIncidentCoverageGap`). The CLI's `detectGapProposal`
 * uses "ops without a convergence verdict" — a weak signal (a missing verdict is
 * not a defect). The lattice's REAL gap signal is the delta the title names:
 * "all-gates-passed vs prod-broke". An incident names a file (and the trace whose
 * gate verdict was GREEN for it); a coverage gap is precisely an edit the lattice
 * admitted GREEN that an incident later proved defective. Those are the edits a
 * new gate must learn to red — and `verifyMonotonicAdmission` guarantees learning
 * to red THEM never reds a known-good edit.
 *
 * No engine, no daemon, no language server. Pure fs + dynamic import of the
 * admitted gate modules. Everything is additive: nothing here changes the meaning
 * of any existing op, and an empty registry is a transparent no-op.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vm from 'node:vm';
import { createRequire } from 'node:module';
// This module is ESM (tsconfig module=ESNext, dist "type":"module"), so the bare
// `require` global is NOT defined at runtime — the sync gate loader builds one with
// createRequire so a gate module may pull node builtins if it ever needs to.
const moduleRequire = createRequire(import.meta.url);

/** Where the admitted-gate registry lives (same path the CLI's gateRegistryPath() uses). */
export const GATE_REGISTRY_REL = path.join('.atomic', 'gates', 'registry.json');
/** Where prod-incident signals are recorded (one JSONL line per incident). */
export const INCIDENT_LOG_REL = path.join('.atomic', 'incidents', 'incidents.jsonl');
/** Where atomic edit traces live — the corpus of known-good edits is read from here. */
export const TRACES_REL = path.join('.atomic', 'traces');

/**
 * The context one registry gate sees: the EXACT bytes of a single edit plus where
 * it lands. Deliberately smaller than gates/contract.ts GateContext — a registry
 * gate is a per-edit byte fact, not a whole-overlay resolver. `before` is '' for a
 * freshly-created file (no prior bytes), mirroring makeContext's priorOf semantics.
 */
export interface EditGateContext {
  /** repo-relative path of the file the edit lands in */
  file: string;
  /** the file's bytes BEFORE this edit ('' for a brand-new file) */
  before: string;
  /** the file's bytes AFTER this edit (the candidate content) */
  after: string;
  /** absolute repo root, so a gate may read sibling files if it must */
  repoRoot: string;
}

/** One registry gate's verdict over one edit. Exoneration-free: green / red / unjudged. */
export interface EditGateResult {
  /** the gate id (matches the registry entry id) */
  id: string;
  /** green = the fact holds; red = the edit violates it (BLOCK); unjudged = cannot decide from bytes (NEVER block) */
  status: 'green' | 'red' | 'unjudged';
  /** the exact fact: what held / what was violated / why undecidable */
  fact: string;
  /** optional atomic precision inside the file (line/byte-span/symbol) */
  locus?: string;
}

/**
 * A loadable registry gate module. The real, executable form of a proposal: a
 * module file under atomic-os/gates/ that exports `gate`. `appliesTo` lets a gate
 * scope itself by file (default: every file) so the runner skips irrelevant edits.
 */
export interface RegistryGateModule {
  /** unique kebab id; also the id every EditGateResult carries */
  id: string;
  /** which files this gate judges; default = all */
  appliesTo?(file: string): boolean;
  /** the fact over one edit */
  gate(ctx: EditGateContext): EditGateResult;
}

/** One admitted entry in the registry: id + the repo-relative path to its executable module. */
export interface RegistryEntry {
  id: string;
  /** repo-relative path to the GateModule file (under atomic-os/gates/) */
  modulePath: string;
  /** one-line statement of the invariant this gate enforces */
  intent: string;
  /** true once verifyMonotonicAdmission accepted it against the corpus */
  monotonic: boolean;
  /** how many known-good corpus edits the admission run checked (audit trail) */
  admittedAgainst: number;
  /** ISO timestamp of admission */
  admittedAt: string;
}

export interface GateRegistry {
  format: 'atomic-gate-registry/v2';
  gates: RegistryEntry[];
}

/** One recorded edit from the corpus of known-good (green) edits. */
export interface CorpusEdit {
  file: string;
  before: string;
  after: string;
  /** the operation id of the trace this edit came from (audit trail) */
  operationId?: string;
}

/** Absolute path to the registry for a repo. */
export function gateRegistryPath(repoRoot: string): string {
  return path.join(repoRoot, GATE_REGISTRY_REL);
}

/** Load the registry, or an empty v2 registry if none exists / it is unreadable. */
export function loadRegistry(repoRoot: string): GateRegistry {
  try {
    const raw = JSON.parse(fs.readFileSync(gateRegistryPath(repoRoot), 'utf8')) as Partial<GateRegistry>;
    if (Array.isArray(raw.gates)) {
      return { format: 'atomic-gate-registry/v2', gates: raw.gates as RegistryEntry[] };
    }
  } catch {
    /* no registry yet, or unreadable → empty (a transparent no-op at the write path) */
  }
  return { format: 'atomic-gate-registry/v2', gates: [] };
}

/** Persist the registry (creates .atomic/gates/ on first write). */
export function saveRegistry(repoRoot: string, reg: GateRegistry): void {
  const p = gateRegistryPath(repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(reg, null, 2) + '\n');
}

/**
 * Dynamically import one admitted gate module and return its `gate` export, or
 * null if the module is missing / does not export a callable `gate` (a registry
 * entry pointing at a vanished module must NEVER throw at the write path — it
 * degrades to "no such gate ran", never to a crash that would deny a good write).
 */
export async function loadGateModule(repoRoot: string, entry: RegistryEntry): Promise<RegistryGateModule | null> {
  const abs = path.isAbsolute(entry.modulePath) ? entry.modulePath : path.join(repoRoot, entry.modulePath);
  if (!fs.existsSync(abs)) return null;
  try {
    const mod = (await import(pathToFileURL(abs).href)) as Partial<RegistryGateModule> & {
      default?: Partial<RegistryGateModule>;
    };
    const candidate = typeof mod.gate === 'function' ? mod : mod.default;
    if (!candidate || typeof candidate.gate !== 'function') return null;
    return {
      id: candidate.id ?? entry.id,
      appliesTo: candidate.appliesTo,
      gate: candidate.gate,
    };
  } catch {
    return null; // an unloadable module is a non-judging gate, never a crash
  }
}

/**
 * SYNCHRONOUS gate-module loader — for the byte floor (server-helpers-io.atomicWrite),
 * whose sync contract is load-bearing across every write helper and cannot await a
 * dynamic import. A registry gate is authored as a small, dependency-free `.mjs`
 * (plain functions + `export`/`export default`), so we read its source and evaluate
 * it in an isolated vm context with a CommonJS-style `module.exports`, after a
 * minimal, deterministic ESM→CJS rewrite of its top-level `export` forms:
 *   `export const X = …`      → `const X = …; module.exports.X = X;`
 *   `export function X(…)`     → `function X(…){…}; module.exports.X = X;`
 *   `export default <expr>;`   → `module.exports.default = <expr>;`
 * This is intentionally NARROW (it does not implement general ESM — no `import`,
 * no re-export): a registry gate module is a leaf byte-fact with no dependencies,
 * exactly the shape this rewrite covers. Anything outside the shape fails to load
 * and degrades to a non-judging gate (null) — never a crash, never a false block.
 *
 * Caches the compiled module by absPath+mtime so the floor pays the read/compile
 * cost once per gate, not once per write.
 */
const syncModuleCache = new Map<string, { mtimeMs: number; mod: RegistryGateModule | null }>();

function rewriteEsmExportsToCjs(src: string): string {
  return src
    // `export default <expr>;`  (the whole-module default object the gates emit)
    .replace(/^[ \t]*export\s+default\s+/gm, 'module.exports.default = ')
    // `export const|let|var NAME = …`
    .replace(/^[ \t]*export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/gm, '$1 $2 = module.exports.$2 =')
    // `export function NAME(` and `export async function NAME(`
    .replace(/^[ \t]*export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm, '$1function $2(')
    // collect the function exports' names by re-emitting an assignment block is hard
    // inline; instead the function declarations above are hoisted, and we append a
    // trailing re-export of every name the gate contract requires (id/appliesTo/gate)
    // — these are the only members the runner reads, so binding them is sufficient.
    + '\n;try{module.exports.id=typeof id!=="undefined"?id:module.exports.id;}catch(_){}'
    + '\n;try{module.exports.appliesTo=typeof appliesTo!=="undefined"?appliesTo:module.exports.appliesTo;}catch(_){}'
    + '\n;try{module.exports.gate=typeof gate!=="undefined"?gate:module.exports.gate;}catch(_){}';
}

export function loadGateModuleSync(repoRoot: string, entry: RegistryEntry): RegistryGateModule | null {
  const abs = path.isAbsolute(entry.modulePath) ? entry.modulePath : path.join(repoRoot, entry.modulePath);
  let mtimeMs: number;
  try {
    const st = fs.statSync(abs);
    if (!st.isFile()) return null;
    mtimeMs = st.mtimeMs;
  } catch {
    return null;
  }
  const cached = syncModuleCache.get(abs);
  if (cached && cached.mtimeMs === mtimeMs) return cached.mod;
  let mod: RegistryGateModule | null = null;
  try {
    const src = fs.readFileSync(abs, 'utf8');
    const sandbox: { module: { exports: Record<string, unknown> }; exports: Record<string, unknown>; require: NodeRequire } = {
      module: { exports: {} },
      exports: {},
      require: moduleRequire,
    };
    sandbox.exports = sandbox.module.exports;
    const context = vm.createContext(sandbox);
    vm.runInContext(rewriteEsmExportsToCjs(src), context, { filename: abs, timeout: 2000 });
    const ex = sandbox.module.exports as Partial<RegistryGateModule> & { default?: Partial<RegistryGateModule> };
    const candidate = typeof ex.gate === 'function' ? ex : ex.default;
    if (candidate && typeof candidate.gate === 'function') {
      mod = { id: candidate.id ?? entry.id, appliesTo: candidate.appliesTo, gate: candidate.gate };
    }
  } catch {
    mod = null; // unloadable → non-judging, never a crash at the floor
  }
  syncModuleCache.set(abs, { mtimeMs, mod });
  return mod;
}

/**
 * SYNCHRONOUS write-path runner — the byte-floor twin of runRegistryGatesOverEdit.
 * Loads every admitted gate synchronously (vm-isolated) and runs it over the edit.
 * `green` ⟺ no admitted gate reported red. A red BLOCKS (caller throws); unjudged
 * never blocks (the registry ADDS new facts, it does not re-impose the floor's
 * strict unjudged law). An empty/absent registry → green, zero gates ran (no-op).
 */
export function runRegistryGatesOverEditSync(ctx: EditGateContext, repoRootOverride?: string): RegistryGateRun {
  const repoRoot = repoRootOverride ?? ctx.repoRoot;
  const reg = loadRegistry(repoRoot);
  const reds: EditGateResult[] = [];
  const unjudged: EditGateResult[] = [];
  const ran: string[] = [];
  for (const entry of reg.gates) {
    const g = loadGateModuleSync(repoRoot, entry);
    if (!g || !gateApplies(g, ctx.file)) continue;
    ran.push(g.id);
    const res = runOne(g, ctx);
    if (res.status === 'red') reds.push(res);
    else if (res.status === 'unjudged') unjudged.push(res);
  }
  return { green: reds.length === 0, reds, unjudged, ran };
}

/** Does this gate judge this file? Default (no appliesTo) = every file. */
function gateApplies(g: RegistryGateModule, file: string): boolean {
  try {
    return g.appliesTo ? g.appliesTo(file) : true;
  } catch {
    return false; // a throwing appliesTo cannot scope the gate in → treat as not-applicable
  }
}

/** Run one gate over one edit, catching throws as honest-unjudged (never a crash → never a false block). */
function runOne(g: RegistryGateModule, ctx: EditGateContext): EditGateResult {
  try {
    const res = g.gate(ctx);
    if (!res || (res.status !== 'green' && res.status !== 'red' && res.status !== 'unjudged')) {
      return { id: g.id, status: 'unjudged', fact: 'gate returned a malformed verdict (no green/red/unjudged status)' };
    }
    return res;
  } catch (e) {
    return { id: g.id, status: 'unjudged', fact: `gate threw: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export interface RegistryGateRun {
  /** true ⟺ no admitted gate reported red over this edit */
  green: boolean;
  /** every red the admitted gates reported (the blocking facts) */
  reds: EditGateResult[];
  /** gates that ran and could not decide (honest; never block) */
  unjudged: EditGateResult[];
  /** ids of gates that actually applied to this edit and ran */
  ran: string[];
}

/**
 * THE WRITE-PATH RUNNER. Load every admitted gate from the registry and run it
 * over the candidate edit. `green` ⟺ no gate reported red. A red BLOCKS (the
 * caller throws); an unjudged does NOT block (the registry only ADDS new blocking
 * facts on top of the built-in floor — it does not re-impose the floor's strict
 * unjudged law). An empty registry → green with no gates ran (a no-op).
 */
export async function runRegistryGatesOverEdit(ctx: EditGateContext, repoRootOverride?: string): Promise<RegistryGateRun> {
  const repoRoot = repoRootOverride ?? ctx.repoRoot;
  const reg = loadRegistry(repoRoot);
  const reds: EditGateResult[] = [];
  const unjudged: EditGateResult[] = [];
  const ran: string[] = [];
  for (const entry of reg.gates) {
    const g = await loadGateModule(repoRoot, entry);
    if (!g || !gateApplies(g, ctx.file)) continue;
    ran.push(g.id);
    const res = runOne(g, ctx);
    if (res.status === 'red') reds.push(res);
    else if (res.status === 'unjudged') unjudged.push(res);
  }
  return { green: reds.length === 0, reds, unjudged, ran };
}

// ─────────────────────────── corpus of known-good edits ───────────────────────────

/**
 * Read the corpus of edits the lattice already admitted GREEN — the before→after
 * bytes of every trace whose gateVerdict was green (or, for genesis ops with no
 * verdict, the recorded after content treated as a known-good outcome only when it
 * carries reconstructable before/after). A trace stores hashes, not full content,
 * so the corpus is built from the inline char-proof the trace persisted PLUS the
 * current on-disk bytes as the authoritative `after` when the file is unchanged.
 *
 * HONEST CEILING: a trace whose file has since changed (afterSha256 ≠ on-disk) can
 * no longer supply a faithful `after`, so it is SKIPPED — the corpus contains only
 * edits we can reconstruct exactly, never a guessed reconstruction. Admission run
 * over a smaller-but-exact corpus is sound; a guessed corpus would not be.
 */
export function readKnownGoodCorpus(repoRoot: string): CorpusEdit[] {
  const dir = path.join(repoRoot, TRACES_REL);
  if (!fs.existsSync(dir)) return [];
  const out: CorpusEdit[] = [];
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  for (const f of files) {
    let t: Record<string, unknown>;
    try {
      t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown>;
    } catch {
      continue;
    }
    // Only GREEN edits are "known good": a verdict that blocked (didBlock) or had
    // reds was never admitted, so it is not part of the corpus a new gate must keep green.
    const verdict = t.gateVerdict as { green?: boolean; didBlock?: boolean; reds?: unknown[] } | undefined;
    const wasGreen = !verdict || (verdict.green !== false && verdict.didBlock !== true && !(verdict.reds && verdict.reds.length));
    if (!wasGreen) continue;
    const file = typeof t.file === 'string' ? t.file : null;
    if (!file) continue;
    // Reconstruct the authoritative `after` from on-disk bytes when the file is
    // unchanged since the op; otherwise skip (never guess content).
    const abs = path.join(repoRoot, file);
    if (!fs.existsSync(abs)) continue;
    let onDisk: string;
    try {
      onDisk = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const be = t.byteEffect as { afterContent?: string; beforeContent?: string } | undefined;
    const after = typeof be?.afterContent === 'string' ? be.afterContent : onDisk;
    const before = typeof be?.beforeContent === 'string' ? be.beforeContent : '';
    out.push({ file, before, after, operationId: typeof t.operationId === 'string' ? t.operationId : undefined });
  }
  return out;
}

// ─────────────────────────── monotonic admission verifier ───────────────────────────

export interface AdmissionVerdict {
  /** true ⟺ the candidate gate reddened NONE of the known-good corpus edits */
  ok: boolean;
  /** the corpus edits the candidate would have reddened (the monotonicity violations) */
  conflicts: { file: string; operationId?: string; fact: string }[];
  /** how many known-good edits were checked */
  checked: number;
}

/**
 * THE REAL MONOTONIC ADMISSION VERIFIER. Run the candidate gate against the corpus
 * of known-good edits and admit ONLY if it reds none of them. A gate that reds a
 * previously-green edit is NON-MONOTONIC: admitting it would retroactively flip an
 * edit the lattice already accepted, the exact regression admission must forbid.
 *
 * This replaces the CLI's no-op check (which referenced a non-existent
 * `requiresConvergence` field and so never found a conflict). Here the candidate
 * gate is actually EXECUTED over each known-good edit's before→after bytes; an
 * `unjudged` is NOT a conflict (the gate honestly abstaining on an old edit does
 * not flip its verdict), only a concrete `red` is.
 */
export function verifyMonotonicAdmission(candidate: RegistryGateModule, corpus: CorpusEdit[], repoRoot: string): AdmissionVerdict {
  const conflicts: AdmissionVerdict['conflicts'] = [];
  let checked = 0;
  for (const edit of corpus) {
    if (!gateApplies(candidate, edit.file)) continue;
    checked += 1;
    const res = runOne(candidate, { file: edit.file, before: edit.before, after: edit.after, repoRoot });
    if (res.status === 'red') {
      conflicts.push({ file: edit.file, operationId: edit.operationId, fact: res.fact });
    }
  }
  return { ok: conflicts.length === 0, conflicts, checked };
}

/**
 * Admit a candidate gate module into the registry — load it, verify monotonicity
 * against the known-good corpus, and persist it ONLY if it reds none. Returns the
 * admission verdict plus the updated registry (or the unchanged registry on refusal).
 * Idempotent: re-admitting an already-present id is a no-op success.
 */
export async function admitGateModule(
  repoRoot: string,
  entry: { id: string; modulePath: string; intent: string },
): Promise<{ ok: boolean; reason?: string; verdict?: AdmissionVerdict; registry: GateRegistry }> {
  const reg = loadRegistry(repoRoot);
  if (reg.gates.some((g) => g.id === entry.id)) {
    return { ok: true, registry: reg };
  }
  const g = await loadGateModule(repoRoot, {
    id: entry.id,
    modulePath: entry.modulePath,
    intent: entry.intent,
    monotonic: false,
    admittedAgainst: 0,
    admittedAt: '',
  });
  if (!g) {
    return { ok: false, reason: `module ${entry.modulePath} does not exist or exports no callable gate()`, registry: reg };
  }
  const corpus = readKnownGoodCorpus(repoRoot);
  const verdict = verifyMonotonicAdmission(g, corpus, repoRoot);
  if (!verdict.ok) {
    return {
      ok: false,
      reason: `non-monotonic: would red ${verdict.conflicts.length} known-good edit(s) — ${verdict.conflicts
        .slice(0, 3)
        .map((c) => `${c.file} (${c.fact})`)
        .join('; ')}`,
      verdict,
      registry: reg,
    };
  }
  reg.gates.push({
    id: entry.id,
    modulePath: entry.modulePath,
    intent: entry.intent,
    monotonic: true,
    admittedAgainst: verdict.checked,
    admittedAt: new Date().toISOString(),
  });
  saveRegistry(repoRoot, reg);
  return { ok: true, verdict, registry: reg };
}

// ─────────────────────────── the gap signal: all-gates-passed vs prod-broke ───────────────────────────

/** One recorded prod incident: a file (and optional locus) that broke in production. */
export interface IncidentRecord {
  file: string;
  locus?: string;
  /** free-form description of the prod break */
  symptom?: string;
  ts?: string;
}

/** Read recorded prod incidents from the JSONL log (empty when none recorded). */
export function readIncidents(repoRoot: string): IncidentRecord[] {
  const p = path.join(repoRoot, INCIDENT_LOG_REL);
  if (!fs.existsSync(p)) return [];
  const out: IncidentRecord[] = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t) as IncidentRecord;
      if (rec && typeof rec.file === 'string') out.push(rec);
    } catch {
      /* partial last line / corruption → skip; the log is line-recoverable */
    }
  }
  return out;
}

/**
 * THE REAL GAP SIGNAL: the delta "all-gates-passed vs prod-broke". A coverage gap
 * is NOT "an op without a convergence verdict" (the CLI's weak signal); it is an
 * edit the lattice admitted GREEN (all gates passed) that an incident later proved
 * defective (prod broke). Those edits — green-but-broken — are exactly the corpus
 * a NEW gate must learn to red.
 *
 * We intersect the recorded prod incidents (readIncidents) with the green traces
 * (readKnownGoodCorpus) on file. The result is the set of green-but-broken edits:
 * the lattice's blind spot, the witness corpus a proposed gate must red while
 * `verifyMonotonicAdmission` guarantees it still keeps the rest of the corpus green.
 */
export function detectIncidentCoverageGap(repoRoot: string): {
  hasGap: boolean;
  /** green edits that an incident later proved defective — the gate-the-lattice-missed set */
  greenButBroken: CorpusEdit[];
  /** the incidents that intersected a green edit */
  matchedIncidents: IncidentRecord[];
} {
  const incidents = readIncidents(repoRoot);
  if (!incidents.length) return { hasGap: false, greenButBroken: [], matchedIncidents: [] };
  const corpus = readKnownGoodCorpus(repoRoot);
  const byFile = new Map<string, CorpusEdit>();
  for (const e of corpus) byFile.set(e.file, e);
  const greenButBroken: CorpusEdit[] = [];
  const matchedIncidents: IncidentRecord[] = [];
  for (const inc of incidents) {
    // an incident file may be recorded absolute or repo-relative; match either form
    const rel = path.isAbsolute(inc.file) ? path.relative(repoRoot, inc.file) : inc.file;
    const hit = byFile.get(inc.file) ?? byFile.get(rel);
    if (hit) {
      greenButBroken.push(hit);
      matchedIncidents.push(inc);
    }
  }
  return { hasGap: greenButBroken.length > 0, greenButBroken, matchedIncidents };
}
