// hud-audit categories I-J — split from hud-audit.mjs for line budget.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ORCHESTRATION_DIR, PLUGINS_DIR, REPO_ROOT, SNIPPETS_DIR, VAULT_ROOT } from './hud-audit.constants.mjs';
import { checkFile } from './hud-audit.helpers.mjs';

export function catI_theme() {
  const checks = [];

  const themePath = join(SNIPPETS_DIR, 'kloel-theme.css');
  checks.push({
    label: 'kloel-theme.css exists in snippets/',
    pass: existsSync(themePath),
    detail: existsSync(themePath) ? 'exists' : 'missing',
  });

  const appearancePath = join(OBSIDIAN_CONFIG, 'appearance.json');
  if (!existsSync(appearancePath)) {
    checks.push({ label: 'appearance.json', pass: false, detail: 'missing' });
  } else {
    try {
      const appearance = JSON.parse(readFileSync(appearancePath, 'utf8'));
      const snippets = appearance?.enabledCssSnippets || [];
      const hasKloel = snippets.includes('kloel-theme');
      checks.push({
        label: 'appearance: enabledCssSnippets includes kloel-theme',
        pass: hasKloel,
        detail: hasKloel ? 'enabled' : `snippets: [${snippets.join(', ')}]`,
      });
    } catch (e) {
      checks.push({
        label: 'appearance.json parse',
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }
  }

  return { name: 'I. theme', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY J: pulse-engines
// ──────────────────────────────────────────────────────────────────────────────

export function catJ_pulseEngines() {
  const checks = [];

  // pulse-bridge-emitter.mjs exists
  checks.push(
    checkFile(
      'pulse-bridge-emitter.mjs exists',
      join(ORCHESTRATION_DIR, 'pulse-bridge-emitter.mjs'),
    ),
  );

  // pulse-bridge --dry runs without crash
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

  // 8 engines availability — engine-file name → binary detection
  // Some engines map to non-eponymous binaries (npmaudit→npm subcommand, markdownlint→markdownlint-cli2).
  const engines = [
    { name: 'yamllint', binaries: ['yamllint'] },
    { name: 'actionlint', binaries: ['actionlint'] },
    { name: 'shellcheck', binaries: ['shellcheck'] },
    { name: 'hadolint', binaries: ['hadolint'] },
    { name: 'gitleaks', binaries: ['gitleaks'] },
    { name: 'depcheck', binaries: ['depcheck'] },
    { name: 'npmaudit', binaries: ['npm'] }, // npm provides `audit` subcommand
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

  // REQUIREMENTS.md exists in scripts/findings-engines/
  const reqPath = join(REPO_ROOT, 'scripts', 'findings-engines', 'REQUIREMENTS.md');
  checks.push({
    label: 'findings-engines/REQUIREMENTS.md exists',
    pass: existsSync(reqPath),
    detail: existsSync(reqPath) ? 'exists' : 'missing',
  });

  return { name: 'J. pulse-engines', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// SUMMARY & OUTPUT
// ──────────────────────────────────────────────────────────────────────────────

