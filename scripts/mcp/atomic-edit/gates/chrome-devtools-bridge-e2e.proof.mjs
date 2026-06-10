#!/usr/bin/env node
//
// End-to-end proof for the Atomic → Chrome DevTools MCP bridge.
//
// Unlike chrome-devtools-bridge.proof.mjs (pure, deterministic, always-on), this
// drives a REAL managed headless Chrome through the exact compiled production
// code path (`chromeDevtoolsCall` from dist/) and asserts that a screenshot
// surfaces as a real MCP image block — not base64 buried in JSON text. It needs
// the chrome-devtools-mcp binary + a Chrome executable + a few seconds, so it is
// NOT wired into the always-on gate list; run it on demand:
//
//   node gates/chrome-devtools-bridge-e2e.proof.mjs
//
// Exit 0 = pass (or cleanly skipped when the browser stack is absent), 1 = fail.
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromeDevtoolsCall, chromeDevtoolsReset } from '../dist/server-tools-chrome-devtools.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.ATOMIC_EDIT_REPO_ROOT?.trim() || path.resolve(HERE, '..', '..', '..', '..');
const CDP_SCRIPT = path.join(REPO_ROOT, 'scripts/mcp/chrome-devtools-cdp-browser.sh');

const jsonMode = process.argv.includes('--json');
const results = [];
const record = (name, ok, detail = {}) => results.push({ name, ok: Boolean(ok), detail });

const CHROME_MCP_BIN = '/opt/homebrew/bin/chrome-devtools-mcp';
const CHROME_BIN = process.env.CHROME_BIN?.trim() || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function emit(skipped = false) {
  const payload = { ok: results.every((r) => r.ok), skipped, results };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else {
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail?.note ? ` — ${r.detail.note}` : ''}`);
    if (skipped) console.log('SKIP chrome-devtools bridge e2e (browser stack unavailable)');
  }
  return payload.ok;
}

if (!fs.existsSync(CHROME_MCP_BIN) || !fs.existsSync(CHROME_BIN)) {
  record('chrome-devtools-mcp + Chrome binary present', false, {
    note: `missing ${!fs.existsSync(CHROME_MCP_BIN) ? CHROME_MCP_BIN : CHROME_BIN}`,
  });
  // Absent browser stack is a clean skip, not a failure, so CI on bare hosts is green.
  emit(true);
  process.exit(0);
}

const opts = { mode: 'managed', timeoutMs: 60_000 };

async function main() {
  // 1) Managed Chrome boots and answers a tools/call (list_pages).
  const pagesRes = await chromeDevtoolsCall('list_pages', {}, opts);
  const pages = pagesRes?.structuredContent?.pages;
  record(
    'managed Chrome boots and list_pages returns pages',
    Array.isArray(pages) && pages.length >= 1 && pagesRes.isError !== true,
    { note: Array.isArray(pages) ? `${pages.length} page(s)` : 'no pages' },
  );
  if (!Array.isArray(pages) || pages.length === 0) return;

  // Prefer a real content page over the experimental devtools:// surface.
  const target = pages.find((p) => typeof p.url === 'string' && !p.url.startsWith('devtools://')) ?? pages[0];

  // 2) Take a screenshot INLINE (no filePath) — the path that previously
  //    flattened the image into base64 text and blew the token cap.
  const shot = await chromeDevtoolsCall('take_screenshot', { pageId: target.id, format: 'png' }, opts);
  record('take_screenshot did not error', shot?.isError !== true);

  const blocks = Array.isArray(shot?.content) ? shot.content : [];
  const image = blocks.find((b) => b.type === 'image');
  record(
    'screenshot surfaces as a real MCP image block (type=image, base64 data, image/png)',
    Boolean(image) && typeof image.data === 'string' && image.data.length > 1_000 && image.mimeType === 'image/png',
    { note: image ? `${image.data.length} base64 chars, ${image.mimeType}` : 'no image block' },
  );
  record(
    'base64 image data is NEVER buried inside a text block',
    Boolean(image) && blocks.every((b) => b.type !== 'text' || !String(b.text).includes(image.data)),
  );
  record(
    'screenshot result still carries a human-readable text block',
    blocks.some((b) => b.type === 'text' && String(b.text).length > 0),
  );

  // 3) evaluate_script round-trips structured JSON through the bridge.
  const evalRes = await chromeDevtoolsCall(
    'evaluate_script',
    { pageId: target.id, function: '() => ({ probe: 21 * 2 })' },
    opts,
  );
  record(
    'evaluate_script round-trips through the bridge',
    evalRes?.isError !== true &&
      Array.isArray(evalRes.content) &&
      evalRes.content.some((b) => b.type === 'text' && String(b.text).includes('42')),
  );
}

let ok = false;
try {
  await main();
  ok = emit(false);
} catch (e) {
  record('bridge e2e completed without throwing', false, { note: e instanceof Error ? e.message : String(e) });
  ok = emit(false);
} finally {
  // Close the connect-only chrome-devtools-mcp sessions…
  try {
    chromeDevtoolsReset({ all: true });
  } catch {
    /* best-effort teardown */
  }
  // …and stop the debuggable Chrome that managed mode auto-launched via the CDP
  // script. Must pass the SAME runtime-root + ports env startCdpBrowser used, or
  // `stop` reads the wrong pid-file dir and leaves the browser running.
  try {
    if (fs.existsSync(CDP_SCRIPT)) {
      spawnSync('/bin/bash', [CDP_SCRIPT, 'stop'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 20_000,
        env: {
          ...process.env,
          KLOEL_CHROME_DEVTOOLS_TMP: path.join(REPO_ROOT, '.codex-artifacts/chrome-devtools-mcp'),
          KLOEL_CHROME_DEVTOOLS_PORTS: '9222 9223 9333',
        },
      });
    }
  } catch {
    /* best-effort teardown */
  }
}
process.exit(ok ? 0 : 1);
