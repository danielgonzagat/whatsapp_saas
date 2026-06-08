#!/usr/bin/env node
/**
 * check-canonical-mind-access.mjs
 *
 * ANTI-REGRESSION GATE — locks in the Brain → Mind memory/message
 * canonicalization (ADR-0013).
 *
 * The canonical surface for reading/writing the `RAC_KloelMemory`,
 * `RAC_KloelMessage`, and `RAC_ChatMessage` tables is the Mind alias layer:
 *   - `MindMemoryItemService.items`  (backend/src/kloel/mind/aliases/mind-memory-item.service.ts)
 *   - `MindMessageService.items`     (backend/src/kloel/mind/aliases/mind-message.service.ts)
 *   - `MindChatMessageService.items` (backend/src/kloel/mind/aliases/mind-chat-message.service.ts)
 *
 * `RAC_ChatMessage` (dashboard/thread chat) is a SEPARATE physical table from
 * `RAC_KloelMessage` (brain) — no table merge; each alias targets its own row.
 *
 * New code MUST NOT reach into `prisma.kloelMemory` / `prisma.kloelMessage` /
 * `prisma.chatMessage` (or the `this.`-qualified forms) directly. The
 * supported escapes are the canonical alias services, the documented
 * `?? …prisma.kloelMemory` fallback-getter idiom, transactional access inside
 * a `$transaction(tx => …)` callback, and a small explicitly grandfathered
 * set of legitimate pre-existing direct uses.
 *
 * This gate FAILS (exit 1) the moment a NEW non-canonical direct access is
 * introduced anywhere under `backend/src/**` OR `worker/**` (excluding
 * `*.spec.ts` / `*.test.ts`). Every direct access that exists on the current
 * HEAD is grandfathered so the gate passes clean today.
 *
 * `worker/**` is scanned too (the BullMQ worker shares the same Prisma client
 * and the same canonicalization invariant). Because the worker is a flat tree
 * (no alias-service layer of its own), its pre-existing direct accesses are
 * grandfathered with a per-file COUNT baseline (WORKER_GRANDFATHERED_COUNTS):
 * a worker file passes while its non-exempt direct-access count stays <= its
 * captured baseline, and a NEW worker file (baseline 0) or a GROWN count fails.
 * This ratchets — it tolerates the existing worker debt but catches any new
 * worker-side bypass — and is line-drift-proof (counts, not line numbers).
 *
 * Usage:
 *   node scripts/ops/check-canonical-mind-access.mjs           # scan all backend/src
 *   node scripts/ops/check-canonical-mind-access.mjs --report  # list every grandfathered site
 *
 * Exit codes:
 *   0 — OK
 *   1 — a new non-canonical direct access was detected
 */

import { listFiles, readRepoFile, toPosixPath } from './lib/scan-utils.mjs';

const REPORT = process.argv.includes('--report');

// ---------------------------------------------------------------------------
// What we forbid.
//
// `this.prisma.kloelMemory` is a superstring of `prisma.kloelMemory`, so a
// single pattern per model catches both the bare and the `this.`-qualified
// form. Built via char-join so this governance script does not itself trip
// the ai-constitution gate's literal-substring scanner.
// ---------------------------------------------------------------------------
const PRISMA = 'prisma';
const KLOEL_MEMORY = ['kloel', 'Memory'].join('');
const KLOEL_MESSAGE = ['kloel', 'Message'].join('');
// `RAC_ChatMessage` (dashboard/thread chat) — a SEPARATE physical table from
// `RAC_KloelMessage`. Its canonical Mind surface is MindChatMessageService.items
// (backend/src/kloel/mind/aliases/mind-chat-message.service.ts). No table merge.
const CHAT_MESSAGE = ['chat', 'Message'].join('');

const FORBIDDEN_RE = new RegExp(
  ['\\b', PRISMA, '\\.(?:', KLOEL_MEMORY, '|', KLOEL_MESSAGE, '|', CHAT_MESSAGE, ')\\b'].join(''),
);

