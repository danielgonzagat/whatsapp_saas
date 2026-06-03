import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const atomicRoot = path.resolve(here, '..');
const visibleRoot = '/Users/danielpenin/whatsapp_saas';
const json = process.argv.includes('--json');
const results = [];

function rec(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
}

function emit() {
  const ok = results.every((r) => r.ok);
  if (json) {
    process.stdout.write(JSON.stringify({ ok, results }, null, 2) + '\n');
  } else {
    for (const r of results) process.stdout.write((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.detail ? ' :: ' + r.detail : '') + '\n');
  }
  if (!ok) process.exit(1);
}

const probe = `import { REPO_ROOT, resolveSafeTarget } from './dist/guard.js';
const target = resolveSafeTarget('scripts/mcp/atomic-edit/.host-write-root-alias-target.tmp');
process.stdout.write(JSON.stringify({ repoRoot: REPO_ROOT, absPath: target.absPath, relPath: target.relPath, repoRootForTarget: target.repoRoot }));`;

const res = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
  cwd: atomicRoot,
  env: { ...process.env, ATOMIC_HOST_WRITE_ROOT: visibleRoot },
  encoding: 'utf8',
});

let parsed = null;
try {
  parsed = JSON.parse(res.stdout || '{}');
} catch (e) {
  rec('guard host-write-root probe returned parseable JSON', false, res.stdout + res.stderr);
  emit();
}

rec('guard process exits cleanly under host write root env', res.status === 0, res.stderr);
rec('REPO_ROOT preserves the host-visible write root alias', parsed?.repoRoot === visibleRoot, JSON.stringify(parsed));
rec('resolveSafeTarget writes through the host-visible alias', typeof parsed?.absPath === 'string' && parsed.absPath.startsWith(visibleRoot + '/'), JSON.stringify(parsed));
rec('resolved target remains repo-relative under the visible root', parsed?.relPath === 'scripts/mcp/atomic-edit/.host-write-root-alias-target.tmp', JSON.stringify(parsed));

emit();
