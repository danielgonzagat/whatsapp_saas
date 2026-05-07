import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OBSIDIAN_CONFIG, PLUGINS_DIR } from './constants.mjs';

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
    checks.push({
      label: 'community-plugins.json is array',
      pass: false,
      detail: 'not an array',
    });
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
          detail: 'id matches',
        });
      }
    } catch (e) {
      checks.push({
        label: `${pluginId}: manifest.json parse`,
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }

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

export function catG_pluginConfig() {
  const checks = [];

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

  const periodicDataPath = join(PLUGINS_DIR, 'periodic-notes', 'data.json');
  if (!existsSync(periodicDataPath)) {
    checks.push({ label: 'periodic-notes data.json', pass: false, detail: 'missing' });
  } else {
    try {
      const data = JSON.parse(readFileSync(periodicDataPath, 'utf8'));
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