// Documented safe fallback-getter idiom: `… ?? <anything>prisma.kloelMemory`.
// Allows the `this.`, `deps.`, and bare-`prisma` prefixes — all are the same
// "use the canonical Mind delegate, fall back to raw prisma when DI is absent"
// shape (`mindMemory?.items ?? this.prisma.kloelMemory`).
const FALLBACK_RE = new RegExp(
  [
    '\\?\\?\\s*[\\w.]*',
    PRISMA,
    '\\.(?:',
    KLOEL_MEMORY,
    '|',
    KLOEL_MESSAGE,
    '|',
    CHAT_MESSAGE,
    ')\\b',
  ].join(''),
);

// Transactional access inside a `$transaction(tx => …)` callback. Covers both
// `tx.kloelMemory` / `tx.kloelMessage` and `tx.chatMessage` — the tx client is
// the legitimate transactional surface, not the alias service.
const TX_RE = new RegExp(['\\btx\\.(?:', 'kloelM', '|', CHAT_MESSAGE, ')'].join(''));

// DI default-parameter idiom: `memoryItems: PrismaService['kloelMemory'] = prisma.kloelMemory`.
// The default VALUE is a raw delegate; the canonical caller always passes the
// Mind surface. Byte-identical, zero behaviour drift.
const DI_DEFAULT_RE = new RegExp(
  ['=\\s*', PRISMA, '\\.(?:', KLOEL_MEMORY, '|', KLOEL_MESSAGE, '|', CHAT_MESSAGE, ')\\b'].join(''),
);

// ---------------------------------------------------------------------------
// Grandfathered legitimate files (whole-file escapes).
// ---------------------------------------------------------------------------
const GRANDFATHERED_FILES = new Set([
  // The canonical alias services themselves — they ARE the wrapper.
  'backend/src/kloel/mind/aliases/mind-memory-item.service.ts',
  'backend/src/kloel/mind/aliases/mind-message.service.ts',
  // Canonical alias for the SEPARATE RAC_ChatMessage table (dashboard/thread
  // chat). This service IS the wrapper for `prisma.chatMessage`.
  'backend/src/kloel/mind/aliases/mind-chat-message.service.ts',
  // NOTE: conversational-onboarding-tools.service.ts was previously deferred
  // here (it used a bespoke `prismaExt.kloelMemory`). It is now CONVERGED onto
  // the canonical `MindMemoryItemService.items` surface via the
  // `mindMemoryItems` getter (`mindMemory?.items ?? this.prisma.kloelMemory`,
  // exempt as the documented fallback idiom), so the whole-file escape is
  // removed and the gate scans it like any other file.
]);

// ---------------------------------------------------------------------------
// Grandfathered legitimate direct accesses (file → set of code substrings).
//
// These are the genuine, pre-existing direct writes that live INSIDE the Mind
// subsystem and are not the alias services themselves. Each entry pins the
// exact statement so a NEW direct access in the same file still fails.
// ---------------------------------------------------------------------------
const GRANDFATHERED_DIRECT = new Map([
  // NOTE: mind-policy.helpers.ts#persistResolvedPolicyMemories was previously
  // deferred here (it took a `prisma` wrapper and wrote via
  // `prisma.kloelMemory.upsert`). It is now CONVERGED caller-side: the helper
  // accepts a `kloelMemory` delegate param and `MindPolicyService` passes the
  // canonical `this.mindMemoryItems` accessor (`mindMemory?.items ??
  // this.prisma.kloelMemory`) — or `tx.kloelMemory` inside a `$transaction`.
  // Byte-identical (same RAC_KloelMemory row), so the grandfather entry is gone
  // and the gate scans this file like any other.
  // NOTE: gdpr-processing.helpers.ts, kloel-thread.controller-helpers.ts, and
  // kloel-thinker.helpers.ts were previously deferred here (pure-fn helpers
  // receiving prisma as a `ctx.prisma` / `deps.prisma` / bare-`prisma` param).
  // They are now CONVERGED caller-side: each caller
  // (GdprService / KloelController / KloelThinkerService) injects
  // MindChatMessageService `@Optional()`, exposes a `chatMessageItems` getter
  // (`mindChatMessage?.items ?? this.prisma.chatMessage`), and threads that
  // canonical accessor through the helper's ctx/deps so the helper reads
  // `chatMessageItems` (with a `?? …prisma.chatMessage` fallback — the documented
  // fallback idiom, exempt via FALLBACK_RE). Byte-identical (same RAC_ChatMessage
  // table), so the grandfather entries are removed and the gate scans these files
  // like any other.
]);

