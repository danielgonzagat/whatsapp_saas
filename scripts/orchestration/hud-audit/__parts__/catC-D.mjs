import { existsSync, readFileSync } from 'node:fs';
import { relative, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT, ORCHESTRATION_DIR } from './constants.mjs';
import { checkPending } from './helpers.mjs';

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

export function catD_wave3Polish() {
  const checks = [];

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
          detail: `exit ${result.status} (findings detected \u2014 expected exit 0)`,
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
