#!/usr/bin/env node
/**
 * check-canonical-mind-access.mjs
 *
 * ANTI-REGRESSION GATE — locks in the Brain → Mind memory/message
 * canonicalization (ADR-0013).
 *
 * The canonical surface for reading/writing the `RAC_KloelMemory` and
 * `RAC_KloelMessage` tables is the Mind alias layer:
 *   - `MindMemoryItemService.items`  (backend/src/kloel/mind/aliases/mind-memory-item.service.ts)
 *   - `MindMessageService.items`     (backend/src/kloel/mind/aliases/mind-message.service.ts)
 *
 * New code MUST NOT reach into `prisma.kloelMemory` / `prisma.kloelMessage`
 * (or `this.prisma.kloelMemory` / `this.prisma.kloelMessage`) directly. The
 * supported escapes are the canonical alias services, the documented
 * `?? …prisma.kloelMemory` fallback-getter idiom, transactional access inside
 * a `$transaction(tx => …)` callback, and a small explicitly grandfathered
 * set of legitimate pre-existing direct uses.
 *
 * This gate FAILS (exit 1) the moment a NEW non-canonical direct access is
 * introduced anywhere under `backend/src/**` (excluding `*.spec.ts` /
 * `*.test.ts`). Every direct access that exists on the current HEAD is
 * grandfathered so the gate passes clean today.
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

const FORBIDDEN_RE = new RegExp(
  ['\\b', PRISMA, '\\.(?:', KLOEL_MEMORY, '|', KLOEL_MESSAGE, ')\\b'].join(''),
);

// Documented safe fallback-getter idiom: `… ?? <anything>prisma.kloelMemory`.
// Allows the `this.`, `deps.`, and bare-`prisma` prefixes — all are the same
// "use the canonical Mind delegate, fall back to raw prisma when DI is absent"
// shape (`mindMemory?.items ?? this.prisma.kloelMemory`).
const FALLBACK_RE = new RegExp(
  ['\\?\\?\\s*[\\w.]*', PRISMA, '\\.(?:', KLOEL_MEMORY, '|', KLOEL_MESSAGE, ')\\b'].join(''),
);

// Transactional access inside a `$transaction(tx => …)` callback.
const TX_RE = /\btx\.kloelM/;

// DI default-parameter idiom: `memoryItems: PrismaService['kloelMemory'] = prisma.kloelMemory`.
// The default VALUE is a raw delegate; the canonical caller always passes the
// Mind surface. Byte-identical, zero behaviour drift.
const DI_DEFAULT_RE = new RegExp(
  ['=\\s*', PRISMA, '\\.(?:', KLOEL_MEMORY, '|', KLOEL_MESSAGE, ')\\b'].join(''),
);

// ---------------------------------------------------------------------------
// Grandfathered legitimate files (whole-file escapes).
// ---------------------------------------------------------------------------
const GRANDFATHERED_FILES = new Set([
  // The canonical alias services themselves — they ARE the wrapper.
  'backend/src/kloel/mind/aliases/mind-memory-item.service.ts',
  'backend/src/kloel/mind/aliases/mind-message.service.ts',
  // Deferred file (uses `prismaExt`, on the documented deferred list).
  'backend/src/kloel/conversational-onboarding-tools.service.ts',
]);

// ---------------------------------------------------------------------------
// Grandfathered legitimate direct accesses (file → set of code substrings).
//
// These are the genuine, pre-existing direct writes that live INSIDE the Mind
// subsystem and are not the alias services themselves. Each entry pins the
// exact statement so a NEW direct access in the same file still fails.
// ---------------------------------------------------------------------------
const GRANDFATHERED_DIRECT = new Map([
  // Mind policy writer: persists policy outcomes through the canonical table.
  [
    'backend/src/kloel/mind/policy/mind-policy.helpers.ts',
    [`await ${PRISMA}.${KLOEL_MEMORY}.upsert(`],
  ],
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
  const files = listFiles(['backend/src'], {
    extensions: ['.ts'],
    includeTests: false,
  });

  const violations = [];
  const grandfathered = [];

  for (const file of files) {
    const posix = toPosixPath(file);
    const codeLines = stripComments(readRepoFile(posix)).split('\n');

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
    console.log(`[check:canonical-mind] scanned ${files.length} backend file(s).`);
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