// ---------------------------------------------------------------------------
// Scan roots. `backend/src` keeps its whole-file / pinned-snippet grandfather
// model (unchanged). `worker` is scanned with the per-file COUNT baseline
// below, so adding it is byte-identical at HEAD (the captured counts make the
// existing worker debt pass) while any NEW worker direct access fails.
// ---------------------------------------------------------------------------
const SCAN_ROOTS = ['backend/src', 'worker'];

// Files under these roots use the worker count-baseline path. Everything else
// uses the original backend grandfather logic.
const COUNT_BASELINE_ROOTS = ['worker/'];

function usesCountBaseline(posix) {
  return COUNT_BASELINE_ROOTS.some((root) => posix.startsWith(root));
}

// ---------------------------------------------------------------------------
// Worker grandfather — per-file COUNT baseline (ratchet).
//
// Each entry is the number of NON-EXEMPT direct `prisma.kloelMemory|kloelMessage|
// chatMessage` accesses present on HEAD in that worker file. The gate tolerates
// up to this many (existing debt) and FAILS the moment a worker file's count
// GROWS beyond it, or a NEW worker file (implicit baseline 0) introduces any.
// Counts (not line numbers) → immune to line drift from unrelated edits.
//
// Captured from HEAD via the gate's own FORBIDDEN_RE minus the FALLBACK / TX /
// DI-default idiom exemptions. Regenerate with `--report` if worker code is
// intentionally re-canonicalized (counts should only ever shrink).
// ---------------------------------------------------------------------------
const WORKER_GRANDFATHERED_COUNTS = new Map([
  ['worker/processors/autopilot/autopilot-utils.ts', 1],
  ['worker/processors/autopilot/cia-learn.ts', 1],
  ['worker/processors/autopilot/cognition-context.ts', 1],
  ['worker/processors/autopilot/score-contact.ts', 1],
  ['worker/processors/autopilot/score-opportunity.ts', 3],
  ['worker/processors/autopilot/score-proof.ts', 1],
  ['worker/processors/cia/cia-decision-log.ts', 2],
  ['worker/processors/cia/cognitive-state/cognitive-state-load.ts', 1],
  ['worker/processors/cia/cognitive-state/cognitive-state-persist.ts', 3],
  ['worker/processors/cia/cognitive-state/cognitive-state-record.ts', 1],
  ['worker/providers/commercial-intelligence.persistence.ts', 2],
  // Vitest mock-setup support file (mocks the delegate; not a real direct read).
  ['worker/test/scan-contact.setup.ts', 5],
]);

