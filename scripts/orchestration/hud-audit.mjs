#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

// ──────────────────────────────────────────────────────────────────────────────
// PATH CONSTANTS
// ──────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(process.env.KLOEL_REPO_ROOT || '/Users/danielpenin/whatsapp_saas');
const VAULT_ROOT = resolve(
  process.env.KLOEL_VAULT_ROOT || '/Users/danielpenin/Documents/Obsidian Vault',
);
const MIRROR_ROOT = resolve(
  process.env.KLOEL_MIRROR_ROOT || join(VAULT_ROOT, 'Kloel', '99 - Espelho do Codigo'),
);
const SOURCE_DIR = join(MIRROR_ROOT, '_source');
const HUD_DIR = join(SOURCE_DIR, '.hud');
const OBSIDIAN_CONFIG = join(VAULT_ROOT, '.obsidian');
const PLUGINS_DIR = join(OBSIDIAN_CONFIG, 'plugins');
const ORCHESTRATION_DIR = join(REPO_ROOT, 'scripts', 'orchestration');
const SNIPPETS_DIR = join(OBSIDIAN_CONFIG, 'snippets');

// ──────────────────────────────────────────────────────────────────────────────
// CLI ARGS
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const MODE_DRY = args.includes('--dry');
const MODE_JSON = args.includes('--json');
const MODE_FIX_ORPHANS = args.includes('--fix-orphans');
const categoryArgIdx = args.indexOf('--category');
const CATEGORY_FILTER = categoryArgIdx >= 0 ? args[categoryArgIdx + 1]?.toUpperCase() : null;

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────

function checkFile(label, filePath) {
  const pass = existsSync(filePath);
  return {
    label,
    pass,
    detail: pass
      ? `${relative(REPO_ROOT, filePath)} exists`
      : `${relative(REPO_ROOT, filePath)} missing`,
  };
}

function walkFiles(root) {
  const files = [];
  if (!existsSync(root)) return files;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        files.push(full);
      }
    }
  }
  return files;
}

function countSidecars(ext) {
  let count = 0;
  const suffix = `.${ext}.json`;
  if (!existsSync(SOURCE_DIR)) return 0;
  const stack = [SOURCE_DIR];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile() && e.name.endsWith(suffix)) {
        count++;
      }
    }
  }
  return count;
}

function grepTagCount(root, tagPrefix) {
  try {
    const result = execSync(`rg -l --no-heading '${tagPrefix}' .`, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 30000,
    });
    return result.trim().split('\n').filter(Boolean).length;
  } catch (e) {
    if (e.status === 1) return 0; // no matches
    return -1; // error
  }
}

function checkJsonFile(label, filePath, expectedSchema) {
  if (!existsSync(filePath)) {
    return { label, pass: false, detail: `${relative(MIRROR_ROOT, filePath)} missing` };
  }
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed.schema !== expectedSchema) {
      return {
        label,
        pass: false,
        detail: `invalid schema: got "${parsed.schema}", expected "${expectedSchema}"`,
      };
    }
    return { label, pass: true, detail: `valid ${expectedSchema}` };
  } catch (e) {
    return { label, pass: false, detail: `parse error: ${e.message.slice(0, 80)}` };
  }
}

function runCmd(label, cmd, cwd, timeoutMs = 30000) {
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
    });
    return { label, pass: true, detail: 'exit 0', output: result };
  } catch (e) {
    const stderr = e.stderr || '';
    return {
      label,
      pass: false,
      detail: `exit ${e.status || '?'}: ${stderr.slice(0, 120)}`,
      output: e.stdout || '',
    };
  }
}

function runCmdStderr(label, cmd, cwd, timeoutMs = 30000) {
  try {
    const result = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stderrResult = result.toString();
    // For extend-graph-lens --dry, it outputs JSON to stdout and stderr
    // We need to check stderr for kloel_added line
    // Actually execSync returns stdout as string, stderr goes to process.stderr
    // Let's capture both via stdio pipe
    return null; // placeholder, will handle differently
  } catch (e) {
    return null;
  }
}

function checkExistsWithReason(label, filePath) {
  if (!existsSync(filePath)) {
    return { label, pass: false, detail: `${relative(REPO_ROOT, filePath)} missing` };
  }
  return { label, pass: true, detail: `${relative(REPO_ROOT, filePath)} exists` };
}

function checkPending(label, reason) {
  return { label, pass: false, pending: true, detail: reason };
}

