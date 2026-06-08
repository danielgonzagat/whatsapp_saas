#!/usr/bin/env node
/**
 * check-canonical-capability-access.mjs
 *
 * ANTI-REGRESSION GATE — locks in the dispatch + tenant canonicalization
 * (FASE 7 completion). Mirrors check-canonical-mind-access.mjs:
 * comment-strip → grandfather every legit use that exists on HEAD → FAIL
 * (exit 1) only when a NEW non-canonical use is introduced.
 *
 * It enforces two independent capability invariants under `backend/src/**`
 * AND `worker/**` (excluding `*.spec.ts` / `*.test.ts`). The BullMQ worker
 * shares the same dispatch + tenant invariants, so it is scanned identically;
 * zero worker violations exist on HEAD, so extending the scope is byte-identical
 * (the gate stays exit 0) while any NEW worker-side bypass is now caught:
 *
 *  1. TENANT RESOLUTION
 *     The canonical way to resolve the effective workspace/tenant from a
 *     request is `resolveWorkspaceId` (backend/src/auth/workspace-access.ts),
 *     which VALIDATES the caller's token against the requested workspace.
 *     The non-validating helper `getWorkspaceId` at
 *     backend/src/kloel/product-sub-resources/helpers/common.helpers.ts
 *     just reads `req.user?.workspaceId || req.workspaceId || ''` with NO
 *     access check. New code MUST NOT import that helper — it is a tenant
 *     footgun. We forbid any NEW import of `getWorkspaceId` from a
 *     `common.helpers` path. (Unrelated *local* `getWorkspaceId` methods —
 *     e.g. partnerships.controller's `private getWorkspaceId`, kloel-security
 *     guard's local `function getWorkspaceId` — are NOT imports of the helper
 *     and are intentionally NOT matched.) Zero importers exist on HEAD, so the
 *     grandfather set is empty and the gate passes clean.
 *
 *  2. MESSAGE DISPATCH
 *     The canonical surface for sending an outbound channel message is the
 *     dispatch stack — ChannelMessageDispatchService / ChannelDispatchRegistry
 *     / ChannelTransportRegistry — and the per-channel marketing dispatch
 *     adapters / providers that those registries delegate to. New code MUST
 *     NOT reach past that stack and call a raw provider transport directly
 *     (e.g. `metaWhatsApp.sendTextMessage(...)`, `instagram.sendMessage(...)`,
 *     `messenger.sendTextMessage(...)`). Every raw-provider call that exists
 *     today is grandfathered: the canonical adapter/provider/transport files
 *     are whole-file escapes (they ARE the wrapper), and the handful of legit
 *     pre-existing callers that sit OUTSIDE that surface are pinned line-by-
 *     line so a NEW raw send in the same file still fails.
 *
 *     Conservative by design (per the FASE 7 brief): the dispatch rule keys
 *     off the RAW PROVIDER RECEIVER name (`metaWhatsApp.` / `messenger.` /
 *     `instagram(Service).`) so it never collides with the generic
 *     `.sendMessage(` that the registries / dispatchers / canonical service
 *     legitimately expose. A narrow gate that passes clean and forbids the
 *     real footgun beats a broad flaky one.
 *
 * This gate FAILS (exit 1) the moment a NEW non-canonical use of either
 * capability is introduced. Everything on the current HEAD is grandfathered
 * so the gate passes clean today.
 *
 * Usage:
 *   node scripts/ops/check-canonical-capability-access.mjs           # scan all backend/src
 *   node scripts/ops/check-canonical-capability-access.mjs --report  # list every grandfathered site
 *
 * Exit codes:
 *   0 — OK
 *   1 — a new non-canonical capability use was detected
 */

import { listFiles, readRepoFile, toPosixPath } from './lib/scan-utils.mjs';

const REPORT = process.argv.includes('--report');

// ---------------------------------------------------------------------------
// Rule 1 — TENANT RESOLUTION.
//
// We forbid a NEW import of the non-validating `getWorkspaceId` helper from a
// `common.helpers` path. Matching the IMPORT (not every call) is the robust
// signal: it pinpoints exactly the helper at common.helpers.ts and never
// confuses it with the unrelated local `getWorkspaceId` methods that other
// files declare for themselves. Built via char-join so this governance script
// does not itself trip any literal-substring scanner.
//
// Matches either an `import { … getWorkspaceId … } from '…common.helpers…'`
// statement or a re-export of the same. We accept any quote style and any
// relative depth to `common.helpers`.
// ---------------------------------------------------------------------------
const GET_WS_ID = ['get', 'Workspace', 'Id'].join('');
const COMMON_HELPERS = ['common', '.helpers'].join('');

