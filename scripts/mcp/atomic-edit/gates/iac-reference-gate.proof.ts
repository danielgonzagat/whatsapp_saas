/**
 * iac-reference-gate.proof.ts — standalone tsx proof for the IaC reference gate.
 *
 * Run:  npx tsx scripts/mcp/atomic-edit/gates/iac-reference-gate.proof.ts
 *
 * It builds overlay/changedFiles fixtures, calls makeContext(...) then the gate's
 * run(ctx), and asserts the exoneration-free invariant in five resolving cases:
 *   RED1  Terraform: a NEW `var.region` reference whose `variable "region"` is
 *         NOT defined anywhere in the changed closure → dangling intra-config ref.
 *   GREEN1 Terraform: same ref, but `variable "region"` IS defined in a sibling
 *         changed .tf (closure-wide resolution) → resolves.
 *   RED2  Kubernetes: a NEW Service selector {app=api} with a Deployment present
 *         in the closure whose pod-template labels are {app=web} → no match → dangle.
 *   GREEN2 Kubernetes: selector {app=api} with a Deployment labelled {app=api} →
 *         the Service→workload edge resolves.
 *   GREEN3 (NEW-reference-only / out-of-scope): a pre-existing dangling var ref on
 *         disk is NOT this write's claim; and `path.module` / a bare resource ref
 *         are out of scope → green. Proves no red-by-guess.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext } from './contract.js';
import gate from './iac-reference-gate.js';

let failed = false;
function check(label: string, cond: boolean): void {
  // eslint-disable-next-line no-console
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${label}`);
  if (!cond) failed = true;
}

// A throwaway repoRoot so the gate's prior-content disk read is deterministic.
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-gate-proof-'));

// ──────────────────────────── RED1 — Terraform dangling var ────────────────────────────
{
  const main = [
    'resource "aws_instance" "web" {',
    '  ami           = "ami-123"',
    '  instance_type = var.instance_type', // defined below → resolves
    '  availability_zone = var.region',    // NOT defined anywhere → DANGLES
    '}',
  ].join('\n');
  const vars = 'variable "instance_type" {\n  type = string\n}\n';
  const overlay = new Map<string, string>([
    ['infra/main.tf', main],
    ['infra/variables.tf', vars],
  ]);
  const ctx = makeContext(repoRoot, overlay, ['infra/main.tf', 'infra/variables.tf']);
  const res = gate.run(ctx) as ReturnType<typeof gate.run> & { reds: { fact: string; file: string }[] };
  const r = res as { green: boolean; reds: { fact: string; file: string; locus?: string }[] };
  check('RED1 terraform: gate is RED on dangling var.region', r.green === false);
  check('RED1 terraform: red names var.region', r.reds.some((x) => x.fact.includes('var.region')));
  check('RED1 terraform: var.instance_type (defined) is NOT reddened', !r.reds.some((x) => x.fact.includes('var.instance_type')));
  // eslint-disable-next-line no-console
  if (r.reds[0]) console.log(`      GateRed → ${r.reds[0].file}:${r.reds[0].locus} — ${r.reds[0].fact}`);
}

// ──────────────────────────── GREEN1 — Terraform resolved across closure ────────────────────────────
{
  const main = 'resource "aws_instance" "web" {\n  availability_zone = var.region\n}\n';
  const vars = 'variable "region" {\n  default = "us-east-1"\n}\n'; // defined in sibling changed file
  const overlay = new Map<string, string>([
    ['infra/main.tf', main],
    ['infra/variables.tf', vars],
  ]);
  const ctx = makeContext(repoRoot, overlay, ['infra/main.tf', 'infra/variables.tf']);
  const r = gate.run(ctx) as { green: boolean; reds: unknown[] };
  check('GREEN1 terraform: gate is GREEN when var.region IS defined in the closure', r.green === true && r.reds.length === 0);
}

// ──────────────────────────── RED2 — Kubernetes selector dangles ────────────────────────────
{
  const manifest = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web',
    'spec:',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: web', // workload is app=web
    '---',
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: api-svc',
    'spec:',
    '  selector:',
    '    app: api', // selects app=api → NO workload matches → DANGLES
  ].join('\n');
  const overlay = new Map<string, string>([['k8s/app.yaml', manifest]]);
  const ctx = makeContext(repoRoot, overlay, ['k8s/app.yaml']);
  const r = gate.run(ctx) as { green: boolean; reds: { fact: string; file: string; locus?: string }[] };
  check('RED2 k8s: gate is RED on Service selector with no matching workload', r.green === false);
  check('RED2 k8s: red names the selector app=api', r.reds.some((x) => x.fact.includes('app=api')));
  // eslint-disable-next-line no-console
  if (r.reds[0]) console.log(`      GateRed → ${r.reds[0].file}:${r.reds[0].locus} — ${r.reds[0].fact}`);
}

// ──────────────────────────── GREEN2 — Kubernetes selector resolves ────────────────────────────
{
  const manifest = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: api',
    'spec:',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: api',     // workload app=api
    '        tier: backend',
    '---',
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: api-svc',
    'spec:',
    '  selector:',
    '    app: api',         // subset of the workload labels → resolves
  ].join('\n');
  const overlay = new Map<string, string>([['k8s/api.yaml', manifest]]);
  const ctx = makeContext(repoRoot, overlay, ['k8s/api.yaml']);
  const r = gate.run(ctx) as { green: boolean; reds: unknown[] };
  check('GREEN2 k8s: gate is GREEN when a workload label-set is a superset of the selector', r.green === true && r.reds.length === 0);
}

// ──────────────────────────── GREEN3 — NEW-ref-only + out-of-scope (no red-by-guess) ────────────────────────────
{
  // Plant a PRE-EXISTING dangling var ref on disk; the write does not change that line.
  const prior = 'resource "aws_s3_bucket" "b" {\n  bucket = var.legacy_dangler\n}\n';
  const rel = 'infra/legacy.tf';
  fs.mkdirSync(path.join(repoRoot, 'infra'), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, rel), prior, 'utf8');
  // New content keeps the same (still-dangling) line untouched, adds only
  // out-of-scope references: path.module (builtin) and a bare resource ref.
  const next =
    prior +
    'resource "aws_s3_bucket_policy" "p" {\n  bucket = aws_s3_bucket.b.id\n  policy = file("${path.module}/policy.json")\n}\n';
  const overlay = new Map<string, string>([[rel, next]]);
  const ctx = makeContext(repoRoot, overlay, [rel]);
  const r = gate.run(ctx) as { green: boolean; reds: { fact: string }[] };
  check('GREEN3: pre-existing dangle is NOT this write\'s claim (NEW-ref-only)', !r.reds.some((x) => x.fact.includes('legacy_dangler')));
  check('GREEN3: path.module / bare resource ref are out of scope → no red-by-guess', r.green === true && r.reds.length === 0);
}

// ──────────────────────────── GREEN4 — comment-embedded refs no longer FP (the rewrite's point) ────────────────────────────
{
  // Terraform: var.* refs that live ONLY inside #, //, and /* */ comments. Pre-rewrite
  // these whole-file-regex matched and reddened (proven by hand: 3 spurious reds). After
  // composing blankComments + blankHashComments, the comment text is whitespace → no ref
  // is extracted → GREEN. A real, NON-commented var.real with its variable defined stays green.
  const main = [
    'variable "real" {',
    '  type = string',
    '}',
    'resource "aws_instance" "web" {',
    '  # availability_zone = var.ghost_in_hash      <- HCL # comment',
    '  // instance_type   = var.ghost_in_slash      <- HCL // comment',
    '  /* legacy: var.ghost_in_block */',
    '  region = var.real',
    '}',
  ].join('\n');
  const overlay = new Map<string, string>([['infra/comments.tf', main]]);
  const ctx = makeContext(repoRoot, overlay, ['infra/comments.tf']);
  const r = gate.run(ctx) as { green: boolean; reds: { fact: string }[] };
  check('GREEN4 tf: a # comment-embedded var ref is NOT extracted (was a FP)', !r.reds.some((x) => x.fact.includes('ghost_in_hash')));
  check('GREEN4 tf: a // comment-embedded var ref is NOT extracted (was a FP)', !r.reds.some((x) => x.fact.includes('ghost_in_slash')));
  check('GREEN4 tf: a /* */ comment-embedded var ref is NOT extracted (was a FP)', !r.reds.some((x) => x.fact.includes('ghost_in_block')));
  check('GREEN4 tf: gate is GREEN (only real var.real, which is defined)', r.green === true && r.reds.length === 0);
}

