// hud-audit categories F-H — split from hud-audit.mjs for line budget.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OBSIDIAN_CONFIG, ORCHESTRATION_DIR, PLUGINS_DIR, REPO_ROOT } from './hud-audit.constants.mjs';
import { checkFile } from './hud-audit.helpers.mjs';

export function catF_plugins() {
  const checks = [];
  const cpPath = join(OBSIDIAN_CONFIG, 'community-plugins.json');

  if (!existsSync(cpPath)) {
    checks.push({ label: 'community-plugins.json', pass: false, detail: 'missing' });
    return { name: 'F. plugins', checks };
  }

  let plugins;
  try {
    plugins = JSON.parse(readFileSync(cpPath, 'utf8'));
  } catch (e) {
    checks.push({
      label: 'community-plugins.json parse',
      pass: false,
      detail: `parse error: ${e.message.slice(0, 80)}`,
    });
    return { name: 'F. plugins', checks };
  }

  if (!Array.isArray(plugins)) {
    checks.push({ label: 'community-plugins.json is array', pass: false, detail: 'not an array' });
    return { name: 'F. plugins', checks };
  }

  checks.push({
    label: 'community-plugins.json entries >= 12',
    pass: plugins.length >= 12,
    detail: `${plugins.length} entries`,
  });

  for (const pluginId of plugins) {
    const pluginDir = join(PLUGINS_DIR, pluginId);
    const manifestPath = join(pluginDir, 'manifest.json');
    const mainJsPath = join(pluginDir, 'main.js');

    if (!existsSync(manifestPath)) {
      checks.push({
        label: `${pluginId}: manifest.json`,
        pass: false,
        detail: 'manifest.json missing',
      });
      continue;
    }

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if (manifest.id !== pluginId) {
        checks.push({
          label: `${pluginId}: manifest.id match`,
          pass: false,
          detail: `id mismatch: manifest says "${manifest.id}"`,
        });
      } else {
        checks.push({
          label: `${pluginId}: manifest.json valid`,
          pass: true,
          detail: `id matches`,
        });
      }
    } catch (e) {
      checks.push({
        label: `${pluginId}: manifest.json parse`,
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }

    // main.js check (one per plugin, combined with manifest check to avoid explosion)
    if (!existsSync(mainJsPath)) {
      checks.push({
        label: `${pluginId}: main.js`,
        pass: false,
        detail: 'main.js missing',
      });
    }
  }

  return { name: 'F. plugins', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY G: plugin-config
// ──────────────────────────────────────────────────────────────────────────────

export function catG_pluginConfig() {
  const checks = [];

  // homepage: homepages.Main Homepage.homepage includes "00-NEXT" or "00-HUD"
  const homepageDataPath = join(PLUGINS_DIR, 'homepage', 'data.json');
  if (!existsSync(homepageDataPath)) {
    checks.push({ label: 'homepage data.json', pass: false, detail: 'missing' });
  } else {
    try {
      const data = JSON.parse(readFileSync(homepageDataPath, 'utf8'));
      const mainHomepage = data?.homepages?.['Main Homepage']?.homepage || '';
      const hasTarget = mainHomepage.includes('00-NEXT') || mainHomepage.includes('00-HUD');
      checks.push({
        label: 'homepage: Main Homepage includes 00-NEXT or 00-HUD',
        pass: hasTarget,
        detail: hasTarget ? mainHomepage : `got "${mainHomepage}"`,
      });
    } catch (e) {
      checks.push({
        label: 'homepage data.json parse',
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }
  }

  // obsidian-linter: foldersToIgnore contains "Espelho do Codigo"
  const linterDataPath = join(PLUGINS_DIR, 'obsidian-linter', 'data.json');
  if (!existsSync(linterDataPath)) {
    checks.push({ label: 'obsidian-linter data.json', pass: false, detail: 'missing' });
  } else {
    try {
      const data = JSON.parse(readFileSync(linterDataPath, 'utf8'));
      const foldersToIgnore = data?.lintSettings?.foldersToIgnore || data?.foldersToIgnore || [];
      const hasEspelho = foldersToIgnore.some((f) => f.includes('Espelho do Codigo'));
      checks.push({
        label: 'obsidian-linter: foldersToIgnore includes Espelho do Codigo',
        pass: hasEspelho,
        detail: hasEspelho
          ? 'contains Espelho do Codigo'
          : `foldersToIgnore has ${foldersToIgnore.length} entries, none matching`,
      });
    } catch (e) {
      checks.push({
        label: 'obsidian-linter data.json parse',
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }
  }

  // periodic-notes: daily.folder = "Kloel/00-HUD/snapshots"
  const periodicDataPath = join(PLUGINS_DIR, 'periodic-notes', 'data.json');
  if (!existsSync(periodicDataPath)) {
    checks.push({ label: 'periodic-notes data.json', pass: false, detail: 'missing' });
  } else {
    try {
      const data = JSON.parse(readFileSync(periodicDataPath, 'utf8'));
      // periodic-notes stores calendar sets; find the first active one's daily folder
      let folder = data?.daily?.folder || '';
      if (!folder && Array.isArray(data?.calendarSets)) {
        folder = data.calendarSets[0]?.day?.folder || '';
      }
      const isCorrect = folder === 'Kloel/00-HUD/snapshots';
      checks.push({
        label: 'periodic-notes: daily.folder = Kloel/00-HUD/snapshots',
        pass: isCorrect,
        detail: isCorrect ? 'correct' : `got "${folder}"`,
      });
    } catch (e) {
      checks.push({
        label: 'periodic-notes data.json parse',
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }
  }

  return { name: 'G. plugin-config', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY H: wave6-bundles
// ──────────────────────────────────────────────────────────────────────────────

export function catH_wave6Bundles() {
  const checks = [];

  // devops-companion
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

  // obsidian-git
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

  // vault is git repo
  const vaultGitDir = join(VAULT_ROOT, '.git');
  checks.push({
    label: 'vault is git repo (.git dir)',
    pass: existsSync(vaultGitDir) && statSync(vaultGitDir).isDirectory(),
    detail: existsSync(vaultGitDir) ? '.git directory exists' : '.git missing',
  });

  // vault has >= 1 commit
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

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY I: theme
// ──────────────────────────────────────────────────────────────────────────────