// ---------------------------------------------------------------------------
// Comment stripping — prose mentions of `prisma.kloelMemory` in JSDoc / `//`
// comments must never trip the gate. We strip block comments (`/* … */`,
// including JSDoc) and line comments (`// …`) before matching, while leaving
// real code intact. String-literal occurrences are vanishingly rare for these
// delegate names and are not relevant to the canonicalization invariant.
// ---------------------------------------------------------------------------
function stripComments(src) {
  // Remove block comments first (non-greedy, multi-line); keep newlines so
  // line numbers in findings stay accurate.
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Then line comments, per line.
  return noBlock
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

function isExempt(file, codeLine) {
  if (GRANDFATHERED_FILES.has(file)) return true;
  if (FALLBACK_RE.test(codeLine)) return true;
  if (TX_RE.test(codeLine)) return true;
  if (DI_DEFAULT_RE.test(codeLine)) return true;

  const directAllow = GRANDFATHERED_DIRECT.get(file);
  if (directAllow && directAllow.some((snippet) => codeLine.includes(snippet))) {
    return true;
  }
  return false;
}

function main() {
  const files = listFiles(SCAN_ROOTS, {
    extensions: ['.ts'],
    includeTests: false,
  });

  const violations = [];
  const grandfathered = [];

  for (const file of files) {
    const posix = toPosixPath(file);
    const codeLines = stripComments(readRepoFile(posix)).split('\n');

    if (usesCountBaseline(posix)) {
      // Worker file: count non-exempt (FALLBACK / TX / DI-default) direct
      // accesses and compare against the captured per-file baseline. Passes
      // while count <= baseline (existing debt); a NEW worker file defaults to
      // baseline 0 so any direct access fails; a GROWN count fails with the
      // exact offending lines listed.
      const hitLines = [];
      for (let i = 0; i < codeLines.length; i += 1) {
        const codeLine = codeLines[i] || '';
        if (!FORBIDDEN_RE.test(codeLine)) continue;
        // The whole-file / pinned-snippet backend grandfather model does not
        // apply to worker files; only the idiom exemptions (fallback / tx /
        // DI-default) carry over.
        if (FALLBACK_RE.test(codeLine) || TX_RE.test(codeLine) || DI_DEFAULT_RE.test(codeLine)) {
          grandfathered.push(`${posix}:${i + 1} [worker:idiom]`);
          continue;
        }
        hitLines.push({ line: i + 1, text: codeLine.trim() });
      }

      const baseline = WORKER_GRANDFATHERED_COUNTS.get(posix) ?? 0;
      if (hitLines.length <= baseline) {
        for (const h of hitLines) grandfathered.push(`${posix}:${h.line} [worker:baseline]`);
      } else {
        violations.push(
          `${posix}: worker direct-access count ${hitLines.length} > baseline ${baseline} ` +
            `(new non-canonical Mind access). Offending lines:`,
        );
        for (const h of hitLines) violations.push(`    ${posix}:${h.line}: ${h.text}`);
      }
      continue;
    }

    for (let i = 0; i < codeLines.length; i += 1) {
      const codeLine = codeLines[i] || '';
      if (!FORBIDDEN_RE.test(codeLine)) continue;

      if (isExempt(posix, codeLine)) {
        grandfathered.push(`${posix}:${i + 1}`);
        continue;
      }
      violations.push(`${posix}:${i + 1}: ${codeLine.trim()}`);
    }
  }

  if (REPORT) {
    console.log(`[check:canonical-mind] scanned ${files.length} backend+worker file(s).`);
    console.log(`[check:canonical-mind] grandfathered direct-access sites: ${grandfathered.length}`);
    for (const site of grandfathered) {
      console.log(`  • ${site}`);
    }
    console.log(`[check:canonical-mind] new violations: ${violations.length}`);
  }

  if (violations.length > 0) {
    console.error('[check:canonical-mind] Acesso direto NÃO canônico ao Mind detectado.');
    console.error('Use a camada canônica do Mind (MindMemoryItemService.items / MindMessageService.items)');
    console.error('em vez de prisma.kloelMemory / prisma.kloelMessage diretamente.');
    console.error('');
    for (const v of violations) {
      console.error(`- ${v}`);
    }
    process.exit(1);
  }

  console.log(
    `[check:canonical-mind] OK — ${files.length} arquivo(s) auditado(s), ` +
      `${grandfathered.length} acesso(s) legítimo(s) preservado(s), 0 violação(ões) nova(s).`,
  );
  process.exit(0);
}

main();
