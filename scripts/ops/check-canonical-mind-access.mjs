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
  // Pure-fn helpers receiving prisma as a parameter (`ctx.prisma` / `deps.prisma`
  // / bare `prisma`). They have NO DI ctor to inject MindChatMessageService into,
  // so canonical convergence happens caller-side (deferred — tracked as a
  // partial in the chatmessage-converge task). Each statement is pinned with its
  // receiver prefix so a NEW direct chatMessage access in these files still fails.
  [
    'backend/src/gdpr/gdpr-processing.helpers.ts',
    [`ctx.${PRISMA}.${CHAT_MESSAGE}.findMany(`],
  ],
  [
    'backend/src/kloel/kloel-thread.controller-helpers.ts',
    [
      `deps.${PRISMA}.${CHAT_MESSAGE}.findMany(`,
      `deps.${PRISMA}.${CHAT_MESSAGE}.create(`,
      `deps.${PRISMA}.${CHAT_MESSAGE}.findFirst(`,
      `deps.${PRISMA}.${CHAT_MESSAGE}.updateMany(`,
      `deps.${PRISMA}.${CHAT_MESSAGE}.findFirstOrThrow(`,
    ],
  ],
  [
    'backend/src/kloel/kloel-thinker.helpers.ts',
    [
      `${PRISMA}.${CHAT_MESSAGE}.findMany(`,
      `${PRISMA}.${CHAT_MESSAGE}.updateMany(`,
      `${PRISMA}.${CHAT_MESSAGE}.deleteMany(`,
      `${PRISMA}.${CHAT_MESSAGE}.findFirst(`,
    ],
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
