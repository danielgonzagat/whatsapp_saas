#!/usr/bin/env node
// Render the CURATED, severity-tagged DUPLICATION_REGISTER.md from the consolidated
// inventory digest (inventory/_CONSOLIDATED.json .duplications[]), preserving the
// auto-generated same-name-export scan (produced by scan.mjs) as Appendix A.
//
// Why this exists: scan.mjs/scan-writers.mjs only emit a mechanical top-100 same-name
// export table — it carries NO P0–P3 severity, canonical choice, or migration sketch.
// The 55-ish curated entries the architecture index + MIGRATION_PLAYBOOK reference live
// ONLY in _CONSOLIDATED.json. This renderer makes the published doc HONEST: curated
// register leads, mechanical scan is a clearly-labelled appendix.
//
// Pure read → stdout. Does not write files (so it never blind-overwrites a hand edit).
// Usage: node tools/canonicalize/render-duplication-register.mjs > docs/architecture/DUPLICATION_REGISTER.md

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCH = join(HERE, '..', '..', 'docs', 'architecture');
const CONSOLIDATED = join(ARCH, 'inventory', '_CONSOLIDATED.json');
const EXISTING_REGISTER = join(ARCH, 'DUPLICATION_REGISTER.md');

const digest = JSON.parse(readFileSync(CONSOLIDATED, 'utf8'));
const dups = digest.duplications ?? [];

const bySev = { P0: [], P1: [], P2: [], P3: [] };
for (const x of dups) (bySev[x.severity] ?? (bySev[x.severity] = [])).push(x);
const counts = {
  P0: bySev.P0.length,
  P1: bySev.P1.length,
  P2: bySev.P2.length,
  P3: bySev.P3.length,
};
const total = dups.length;

const sevTitle = {
  P0: 'live revenue / identity / security defect',
  P1: 'structural duplication / open merge decision',
  P2: 'drift hazard / dead-or-bypass surface',
  P3: 'cosmetic / naming entropy',
};

// Preserve the auto-generated same-name-export scan as Appendix A.
let autoTotal = '?';
let autoTable = '_(scan output unavailable — run `node tools/canonicalize/scan.mjs`)_';
try {
  const reg = readFileSync(EXISTING_REGISTER, 'utf8');
  // Match BOTH the raw scan-writers.mjs wording ("Total cross-file duplicates: N")
  // and this renderer's own reframed Appendix-A wording ("Total cross-file same-name
  // exports: N") so re-running on an already-rendered register stays idempotent.
  const m = reg.match(/Total cross-file (?:duplicates|same-name exports): (\d+)/);
  if (m) autoTotal = m[1];
  const lines = reg.split('\n');
  const tStart = lines.findIndex((l) => l.startsWith('| Exported name'));
  if (tStart >= 0) autoTable = lines.slice(tStart).join('\n').trimEnd();
} catch {
  /* first-ever render: no prior scan to preserve */
}

const lastValidated = digest._meta?.generatedAt ?? new Date().toISOString().slice(0, 10);

const out = [];
const p = (s = '') => out.push(s);

p('# Kloel Duplication Register');
p('');
p('> The exhaustive, **severity-tagged** register of every structural duplication in the Kloel');
p('> monorepo. Each entry carries `file:line` / `schema:line` refs, the **canonical choice**, and a');
p('> numbered **migration sketch**. This curated register is the doc the architecture index and');
p('> [`MIGRATION_PLAYBOOK.md`](./MIGRATION_PLAYBOOK.md) refer to — the auto-generated same-name-export');
p('> scan is preserved as **Appendix A** at the bottom, not the body.');
p('');
p('> **Source of truth:** [`inventory/_CONSOLIDATED.json`](./inventory/_CONSOLIDATED.json) `.duplications[]`');
p('> (severity-tagged digest of the 7 `inventory/*.json` clusters). Every name is grep/AST-verified');
p('> against `backend/prisma/schema.prisma`, `backend/src/**`, and the separate `worker/**` deployable.');
p('> No invented names. **Regenerate:** `node tools/canonicalize/render-duplication-register.mjs > docs/architecture/DUPLICATION_REGISTER.md`.');
p(`> **Last validated:** ${lastValidated}.`);
p('');

p('## Counts');
p('');
p(`**${total} entries: ${counts.P0} P0 · ${counts.P1} P1 · ${counts.P2} P2 · ${counts.P3} P3.**`);
p('');
p('| Severity | Meaning | Count |');
p('|---|---|---:|');
p(`| P0 | ${sevTitle.P0} | ${counts.P0} |`);
p(`| P1 | ${sevTitle.P1} | ${counts.P1} |`);
p(`| P2 | ${sevTitle.P2} | ${counts.P2} |`);
p(`| P3 | ${sevTitle.P3} | ${counts.P3} |`);
p(`| **Total** | | **${total}** |`);
p('');

p('## How to read an entry');
p('');
p('Each entry is `### [SEV.n] (family) concept`, followed by:');
p('- **Implementations** — every concrete surface (model `schema:line`, service/file `file:line`); the one tagged `[canonical]` is the keep.');
p('- **Canonical choice** — the single surface every other implementation must converge onto.');
p('- **Migration sketch** — the numbered additive→dual-write→backfill→parity→flip→retire steps.');
p('');
p('For the data-bearing families (money ledgers, person identity, message/memory stores, auth, channel');
p('transport) the *staged, human-in-the-loop* migration plan lives in');
p('[`MIGRATION_PLAYBOOK.md`](./MIGRATION_PLAYBOOK.md); this register is the catalog, the playbook is the runbook.');
p('');

