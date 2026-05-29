/**
 * native-worker.mjs — forked CHILD PROCESS that hosts the @oh-my-pi/pi-natives
 * universal engine (tree-sitter / ast-grep, 75 languages) in an ISOLATED
 * address space.
 *
 * Why a child_process.fork and not a worker_thread: worker_threads share the
 * parent's address space, so a NATIVE segfault/abort inside the addon (bad
 * grammar pointer, stack overflow on a deep tree, OOM on a giant minified file)
 * would still take down the whole MCP server. A forked child has its own
 * address space — its crash is contained, and the parent (native-bridge.ts)
 * sees `exit` with a signal, marks the bridge degraded, and every tool falls
 * back to the existing ts-morph / lang-bridge path. This file is the ONLY place
 * allowed to load the .node.
 *
 * FIREWALL LAW enforced here, structurally: astEdit is ALWAYS forced to
 * `dryRun:true`. The native addon can therefore NEVER write to disk — it only
 * COMPUTES changes. All persistence happens in the parent through the atomic
 * Mutation Firewall (sha256 + validate + trace + protected-guard + rollback).
 */
import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const nativeRequire = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));

function binaryCandidates() {
  const plat = process.platform;
  const arch = process.arch;
  if (plat === 'darwin') return [`pi_natives.${plat}-${arch}.node`];
  if (plat === 'linux') {
    return [
      `pi_natives.${plat}-${arch}-gnu.node`,
      `pi_natives.${plat}-${arch}-musl.node`,
      `pi_natives.${plat}-${arch}.node`,
    ];
  }
  if (plat === 'win32') return [`pi_natives.${plat}-${arch}-msvc.node`, `pi_natives.${plat}-${arch}.node`];
  return [`pi_natives.${plat}-${arch}.node`];
}

function candidatePaths() {
  const dirs = [
    process.env.PI_NATIVES_DIR,
    path.join(HERE, '..', 'vendor', 'pi-natives'),
    path.join(HERE, 'vendor', 'pi-natives'),
    '/Users/danielpenin/pi-inspect/packages/natives/native',
  ].filter(Boolean);
  const out = [];
  for (const dir of dirs) for (const name of binaryCandidates()) out.push(path.join(dir, name));
  return out;
}

function safe(fn, dflt) {
  try {
    return fn();
  } catch {
    return dflt;
  }
}

let native = null;
for (const candidate of candidatePaths()) {
  try {
    if (!fs.existsSync(candidate)) continue;
    const mod = nativeRequire(candidate);
    if (mod && typeof mod.astEdit === 'function') {
      native = mod;
      break;
    }
  } catch {
    // try next
  }
}

process.send?.({
  type: 'ready',
  available: Boolean(native),
  languages: native ? safe(() => native.getSupportedLanguages(), []) : [],
});

process.on('message', async (msg) => {
  const { id, op, args } = msg || {};
  if (op === 'ping') {
    process.send?.({ id, ok: true, result: { available: Boolean(native) } });
    return;
  }
  if (!native) {
    process.send?.({ id, ok: false, error: 'pi-natives unavailable on this platform' });
    return;
  }
  try {
    let result;
    switch (op) {
      case 'astGrep':
        result = await native.astGrep(args);
        break;
      case 'astEdit':
        // FIREWALL: force dryRun so the addon can never write. The parent applies.
        result = await native.astEdit({ ...args, dryRun: true });
        break;
      case 'summarizeCode':
        result = native.summarizeCode(args);
        break;
      case 'getSupportedLanguages':
        result = native.getSupportedLanguages();
        break;
      case 'supportsLanguage':
        result = native.supportsLanguage(args?.lang);
        break;
      default:
        process.send?.({ id, ok: false, error: `unknown op: ${op}` });
        return;
    }
    process.send?.({ id, ok: true, result });
  } catch (e) {
    process.send?.({ id, ok: false, error: e?.message || String(e) });
  }
});