// `import { a, getWorkspaceId, b } from '.../common.helpers';`
// `export { getWorkspaceId } from '.../common.helpers';`
// Two-stage test: the line both (a) names getWorkspaceId in a brace list and
// (b) references a common.helpers module specifier. Splitting the concerns
// keeps the regex resilient to multi-import ordering / aliasing.
const IMPORT_NAMES_GET_WS_ID_RE = new RegExp(
  ['^\\s*(?:import|export)\\b[\\s\\S]*\\b', GET_WS_ID, '\\b'].join(''),
);
const FROM_COMMON_HELPERS_RE = new RegExp(
  ['from\\s+[\'"][^\'"]*', COMMON_HELPERS, '[\'"]'].join(''),
);

// The helper's own file — declaring + exporting getWorkspaceId there is the
// canonical definition site, never a violation.
const TENANT_HELPER_FILE =
  'backend/src/kloel/product-sub-resources/helpers/common.helpers.ts';

// Grandfathered importers of the non-validating helper. EMPTY on HEAD — no
// file outside common.helpers.ts imports getWorkspaceId today, so any NEW
// importer is a fresh violation. (Listed explicitly to document the intent
// and to make adding a future legit exception a deliberate, reviewable edit.)
const GRANDFATHERED_TENANT_IMPORTERS = new Set([]);

