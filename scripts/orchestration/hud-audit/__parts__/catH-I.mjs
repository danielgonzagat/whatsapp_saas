import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { PLUGINS_DIR, VAULT_ROOT, SNIPPETS_DIR, OBSIDIAN_CONFIG } from './constants.mjs';

export function catH_wave6Bundles() {
  const checks = [];

  const devopsDir = join(PLUGINS_DIR, 'devops-companion');
  checks.push({
    label: 'devops-companion plugin folder exists',
    pass: existsSync(devopsDir),
    detail: existsSync(devopsDir) ? 'exists' : 'missing',
  });

  const devopsManifest = join(devopsDir, 'manifest.json');
  if (existsSync(devopsManifest)) {
    try {
      const m = JSON.parse(readFileSync(devopsManifest, 'utf8'));
      checks.push({
        label: 'devops-companion: manifest.id == "devops-companion"',
        pass: m.id === 'devops-companion',
        detail: m.id === 'devops-companion' ? 'matches' : `got "${m.id}"`,
      });
    } catch {
      checks.push({ label: 'devops-companion manifest', pass: false, detail: 'parse error' });
    }
  } else {
    checks.push({ label: 'devops-companion manifest.json', pass: false, detail: 'missing' });
  }

  checks.push({
    label: 'devops-companion: main.js exists',
    pass: existsSync(join(devopsDir, 'main.js')),
    detail: existsSync(join(devopsDir, 'main.js')) ? 'exists' : 'missing',
  });

  const gitPluginDir = join(PLUGINS_DIR, 'obsidian-git');
  checks.push({
    label: 'obsidian-git plugin folder exists',
    pass: existsSync(gitPluginDir),
    detail: existsSync(gitPluginDir) ? 'exists' : 'missing',
  });

  const gitManifest = join(gitPluginDir, 'manifest.json');
  if (existsSync(gitManifest)) {
    try {
      const m = JSON.parse(readFileSync(gitManifest, 'utf8'));
      checks.push({
        label: 'obsidian-git: manifest.id == "obsidian-git"',
        pass: m.id === 'obsidian-git',
        detail: m.id === 'obsidian-git' ? 'matches' : `got "${m.id}"`,
      });
    } catch {
      checks.push({ label: 'obsidian-git manifest', pass: false, detail: 'parse error' });
    }
  } else {
    checks.push({ label: 'obsidian-git manifest.json', pass: false, detail: 'missing' });
  }

  checks.push({
    label: 'obsidian-git: main.js exists',
    pass: existsSync(join(gitPluginDir, 'main.js')),
    detail: existsSync(join(gitPluginDir, 'main.js')) ? 'exists' : 'missing',
  });

  const vaultGitDir = join(VAULT_ROOT, '.git');
  checks.push({
    label: 'vault is git repo (.git dir)',
    pass: existsSync(vaultGitDir) && statSync(vaultGitDir).isDirectory(),
    detail: existsSync(vaultGitDir) ? '.git directory exists' : '.git missing',
  });

  if (existsSync(vaultGitDir)) {
    try {
      execSync(`git -C "${VAULT_ROOT}" log --oneline -1`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      checks.push({ label: 'vault has >= 1 commit', pass: true, detail: 'git log succeeded' });
    } catch (e) {
      checks.push({
        label: 'vault has >= 1 commit',
        pass: false,
        detail: `git log failed: ${(e.stderr || '').slice(0, 80)}`,
      });
    }
  } else {
    checks.push({ label: 'vault has >= 1 commit', pass: false, detail: 'no .git directory' });
  }

  return { name: 'H. wave6-bundles', checks };
}

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
