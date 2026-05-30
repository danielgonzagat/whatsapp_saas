/**
 * gates/iac-reference-gate.ts — the exoneration-free IaC INTRA-CONFIG REFERENCE fact.
 *
 * Within a config closure (the changed Terraform/Kubernetes file set), every
 * DECLARED reference points at a symbol DEFINED somewhere in that same closure,
 * or it dangles. That is a FACT extractable from bytes — no `terraform plan`, no
 * `kubectl --dry-run`, no language server, no cloud. This module is the K8s/
 * Terraform analogue of connection-gate.ts: connection-gate asserts "a relative
 * import resolves"; this gate asserts "an intra-config infra reference resolves".
 *
 * Mutation-Firewall law (mirrored): this gate is PERCEPTION only. It LOCATES the
 * dangling reference (file + locus + fact); it never writes. No HCL/YAML
 * tree-sitter grammar ships in this repo (verified: zero tree-sitter-hcl /
 * tree-sitter-yaml under node_modules), so — exactly as the contract allows —
 * perception is a robust, reserved-prefix regex parser, not a guess.
 *
 * Semantics (universal, NEW-reference-only, exoneration-free):
 *  - CLOSURE = the changed IaC files of the SAME kind. A symbol DEFINED in any
 *    changed file of the closure satisfies a reference in any other (a real
 *    Terraform module / K8s app spans files). Definitions are gathered across the
 *    whole closure; references are judged only inside changedFiles.
 *  - NEW-reference-only: only references present in a file's NEW content but ABSENT
 *    from its prior on-disk content are this write's claim (mirrors
 *    connection-gate's beforeSpecs skip). A pre-existing dangle in a legacy file
 *    never blocks an unrelated edit — but no write may INTRODUCE one.
 *  - OUT OF SCOPE = green, mirroring bare-import handling. Terraform: a reference
 *    head that is NOT one of the three unambiguously file/module-local categories
 *    (var.* / local.* / module.*) — i.e. resource/data refs (may legitimately span
 *    files outside the changed set), provider-injected attributes, and builtins
 *    (path.*, count.*, each.*, self.*, terraform.*) — is not a fact we can assert
 *    from the closure's bytes alone. Kubernetes: a Service selector is judged ONLY
 *    when the closure contains ≥1 workload pod-template (so we know it is a
 *    self-contained app spec); a selector targeting a workload outside the closure
 *    is honestly out of scope, never red-by-guess.
 *  - CEILING (deferred to the dynamic/effect tier, NOT bytes): live-cloud
 *    existence — AMI ids, IAM roles/ARNs, image tags, CRD admission — needs
 *    `terraform plan` / `kubectl --dry-run=server`. This gate is `static` and never
 *    claims those; it asserts only the closed, byte-decidable intra-config edge.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';

// ─────────────────────────── applicability ───────────────────────────

const TF_RE = /\.tf$/;
const YAML_RE = /\.ya?ml$/;
/** A k8s manifest is unambiguously self-identified by an apiVersion + kind pair. */
const K8S_SNIFF_RE = /(^|\n)\s*apiVersion\s*:/;

// ─────────────────────────── Terraform ───────────────────────────

interface TfDefs {
  variables: Set<string>;
  locals: Set<string>;
  modules: Set<string>;
}

/** Collect Terraform definitions from one file body (block headers + locals keys). */
function collectTfDefs(body: string, into: TfDefs): void {
  // variable "NAME" {   /   module "NAME" {
  const blockRe = /\b(variable|module)\s+"([^"]+)"\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    (m[1] === 'variable' ? into.variables : into.modules).add(m[2]);
  }
  // locals { k = ...  (collect every top-level assigned key inside each locals block)
  const localsBlockRe = /\blocals\s*\{/g;
  let lm: RegExpExecArray | null;
  while ((lm = localsBlockRe.exec(body)) !== null) {
    const slice = sliceBalancedBlock(body, lm.index + lm[0].length - 1);
    for (const km of slice.matchAll(/(^|\n)\s*([A-Za-z_][A-Za-z0-9_-]*)\s*=/g)) {
      into.locals.add(km[2]);
    }
  }
}

/** Return the text inside the brace block whose opening `{` is at openIdx. */
function sliceBalancedBlock(body: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return body.slice(openIdx + 1, i);
    }
  }
  return body.slice(openIdx + 1); // unbalanced → take the rest (parser is robust, not strict)
}