function isTenantViolationLine(file, codeLine) {
  if (file === TENANT_HELPER_FILE) return false;
  if (!IMPORT_NAMES_GET_WS_ID_RE.test(codeLine)) return false;
  if (!FROM_COMMON_HELPERS_RE.test(codeLine)) return false;
  if (GRANDFATHERED_TENANT_IMPORTERS.has(file)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Rule 2 — MESSAGE DISPATCH.
//
// Forbidden: a direct call on a RAW PROVIDER receiver that bypasses the
// canonical dispatch stack. Keyed off the receiver name so it never matches
// the generic `.sendMessage(` exposed by registries / dispatchers / the
// canonical ChannelMessageDispatchService. Built via char-join.
// ---------------------------------------------------------------------------
const SEND_TEXT = ['send', 'Text', 'Message'].join('');
const SEND_MEDIA = ['send', 'Media', 'Message'].join('');
const SEND_MSG = ['send', 'Message'].join('');

// Raw Meta WhatsApp Cloud provider: `…metaWhatsApp.sendTextMessage(` /
// `…metaWhatsApp.sendMediaMessage(`.
const META_WA = ['meta', 'WhatsApp'].join('');
const RAW_META_WA_RE = new RegExp(
  ['\\b', META_WA, '\\.(?:', SEND_TEXT, '|', SEND_MEDIA, ')\\s*\\('].join(''),
);

// Raw Messenger Graph provider: `…messenger.sendTextMessage(` /
// `…messenger.sendMediaMessage(`. The leading `.` (or word-boundary) keeps it
// to the `messenger` receiver, not arbitrary identifiers ending in messenger.
const RAW_MESSENGER_RE = new RegExp(
  ['\\.messenger\\.(?:', SEND_TEXT, '|', SEND_MEDIA, ')\\s*\\('].join(''),
);

// Raw Instagram Graph provider: `…instagram.sendMessage(` /
// `…instagramService.sendMessage(`.
const RAW_INSTAGRAM_RE = new RegExp(
  ['\\.instagram(?:Service)?\\.', SEND_MSG, '\\s*\\('].join(''),
);

function dispatchMatch(codeLine) {
  return (
    RAW_META_WA_RE.test(codeLine) ||
    RAW_MESSENGER_RE.test(codeLine) ||
    RAW_INSTAGRAM_RE.test(codeLine)
  );
}

// Whole-file escapes — these files ARE the canonical dispatch surface (the
// per-channel adapters / providers / transport-registry providers that the
// canonical registries delegate to). A raw provider call inside them is the
// point of the file, not a bypass.
const GRANDFATHERED_DISPATCH_FILES = new Set([
  // Marketing per-channel dispatch adapters (the canonical adapter layer that
  // ChannelDispatchRegistry routes through).
  'backend/src/marketing/channels/instagram/instagram-dispatch.adapter.ts',
  'backend/src/marketing/channels/messenger/messenger-dispatch.adapter.ts',
  // The WhatsApp API provider — the wrapper that owns the raw metaWhatsApp
  // transport on behalf of the dispatcher.
  'backend/src/marketing/channels/whatsapp/providers/whatsapp-api.provider.ts',
  // ChannelTransportRegistry's transport providers — the canonical transport
  // layer that adapts each raw provider into the registry contract.
  'backend/src/kloel/channel-transport.providers.ts',
]);

// Line-pinned grandfather for legit pre-existing raw-provider callers that sit
// OUTSIDE the canonical surface. Each entry pins the exact statement so a NEW
// raw send anywhere else in the same file still fails.
const GRANDFATHERED_DISPATCH_DIRECT = new Map([
  // Campaigns broadcast — legacy raw WhatsApp path (flag-gated; the canonical
  // dispatcher path is the default). Pinned pending convergence.
  [
    'backend/src/campaigns/campaigns.service.ts',
    [`this.${META_WA}.${SEND_TEXT}(`],
  ],
  // Instagram inbound reply controller — direct Graph reply on the raw
  // InstagramService. Pinned pending routing through the dispatch adapter.
  [
    'backend/src/marketing/channels/instagram/instagram.controller.ts',
    [`this.instagramService.${SEND_MSG}(`],
  ],
  // Instagram marketing service — direct Graph send. Pinned pending routing
  // through the dispatch adapter.
  [
    'backend/src/marketing/instagram/instagram-marketing.service.ts',
    [`this.instagramService.${SEND_MSG}(`],
  ],
]);

function isDispatchExempt(file, codeLine) {
  if (GRANDFATHERED_DISPATCH_FILES.has(file)) return true;
  const directAllow = GRANDFATHERED_DISPATCH_DIRECT.get(file);
  if (directAllow && directAllow.some((snippet) => codeLine.includes(snippet))) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Comment stripping — prose mentions of the forbidden tokens in JSDoc / `//`
// comments must never trip the gate. Strip block comments (`/* … */`,
// including JSDoc) and line comments (`// …`) before matching, preserving
// newlines so finding line numbers stay accurate.
// ---------------------------------------------------------------------------
function stripComments(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlock
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

// Scan roots. `worker` shares the same dispatch + tenant invariants as
// `backend/src`; zero worker violations exist on HEAD so adding it is
// byte-identical (gate stays exit 0) while any NEW worker bypass is caught.
const SCAN_ROOTS = ['backend/src', 'worker'];

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

    for (let i = 0; i < codeLines.length; i += 1) {
      const codeLine = codeLines[i] || '';
      const lineNo = i + 1;

      // Rule 1 — tenant resolution.
      if (IMPORT_NAMES_GET_WS_ID_RE.test(codeLine) && FROM_COMMON_HELPERS_RE.test(codeLine)) {
        if (isTenantViolationLine(posix, codeLine)) {
          violations.push(
            `${posix}:${lineNo}: [tenant] import non-validating ${GET_WS_ID} — use resolveWorkspaceId (auth/workspace-access.ts): ${codeLine.trim()}`,
          );
        } else if (posix !== TENANT_HELPER_FILE) {
          grandfathered.push(`${posix}:${lineNo} [tenant]`);
        }
      }

      // Rule 2 — message dispatch.
      if (dispatchMatch(codeLine)) {
        if (isDispatchExempt(posix, codeLine)) {
          grandfathered.push(`${posix}:${lineNo} [dispatch]`);
        } else {
          violations.push(
            `${posix}:${lineNo}: [dispatch] raw provider send bypasses ChannelMessageDispatchService/ChannelDispatchRegistry: ${codeLine.trim()}`,
          );
        }
      }
    }
  }

  if (REPORT) {
    console.log(`[check:canonical-capability] scanned ${files.length} backend+worker file(s).`);
    console.log(
      `[check:canonical-capability] grandfathered legit-use sites: ${grandfathered.length}`,
    );
    for (const site of grandfathered) {
      console.log(`  • ${site}`);
    }
    console.log(`[check:canonical-capability] new violations: ${violations.length}`);
  }

  if (violations.length > 0) {
    console.error('[check:canonical-capability] Uso NÃO canônico de capacidade detectado.');
    console.error('Tenant: use resolveWorkspaceId (auth/workspace-access.ts), NÃO o helper');
    console.error(`  ${GET_WS_ID} (product-sub-resources/helpers/common.helpers.ts).`);
    console.error('Dispatch: use ChannelMessageDispatchService / ChannelDispatchRegistry /');
    console.error('  ChannelTransportRegistry (ou os adapters de canal), NÃO o provider cru.');
    console.error('');
    for (const v of violations) {
      console.error(`- ${v}`);
    }
    process.exit(1);
  }

  console.log(
    `[check:canonical-capability] OK — ${files.length} arquivo(s) auditado(s), ` +
      `${grandfathered.length} uso(s) legítimo(s) preservado(s), 0 violação(ões) nova(s).`,
  );
  process.exit(0);
}

main();