// ──────────────────────────────────────────────────────────────────────────────
// ORPHAN DETECTION & CLEANUP
// ──────────────────────────────────────────────────────────────────────────────

function findOrphans() {
  const sidecarSuffixes = ['.tier.json', '.phase.json', '.coverage.json', '.findings.json'];

  // Phase 1: collect all .md absolute paths into a Set
  const mdSet = new Set();
  if (existsSync(SOURCE_DIR)) {
    const stack = [SOURCE_DIR];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile() && e.name.endsWith('.md')) {
          mdSet.add(full);
        }
      }
    }
  }

  // Phase 2: walk a second time for sidecars, check sibling .md
  const orphans = [];
  if (existsSync(SOURCE_DIR)) {
    const stack = [SOURCE_DIR];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (e.isFile()) {
          for (const suffix of sidecarSuffixes) {
            if (e.name.endsWith(suffix)) {
              const mdPath = full.slice(0, -suffix.length) + '.md';
              if (!mdSet.has(mdPath)) {
                orphans.push(full);
              }
              break;
            }
          }
        }
      }
    }
  }

  return orphans;
}

function fixOrphans(dry) {
  const orphans = findOrphans();
  console.error(`found ${orphans.length} orphan sidecars`);
  if (!dry) {
    let removed = 0;
    for (const path of orphans) {
      try {
        unlinkSync(path);
        removed++;
      } catch {
        // ignore permission errors
      }
    }
    console.error(`removed ${removed} orphans`);
  } else {
    console.error('[dry mode] would remove these:');
    for (const p of orphans.slice(0, 20)) {
      console.error(`  ${relative(MIRROR_ROOT, p)}`);
    }
    if (orphans.length > 20) {
      console.error(`  ... and ${orphans.length - 20} more`);
    }
  }
  return orphans.length;
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY A: baseline-files
// ──────────────────────────────────────────────────────────────────────────────

function catA_baselineFiles() {
  return {
    name: 'A. baseline-files',
    checks: [
      checkFile(
        'severity-tags-emitter.mjs exists',
        join(ORCHESTRATION_DIR, 'severity-tags-emitter.mjs'),
      ),
      checkFile('extend-graph-lens.mjs exists', join(ORCHESTRATION_DIR, 'extend-graph-lens.mjs')),
      checkFile(
        'graph-color-watchdog.mjs exists',
        join(ORCHESTRATION_DIR, 'graph-color-watchdog.mjs'),
      ),
    ],
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY B: wave1-emitters
// ──────────────────────────────────────────────────────────────────────────────

function catB_wave1Emitters() {
  const checks = [];

  // tier sidecars >= 2700
  const tierCount = countSidecars('tier');
  checks.push({
    label: 'tier sidecars',
    pass: tierCount >= 2700,
    detail: `${tierCount} >= 2700`,
  });

  // tier tags >= 2700
  const tierTagCount = grepTagCount(SOURCE_DIR, 'kloel/tier-');
  checks.push({
    label: 'tier tags',
    pass: tierCount >= 2700 && tierTagCount >= 2700,
    detail: tierTagCount >= 0 ? `${tierTagCount} >= 2700` : `grep error`,
  });

  // phase sidecars >= 700
  const phaseCount = countSidecars('phase');
  // Count orphan phase sidecars
  const orphans = findOrphans();
  const orphanPhaseCount = orphans.filter((p) => p.endsWith('.phase.json')).length;
  const orphanNote =
    orphanPhaseCount > 0 ? ` (${orphanPhaseCount} are orphans, run --fix-orphans)` : '';
  checks.push({
    label: 'phase sidecars',
    pass: phaseCount >= 700,
    detail: `${phaseCount} >= 700${orphanNote}`,
  });

  // phase tags >= 700
  const phaseTagCount = grepTagCount(SOURCE_DIR, 'kloel/phase-');
  checks.push({
    label: 'phase tags',
    pass: phaseCount >= 700 && phaseTagCount >= 700,
    detail: phaseTagCount >= 0 ? `${phaseTagCount} >= 700` : `grep error`,
  });

  // ci-state.json
  checks.push(checkJsonFile('ci-state.json valid', join(HUD_DIR, 'ci-state.json'), 'kloel.ci.v1'));

  // provider-state.json
  checks.push(
    checkJsonFile(
      'provider-state.json valid',
      join(HUD_DIR, 'provider-state.json'),
      'kloel.provider.v1',
    ),
  );

  return { name: 'B. wave1-emitters', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY C: wave2-rank
// ──────────────────────────────────────────────────────────────────────────────

function catC_wave2Rank() {
  const blockerPath = join(REPO_ROOT, 'BLOCKER_RANK.json');
  if (!existsSync(blockerPath)) {
    return {
      name: 'C. wave2-rank',
      checks: [checkPending('BLOCKER_RANK.json', 'Wave 2 blocker rank not yet generated')],
    };
  }
  try {
    const content = readFileSync(blockerPath, 'utf8');
    const parsed = JSON.parse(content);
    const schemaOk = parsed.schema === 'kloel.blocker-rank.v1';
    const hasTopN = Array.isArray(parsed.topN);
    return {
      name: 'C. wave2-rank',
      checks: [
        {
          label: 'BLOCKER_RANK.json schema',
          pass: schemaOk && hasTopN,
          detail:
            schemaOk && hasTopN
              ? `valid ${parsed.schema}, topN: ${parsed.topN.length} entries`
              : `schema=${parsed.schema} topN=${Array.isArray(parsed.topN) ? 'array' : 'missing'}`,
        },
      ],
    };
  } catch (e) {
    return {
      name: 'C. wave2-rank',
      checks: [
        {
          label: 'BLOCKER_RANK.json parse',
          pass: false,
          detail: `parse error: ${e.message.slice(0, 80)}`,
        },
      ],
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY D: wave3-polish
// ──────────────────────────────────────────────────────────────────────────────

function catD_wave3Polish() {
  const checks = [];

  // hud-orchestrator.mjs --dry --once exit 0
  const hudPath = join(ORCHESTRATION_DIR, 'hud-orchestrator.mjs');
  if (!existsSync(hudPath)) {
    checks.push({ label: 'hud-orchestrator.mjs exists', pass: false, detail: 'missing' });
  } else {
    try {
      const result = spawnSync('node', [hudPath, '--dry', '--once'], {
        cwd: REPO_ROOT,
        timeout: 120000,
        maxBuffer: 50 * 1024 * 1024,
        stdio: 'ignore',
      });
      if (result.status === 0) {
        checks.push({ label: 'hud-orchestrator --dry --once', pass: true, detail: 'exit 0' });
      } else {
        checks.push({
          label: 'hud-orchestrator --dry --once',
          pass: false,
          detail: `exit ${result.status} (findings detected — expected exit 0)`,
        });
      }
    } catch (e) {
      checks.push({
        label: 'hud-orchestrator --dry --once',
        pass: false,
        detail: `crash: ${(e.message || '').slice(0, 120)}`,
      });
    }
  }

  // ADR-0004 file exists with line count >= 500
  const adrPaths = [
    join(REPO_ROOT, 'docs', 'ADR', 'ADR-0004-Wave3-polish.md'),
    join(REPO_ROOT, 'docs', 'ADR', 'ADR-0004.md'),
    join(REPO_ROOT, 'docs', 'adr', '0004-obsidian-as-production-hud.md'),
  ];
  let adrCheck = null;
  for (const adrPath of adrPaths) {
    if (existsSync(adrPath)) {
      const lines = readFileSync(adrPath, 'utf8').split('\n').length;
      adrCheck = {
        label: `ADR-0004 line count (${relative(REPO_ROOT, adrPath)})`,
        pass: lines >= 500,
        detail: `${lines} lines >= 500`,
      };
      break;
    }
  }
  if (!adrCheck) {
    adrCheck = { label: 'ADR-0004 exists', pass: false, detail: 'ADR-0004 not found' };
  }
  checks.push(adrCheck);

  // extend-graph-lens.mjs --dry produces kloel_added in output
  const lensPath = join(ORCHESTRATION_DIR, 'extend-graph-lens.mjs');
  if (!existsSync(lensPath)) {
    checks.push({ label: 'extend-graph-lens --dry', pass: false, detail: 'script missing' });
  } else {
    try {
      const result = spawnSync('node', [lensPath, '--dry'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: 'pipe',
      });
      const output = (result.stdout || '') + (result.stderr || '');
      const hasKloelAdded = output.includes('kloel_added');
      checks.push({
        label: 'extend-graph-lens --dry kloel_added',
        pass: hasKloelAdded,
        detail: hasKloelAdded ? 'kloel_added found in output' : 'kloel_added not in output',
      });
    } catch (e) {
      checks.push({
        label: 'extend-graph-lens --dry kloel_added',
        pass: false,
        detail: `crash: ${(e.message || '').slice(0, 120)}`,
      });
    }
  }

  return { name: 'D. wave3-polish', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY E: mcp-doorway
// ──────────────────────────────────────────────────────────────────────────────

function catE_mcpDoorway() {
  const checks = [];
  const restApiDir = join(PLUGINS_DIR, 'obsidian-local-rest-api');

  // Local REST API plugin folder exists
  checks.push({
    label: 'REST API plugin folder exists',
    pass: existsSync(restApiDir),
    detail: existsSync(restApiDir) ? 'exists' : 'missing',
  });

  // manifest check
  const manifestPath = join(restApiDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    checks.push({
      label: 'REST API manifest exists',
      pass: false,
      detail: 'manifest.json missing',
    });
  } else {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const idOk = manifest.id === 'obsidian-local-rest-api';
      checks.push({
        label: 'REST API manifest.id == "obsidian-local-rest-api"',
        pass: idOk,
        detail: idOk ? 'id matches' : `got "${manifest.id}"`,
      });
    } catch (e) {
      checks.push({
        label: 'REST API manifest',
        pass: false,
        detail: `parse error: ${e.message.slice(0, 80)}`,
      });
    }
  }

  // main.js exists
  checks.push({
    label: 'REST API main.js exists',
    pass: existsSync(join(restApiDir, 'main.js')),
    detail: existsSync(join(restApiDir, 'main.js')) ? 'exists' : 'missing',
  });

  // MCP obsidian entry in ~/.claude.json
  const claudeConfigPath = join(process.env.HOME || '~', '.claude.json');
  let mcpFound = false;
  if (existsSync(claudeConfigPath)) {
    try {
      const claudeCfg = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
      for (const [project, config] of Object.entries(claudeCfg)) {
        if (config && typeof config === 'object' && config.mcpServers) {
          if ('obsidian' in config.mcpServers) {
            mcpFound = true;
            break;
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }
  checks.push({
    label: 'MCP obsidian entry in claude config',
    pass: mcpFound,
    detail: mcpFound ? 'found' : 'not found in ~/.claude.json',
  });

  // API key not placeholder
  const dataJsonPath = join(restApiDir, 'data.json');
  let apiKeyValid = false;
  if (existsSync(dataJsonPath)) {
    try {
      const data = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
      const key = data.apiKey || '';
      apiKeyValid = key.length > 10 && !key.includes('placeholder') && !key.includes('change-me');
    } catch {
      // ignore
    }
  }
  checks.push({
    label: 'REST API key set (not placeholder)',
    pass: apiKeyValid,
    detail: apiKeyValid ? 'valid key' : 'missing or placeholder',
  });

  // REST API responds 200
  const port = (() => {
    try {
      if (existsSync(dataJsonPath)) {
        const data = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
        return data.port || 27124;
      }
    } catch {
      // ignore
    }
    return 27124;
  })();

  const portKey = (() => {
    try {
      if (existsSync(dataJsonPath)) {
        const data = JSON.parse(readFileSync(dataJsonPath, 'utf8'));
        return data.apiKey || '';
      }
    } catch {
      // ignore
    }
    return '';
  })();

  try {
    const curlResult = execSync(
      `curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${portKey}" https://localhost:${port}/vault/`,
      { encoding: 'utf8', timeout: 5000 },
    ).trim();
    checks.push({
      label: `REST API healthcheck (port ${port})`,
      pass: curlResult === '200',
      detail: `HTTP ${curlResult}`,
    });
  } catch (e) {
    checks.push({
      label: `REST API healthcheck (port ${port})`,
      pass: false,
      detail: `curl failed: ${(e.stderr || e.message || '').toString().slice(0, 80)}`,
    });
  }

  return { name: 'E. mcp-doorway', checks };
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY F: plugins
// ──────────────────────────────────────────────────────────────────────────────

function catF_plugins() {
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

function catG_pluginConfig() {
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

function catH_wave6Bundles() {
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

function catI_theme() {
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

function catJ_pulseEngines() {
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

  // 8 engines availability
  const engines = [
    'yamllint',
    'actionlint',
    'shellcheck',
    'hadolint',
    'gitleaks',
    'depcheck',
    'npmaudit',
    'markdownlint',
  ];

  for (const engine of engines) {
    try {
      execSync(`command -v ${engine}`, {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      checks.push({
        label: `engine: ${engine}`,
        pass: true,
        detail: 'available',
      });
    } catch {
      checks.push({
        label: `engine: ${engine}`,
        pass: false,
        detail: 'not found in PATH',
      });
    }
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

function computeSummary(categories) {
  let totalPass = 0;
  let totalFail = 0;
  let totalPending = 0;
  let totalChecks = 0;

  for (const cat of categories) {
    for (const check of cat.checks) {
      totalChecks++;
      if (check.pending) {
        totalPending++;
      } else if (check.pass) {
        totalPass++;
      } else {
        totalFail++;
      }
    }
  }

  return { totalPass, totalFail, totalPending, totalChecks };
}

function renderMarkdown(categories, summary) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push(`# KLOEL HUD Audit — ${now}`);
  lines.push('');
  lines.push('## Summary');
  lines.push(
    `- Pass: ${summary.totalPass} / ${summary.totalChecks} checks` +
      (summary.totalFail > 0 ? ` (${summary.totalFail} failures)` : ''),
  );
  lines.push(`- Fail: ${summary.totalFail}`);
  lines.push(`- Pending: ${summary.totalPending}`);
  lines.push('');

  for (const cat of categories) {
    const catPass = cat.checks.filter((c) => c.pass && !c.pending).length;
    const catFail = cat.checks.filter((c) => !c.pass && !c.pending).length;
    const catPending = cat.checks.filter((c) => c.pending).length;
    const catTotal = cat.checks.length;

    const statusParts = [];
    if (catPass > 0) statusParts.push(`${catPass} pass`);
    if (catFail > 0) statusParts.push(`${catFail} fail`);
    if (catPending > 0) statusParts.push(`${catPending} pending`);

    lines.push(`## ${cat.name} (${statusParts.join(', ')})`);

    for (const check of cat.checks) {
      if (check.pending) {
        lines.push(`  ? ${check.label}: ${check.detail}`);
      } else if (check.pass) {
        lines.push(`  ✓ ${check.label}`);
      } else {
        lines.push(`  ✗ ${check.label}: ${check.detail}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderJson(categories, summary) {
  const result = {
    auditAt: new Date().toISOString(),
    summary: {
      pass: summary.totalPass,
      fail: summary.totalFail,
      pending: summary.totalPending,
      total: summary.totalChecks,
    },
    categories: categories.map((cat) => ({
      name: cat.name,
      pass: cat.checks.filter((c) => c.pass && !c.pending).length,
      fail: cat.checks.filter((c) => !c.pass && !c.pending).length,
      pending: cat.checks.filter((c) => c.pending).length,
      checks: cat.checks.map((c) => ({
        label: c.label,
        status: c.pending ? 'pending' : c.pass ? 'pass' : 'fail',
        detail: c.detail,
      })),
    })),
  };
  return JSON.stringify(result, null, 2);
}

// ──────────────────────────────────────────────────────────────────────────────
// CATEGORY REGISTRY
// ──────────────────────────────────────────────────────────────────────────────

const CATEGORIES = {
  A: catA_baselineFiles,
  B: catB_wave1Emitters,
  C: catC_wave2Rank,
  D: catD_wave3Polish,
  E: catE_mcpDoorway,
  F: catF_plugins,
  G: catG_pluginConfig,
  H: catH_wave6Bundles,
  I: catI_theme,
  J: catJ_pulseEngines,
};

// ──────────────────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────────────────

function main() {
  if (MODE_FIX_ORPHANS) {
    const count = fixOrphans(MODE_DRY);
    process.exit(0);
  }

  if (CATEGORY_FILTER) {
    const fn = CATEGORIES[CATEGORY_FILTER];
    if (!fn) {
      console.error(`Unknown category: "${CATEGORY_FILTER}". Use A-J.`);
      process.exit(2);
    }
    const categories = [fn()];
    const summary = computeSummary(categories);
    if (MODE_JSON) {
      process.stdout.write(renderJson(categories, summary) + '\n');
    } else {
      process.stdout.write(renderMarkdown(categories, summary) + '\n');
    }
    process.exit(summary.totalFail > 0 ? 1 : 0);
  }

  // Run all categories
  const categories = Object.values(CATEGORIES).map((fn) => fn());
  const summary = computeSummary(categories);

  if (MODE_JSON) {
    process.stdout.write(renderJson(categories, summary) + '\n');
  } else {
    process.stdout.write(renderMarkdown(categories, summary) + '\n');
  }

  process.exit(summary.totalFail > 0 ? 1 : 0);
}

main();