/** Every var.* / local.* / module.* reference token in the body, with its 1-based line. */
function collectTfRefs(body: string): { kind: 'var' | 'local' | 'module'; name: string; token: string; line: number }[] {
  const out: { kind: 'var' | 'local' | 'module'; name: string; token: string; line: number }[] = [];
  // These three prefixes are RESERVED in HCL, so any occurrence is a reference,
  // not a coincidental identifier. `local` (singular) is the reference prefix.
  const refRe = /\b(var|local|module)\.([A-Za-z_][A-Za-z0-9_-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(body)) !== null) {
    out.push({
      kind: m[1] as 'var' | 'local' | 'module',
      name: m[2],
      token: m[0],
      line: lineOf(body, m.index),
    });
  }
  return out;
}

// ─────────────────────────── Kubernetes ───────────────────────────

interface K8sWorkload {
  labels: Map<string, string>;
}
interface K8sService {
  selector: Map<string, string>;
  selectorText: string;
  line: number;
}

const WORKLOAD_KINDS = new Set([
  'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'ReplicationController',
  'Job', 'CronJob', 'Pod',
]);

/** Split a YAML stream into documents on `---` separators (line-anchored). */
function splitYamlDocs(body: string): string[] {
  return body.split(/(?:^|\n)---[ \t]*(?:\n|$)/);
}