for (const sev of ['P0', 'P1', 'P2', 'P3']) {
  const list = bySev[sev] ?? [];
  p('---');
  p('');
  p(`## ${sev} — ${sevTitle[sev]} (${list.length})`);
  p('');
  let n = 0;
  for (const x of list) {
    n += 1;
    p(`### [${sev}.${n}] (${x.family}) ${x.concept}`);
    p('');
    const clusters = (x.sourceClusters ?? []).map((c) => `\`inventory/${c}.json\``).join(', ');
    p(`**Family:** \`${x.family}\`  ·  **Evidence cluster:** ${clusters || '—'}`);
    p('');
    p('**Implementations:**');
    p('');
    for (const i of x.implementations ?? []) p(`- ${i}`);
    p('');
    p(`**Canonical choice:** ${x.canonicalChoice}`);
    p('');
    p(`**Migration sketch:** ${x.migrationSketch}`);
    p('');
  }
}

// ── P0 verification log ──────────────────────────────────────────────────────
// Referenced by MIGRATION_PLAYBOOK.md and RUNBOOK_ACTIVATION.md as living HERE.
p('---');
p('');
p('## P0 verification log');
p('');
p('> Referenced by [`MIGRATION_PLAYBOOK.md`](./MIGRATION_PLAYBOOK.md) and');
p('> [`RUNBOOK_ACTIVATION.md`](./RUNBOOK_ACTIVATION.md). The **surgical** P0s — the ones safe to fix in a');
p('> single guarded edit, with no data migration — are landed and grep-verified against source. The');
p('> **data-bearing** P0s remain *plan-only* (their staged plans live in the playbook); flipping them');
p('> requires the additive→dual-write→backfill→parity→flip→retire sequence and human sign-off.');
p('');
p('| P0 | Class | State | Evidence |');
p('|---|---|---|---|');
p('| P0.3 | raw-phone payment-link lookup (lost revenue) | **FIXED (surgical)** | `kloel-lead-processor.service.ts:329` now keys the lookup on `normalizePhone(senderPhone)?.digits \\|\\| senderPhone`, matching `getOrCreateLead`; the comment at :323-329 documents the prior raw-`senderPhone` bug. |');
p('| P0.8 | 4-way tenant-resolver IDOR fork | **PARTIAL** | `partnerships.controller.ts:51` already converged onto the secure `resolveWorkspaceId` (`auth/workspace-access`); `kloel-security.guard` + `product-sub-resources/helpers/common.helpers` still on the unsafe variants — converge them next, following the partnerships pattern. |');
p('| P0.1 | Sale/Order/Payment 3-table split | **Plan only** | See `MIGRATION_PLAYBOOK.md` → *sale-payment*. Atomicity steps not yet executed; one `$transaction` per webhook still pending. |');
p('| P0.2 | phone-normalization identity fragmentation | **Plan only** | See `MIGRATION_PLAYBOOK.md` → *contact-identity*. Step 1 (normalize at every Contact/KloelLead write) is the master dependency. |');
p('| P0.4 | Plan-price money-unit split | **Plan only** | See `MIGRATION_PLAYBOOK.md` → *product-plan-offer*. `CheckoutProductPlan.priceInCents` is already the only order-time reader; `ProductPlan` writers do not yet dual-write. |');
p('| P0.5 | Coupon validate divergence | **Plan only** | `ProductCouponController.validate` not yet delegated to `validateCouponHelper`; a one-way Float→cents sync exists. |');
p('| P0.6 | 3× cognitive loop (one persists nothing) | **Plan only** | See `MIGRATION_PLAYBOOK.md` → *mind-core*. `MindPredictionService` still in-memory + `RAC_AutopilotEvent`. |');
p('| P0.7 | logout-blacklist namespace mismatch | **Plan only** | `AuthService.logout` still writes the dead `access-token-revoked:<jti>` key; repoint to `AuthTokenService.revokeAccessToken`. |');
p('');

// ── Appendix A — mechanical scan ─────────────────────────────────────────────
p('---');
p('');
p('## Appendix A — auto-generated same-name-export scan');
p('');
p('> Generated by [`tools/canonicalize/scan.mjs`](../../tools/canonicalize/scan.mjs) → `scan-writers.mjs`.');
p('> This is a **purely mechanical** cross-file scan of symbols (classes, interfaces, types, functions)');
p('> exported under the **same name from more than one file**. It is a *signal* feeding the curated');
p('> register above, **not** a severity assessment: a shared `GET`/`POST` route handler or a `clamp`');
p('> util is expected, not a defect. Use the curated body above for prioritization; use this table to');
p('> spot newly-introduced name collisions. Regenerate non-destructively with');
p('> `CANON_OUT_DIR=/tmp/canon node tools/canonicalize/scan.mjs`.');
p('');
p(`Total cross-file same-name exports: ${autoTotal}. Sorted by fan-out (most-duplicated first).`);
p('');
p('### Top 100 same-name exports');
p('');
p(autoTable);

process.stdout.write(out.join('\n') + '\n');
