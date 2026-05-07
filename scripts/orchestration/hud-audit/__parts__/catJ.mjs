import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { ORCHESTRATION_DIR, REPO_ROOT } from './constants.mjs';
import { checkFile } from './helpers.mjs';

export function catJ_pulseEngines() {
  const checks = [];

  checks.push(
    checkFile(
      'pulse-bridge-emitter.mjs exists',
      join(ORCHESTRATION_DIR, 'pulse-bridge-emitter.mjs'),
    ),
  );

  const pulseBridgePath = join(ORCHESTRATION_DIR, 'pulse-bridge-emitter.mjs');
  if (!existsSync(pulseBridgePath)) {
    checks.push({ label: 'pulse-bridge --dry', pass: false, detail: 'script missing' });
  } else {
    try {
      const result = spawnSync('node', [pulseBridgePath, '--dry'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 50 * 1024 * 1024,
        stdio: 'pipe',
      });
      if (result.status === 0) {
        checks.push({ label: 'pulse-bridge --dry', pass: true, detail: 'exit 0' });
      } else {
        checks.push({
          label: 'pulse-bridge --dry',
          pass: false,
          detail: `exit ${result.status}: ${(result.stderr || '').slice(0, 120)}`,
        });
      }
    } catch (e) {
      checks.push({
        label: 'pulse-bridge --dry',
        pass: false,
        detail: `crash: ${(e.message || '').slice(0, 120)}`,
      });
    }
  }

  const engines = [
    { name: 'yamllint', binaries: ['yamllint'] },
    { name: 'actionlint', binaries: ['actionlint'] },
    { name: 'shellcheck', binaries: ['shellcheck'] },
    { name: 'hadolint', binaries: ['hadolint'] },
    { name: 'gitleaks', binaries: ['gitleaks'] },
    { name: 'depcheck', binaries: ['depcheck'] },
    { name: 'npmaudit', binaries: ['npm'] },
    { name: 'markdownlint', binaries: ['markdownlint-cli2', 'markdownlint'] },
  ];

  for (const engine of engines) {
    let found = false;
    for (const bin of engine.binaries) {
      try {
        execSync(`command -v ${bin}`, {
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        found = true;
        break;
      } catch {
        /* try next */
      }
    }
    checks.push({
      label: `engine: ${engine.name}`,
      pass: found,
      detail: found ? 'available' : 'not found in PATH',
    });
  }

  const reqPath = join(REPO_ROOT, 'scripts', 'findings-engines', 'REQUIREMENTS.md');
  checks.push({
    label: 'findings-engines/REQUIREMENTS.md exists',
    pass: existsSync(reqPath),
    detail: existsSync(reqPath) ? 'exists' : 'missing',
  });

  return { name: 'J. pulse-engines', checks };
}