// ──────────────────────────── GREEN5 — K8s: a selector in a YAML # comment is not real config ────────────────────────────
{
  // A real Deployment app=web + Service selector app=web → resolves; a SECOND
  // "service" with selector app=ghost lives entirely inside YAML # comments, so it must
  // NOT be extracted as a real Service → no spurious dangling-selector red.
  const manifest = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: web',
    'spec:',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: web',
    '---',
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    '  name: web-svc',
    'spec:',
    '  selector:',
    '    app: web          # resolves to the Deployment above',
    '# kind: Service        <- commented-out example, not real',
    '# spec:',
    '#   selector:',
    '#     app: ghost       <- would dangle IF extracted; it must not be',
  ].join('\n');
  const overlay = new Map<string, string>([['k8s/commented.yaml', manifest]]);
  const ctx = makeContext(repoRoot, overlay, ['k8s/commented.yaml']);
  const r = gate.run(ctx) as { green: boolean; reds: { fact: string }[] };
  check('GREEN5 k8s: a # comment-embedded selector is NOT extracted (was a FP)', !r.reds.some((x) => x.fact.includes('app=ghost')));
  check('GREEN5 k8s: gate is GREEN (the only real selector app=web resolves)', r.green === true && r.reds.length === 0);
}

// ──────────────────────────── CEILING — a ref inside a real STRING literal is the documented residual ────────────────────────────
{
  // HONEST DEGRADE LIMIT: strings are deliberately PRESERVED (a Terraform interpolation
  // legitimately lives in a string), so a `var.x` token textually present inside a string
  // literal STILL matches the reserved-prefix regex. Only a real HCL tree-sitter grammar
  // (distinguishing a `string` node from a `reference` node) removes this last FP. This
  // proof ASSERTS the ceiling exists, rather than pretending it is gone.
  const main = 'output "note" {\n  value = "see var.documented_residual for details"\n}\n';
  const overlay = new Map<string, string>([['infra/str.tf', main]]);
  const ctx = makeContext(repoRoot, overlay, ['infra/str.tf']);
  const r = gate.run(ctx) as { green: boolean; reds: { fact: string }[] };
  check('CEILING: a var ref inside a STRING literal still matches — documented residual (needs HCL grammar)', r.reds.some((x) => x.fact.includes('documented_residual')));
}

// ──────────────────────────── cleanup ────────────────────────────
try {
  fs.rmSync(repoRoot, { recursive: true, force: true });
} catch {
  /* best-effort */
}

// eslint-disable-next-line no-console
console.log(failed ? '\nPROOF FAIL' : '\nPROOF PASS');
process.exit(failed ? 1 : 0);
