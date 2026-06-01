#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const fixtureRoot = path.join(sourceDir, '.proof-codex-bypass-observer');

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function resetFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureRoot, '.atomic'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, '.codex', 'hooks.json'),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: '.*',
              hooks: [
                {
                  type: 'command',
                  command: 'node ${CODEX_PROJECT_DIR:-$PWD}/scripts/mcp/atomic-edit/bypass-observer-hook.mjs',
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(fixtureRoot, '.atomic', 'bypass-ledger.jsonl'),
    JSON.stringify({
      ts: Date.now(),
      tool: 'Write',
      category: 'native-edit',
      atomicEquivalent: 'atomic_replace_at / atomic_edit_symbol',
      blockedByDenyHook: true,
      target: 'src/example.ts',
    }) + '\n',
  );
}

function runReportAgainstCodexProjectDir() {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'bypass-report.mjs'), '--json'], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: fixtureRoot,
      CLAUDE_PROJECT_DIR: '',
    },
  });
  if (result.status !== 0) return { ok: false, result };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, result, parseError: error instanceof Error ? error.message : String(error) };
  }
}

function main() {
  const results = [];
  try {
    resetFixture();
    const report = runReportAgainstCodexProjectDir();
    record(
      results,
      'bypass-report resolves CODEX_PROJECT_DIR and observes Codex hook wiring',
      report.ok === true &&
        report.value?.observerInstalled === true &&
        report.value?.status === 'observed-clean' &&
        report.value?.detectableOpportunities === 1 &&
        report.value?.silentlyAllowedBypasses === 0,
      report,
    );

    const observerSource = fs.readFileSync(path.join(sourceDir, 'bypass-observer-hook.mjs'), 'utf8');
    record(
      results,
      'bypass observer writes under CODEX_PROJECT_DIR before Claude/cwd fallback',
      /process\.env\.CODEX_PROJECT_DIR\s*\|\|\s*process\.env\.CLAUDE_PROJECT_DIR\s*\|\|\s*process\.cwd\(\)/.test(observerSource),
    );

    const codexHooks = fs.readFileSync(path.join(repoRoot, '.codex', 'hooks.json'), 'utf8');
    record(
      results,
      'workspace Codex hooks include bypass-observer-hook.mjs',
      codexHooks.includes('bypass-observer-hook.mjs'),
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  return { ok: results.every((entry) => entry.ok), results };
}

const result = main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(result.ok ? 0 : 1);