function yamlKind(doc: string): string | null {
  const m = doc.match(/(^|\n)\s*kind\s*:\s*["']?([A-Za-z]+)["']?/);
  return m ? m[2] : null;
}

/**
 * Extract the label/selector map that lives under `<anchor>:` (e.g. `selector:` or
 * `labels:`) as a block of `key: value` pairs more-indented than the anchor.
 * Reserved YAML wrappers under selector (matchLabels) are unwrapped.
 */
function extractMapUnder(doc: string, anchorRe: RegExp): Map<string, string> {
  const m = anchorRe.exec(doc);
  if (!m) return new Map();
  const lines = doc.slice(m.index).split('\n');
  const anchorIndent = (lines[0].match(/^\s*/)?.[0].length) ?? 0;
  const map = new Map<string, string>();
  for (let i = 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    const indent = (raw.match(/^\s*/)?.[0].length) ?? 0;
    if (indent <= anchorIndent) break; // dedented out of the block
    const kv = raw.match(/^\s*([A-Za-z0-9_.\/-]+)\s*:\s*(.*?)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].replace(/^["']|["']$/g, '');
    if (key === 'matchLabels') continue; // wrapper line; its children are the labels
    if (val === '' || val === '{}') continue; // nested wrapper (e.g. selector: \n matchLabels:)
    map.set(key, val);
  }
  return map;
}

function collectK8sFromDoc(doc: string, workloads: K8sWorkload[], services: K8sService[], baseBody: string, docStart: number): void {
  const kind = yamlKind(doc);
  if (!kind) return;
  if (WORKLOAD_KINDS.has(kind)) {
    // Pod template labels (spec.template.metadata.labels) for controllers; for a
    // bare Pod, metadata.labels. Capture every `labels:` map in the doc — a
    // selector only needs to be a subset of SOME pod-template label set.
    for (const lm of doc.matchAll(/(^|\n)\s*labels\s*:/g)) {
      const labels = extractMapUnder(doc.slice(lm.index), /labels\s*:/);
      if (labels.size > 0) workloads.push({ labels });
    }
  } else if (kind === 'Service') {
    const selM = /(^|\n)(\s*)selector\s*:/.exec(doc);
    if (!selM) return;
    const selector = extractMapUnder(doc.slice(selM.index), /selector\s*:/);
    if (selector.size === 0) return; // empty/headless selector → nothing to assert
    services.push({
      selector,
      selectorText: [...selector.entries()].sort().map(([k, v]) => `${k}=${v}`).join(','),
      line: lineOf(baseBody, docStart + selM.index),
    });
  }
}

/** A selector resolves iff SOME workload's label map is a superset of it. */
function selectorMatched(selector: Map<string, string>, workloads: K8sWorkload[]): boolean {
  return workloads.some((w) =>
    [...selector.entries()].every(([k, v]) => w.labels.get(k) === v),
  );
}

// ─────────────────────────── shared ───────────────────────────

function lineOf(body: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < body.length; i += 1) if (body[i] === '\n') line += 1;
  return line;
}

/** Prior on-disk content of a changed file (bypasses overlay) — for NEW-ref diffing. */
function priorContent(ctx: GateContext, rel: string): string {
  // overlay holds the NEW text; we want the PRIOR bytes. Read disk directly, as the
  // byte-floor connection gate does. Missing file → brand-new → '' (every ref new).
  try {
    return fs.readFileSync(path.join(ctx.repoRoot, rel), 'utf8');
  } catch {
    return '';
  }
}

// ─────────────────────────── the gate ───────────────────────────

const iacReferenceGate: GateModule = {
  name: 'iac-reference',
  kind: 'static',
  appliesTo(rel: string): boolean {
    return TF_RE.test(rel) || YAML_RE.test(rel);
  },
  run(ctx: GateContext): GateResult {
    const note =
      'every intra-config infra reference (Terraform var/local/module; K8s Service selector → workload labels) resolves within the changed closure';
    const reds: GateRed[] = [];

    // ── partition the changed closure by kind ──
    const tfFiles: string[] = [];
    const k8sFiles: string[] = [];
    for (const rel of ctx.changedFiles) {
      if (TF_RE.test(rel)) {
        tfFiles.push(rel);
      } else if (YAML_RE.test(rel)) {
        const body = ctx.readFile(rel);
        if (body !== null && K8S_SNIFF_RE.test(body) && /(^|\n)\s*kind\s*:/.test(body)) k8sFiles.push(rel);
      }
    }

    // ── Terraform closure ──
    if (tfFiles.length > 0) {
      const defs: TfDefs = { variables: new Set(), locals: new Set(), modules: new Set() };
      for (const rel of tfFiles) {
        const body = ctx.readFile(rel);
        if (body !== null) collectTfDefs(body, defs);
      }
      for (const rel of tfFiles) {
        const body = ctx.readFile(rel);
        if (body === null) continue;
        const before = new Set(collectTfRefs(priorContent(ctx, rel)).map((r) => r.token));
        for (const ref of collectTfRefs(body)) {
          if (before.has(ref.token)) continue; // not this write's claim
          const universe =
            ref.kind === 'var' ? defs.variables : ref.kind === 'local' ? defs.locals : defs.modules;
          if (!universe.has(ref.name)) {
            const decl = ref.kind === 'var' ? 'variable' : ref.kind === 'module' ? 'module' : 'local';
            reds.push({
              file: rel,
              locus: `L${ref.line}`,
              fact: `${ref.token} references no ${decl} defined in the changed Terraform closure`,
            });
          }
        }
      }
    }

    // ── Kubernetes closure ──
    if (k8sFiles.length > 0) {
      const workloads: K8sWorkload[] = [];
      const docsByFile = new Map<string, { services: K8sService[]; body: string }>();
      for (const rel of k8sFiles) {
        const body = ctx.readFile(rel);
        if (body === null) continue;
        const services: K8sService[] = [];
        let cursor = 0;
        for (const doc of splitYamlDocs(body)) {
          collectK8sFromDoc(doc, workloads, services, body, cursor);
          cursor += doc.length + 4; // approx advance past the doc + "\n---\n"
        }
        docsByFile.set(rel, { services, body });
      }
      // Exoneration-free guard: only assert the selector→workload edge when the
      // closure actually CONTAINS a workload pod-template. With zero workloads the
      // target is plausibly defined outside the changed set → honestly out of scope.
      if (workloads.length > 0) {
        for (const [rel, { services, body }] of docsByFile) {
          const before = priorContent(ctx, rel);
          const beforeSelectors = new Set<string>();
          for (const doc of splitYamlDocs(before)) {
            const tmpWorkloads: K8sWorkload[] = [];
            const tmpServices: K8sService[] = [];
            collectK8sFromDoc(doc, tmpWorkloads, tmpServices, before, 0);
            for (const s of tmpServices) beforeSelectors.add(s.selectorText);
          }
          for (const svc of services) {
            if (beforeSelectors.has(svc.selectorText)) continue; // unchanged selector — not this write's claim
            if (!selectorMatched(svc.selector, workloads)) {
              reds.push({
                file: rel,
                locus: `L${svc.line}`,
                fact: `Service selector {${svc.selectorText}} matches no workload pod-template labels in the changed K8s closure`,
              });
            }
          }
        }
      }
    }

    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default iacReferenceGate;
