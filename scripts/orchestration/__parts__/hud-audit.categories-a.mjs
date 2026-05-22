// hud-audit categories A-E — split from hud-audit.mjs for line budget.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUD_DIR,
  MIRROR_ROOT,
  ORCHESTRATION_DIR,
  PLUGINS_DIR,
  REPO_ROOT,
  SOURCE_DIR,
} from './hud-audit.constants.mjs';
import {
  checkFile,
  checkJsonFile,
  checkPending,
  countSidecars,
  grepTagCount,
  runDryEmitterSummary,
} from './hud-audit.helpers.mjs';

export function catA_baselineFiles() {
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

export function catB_wave1Emitters() {
  const checks = [];
  const tierDry = runDryEmitterSummary('tier-tags-emitter.mjs');
  const phaseDry = runDryEmitterSummary('phase-tags-emitter.mjs');

  // tier sidecars >= 2700
  const tierCount = countSidecars('tier');
  const tierDryNote = tierDry.ok ? `; dry-run would emit ${tierDry.summary.sidecarsWritten}` : '';
  checks.push({
    label: 'tier sidecars',
    pass: tierCount >= 2700,
    detail: `${tierCount} >= 2700${tierDryNote}`,
  });

  // tier tags >= 2700
  const tierTagCount = grepTagCount(SOURCE_DIR, 'kloel/tier-');
  const tierTagDryNote = tierDry.ok ? `; dry-run would retag ${tierDry.summary.mirrorsTagged}` : '';
  checks.push({
    label: 'tier tags',
    pass: tierCount >= 2700 && tierTagCount >= 2700,
    detail: tierTagCount >= 0 ? `${tierTagCount} >= 2700${tierTagDryNote}` : `grep error`,
  });

  // phase sidecars >= 700
  const phaseCount = countSidecars('phase');
  // Count orphan phase sidecars
  const orphans = findOrphans();
  const orphanPhaseCount = orphans.filter((p) => p.endsWith('.phase.json')).length;
  const orphanNote =
    orphanPhaseCount > 0 ? ` (${orphanPhaseCount} are orphans, run --fix-orphans)` : '';
  const phaseDryNote = phaseDry.ok
    ? `; dry-run would emit ${phaseDry.summary.sidecarsEmitted}`
    : '';
  checks.push({
    label: 'phase sidecars',
    pass: phaseCount >= 700,
    detail: `${phaseCount} >= 700${orphanNote}${phaseDryNote}`,
  });

  // phase tags >= 700
  const phaseTagCount = grepTagCount(SOURCE_DIR, 'kloel/phase-');
  const phaseTagDryNote = phaseDry.ok
    ? `; dry-run would retag ${phaseDry.summary.mirrorsTouched}`
    : '';
  checks.push({
    label: 'phase tags',
    pass: phaseCount >= 700 && phaseTagCount >= 700,
    detail: phaseTagCount >= 0 ? `${phaseTagCount} >= 700${phaseTagDryNote}` : `grep error`,
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

export function catC_wave2Rank() {
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

export function catD_wave3Polish() {
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

export function catE_mcpDoorway() {
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
      // Check top-level mcpServers.obsidian (fallback)
      if (claudeCfg.mcpServers?.obsidian) {
        mcpFound = true;
      }
      // Check projects.*.mcpServers.obsidian (primary path)
      if (!mcpFound && claudeCfg.projects) {
        for (const proj of Object.values(claudeCfg.projects)) {
          if (proj?.mcpServers?.obsidian) {
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

