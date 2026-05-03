import * as path from 'path';

import type { SandboxRiskLevel, SandboxState } from '../../types.safety-sandbox';

import { ensureDir, writeTextFile } from '../../safe-fs';
import { RISK_ORDER } from './effect-graph';
import { loadProtectedFiles } from './protected-files';
import { classifyDestructiveActions } from './classify-actions';
import { getAllIsolationRules } from './sandbox-workspace';

const ARTIFACT_FILE_NAME = 'PULSE_SANDBOX_STATE.json';

export function buildSandboxState(rootDir: string): SandboxState {
  const protectedFiles = loadProtectedFiles(rootDir);
  const destructiveActions = classifyDestructiveActions(rootDir);

  const governedSandboxActions = destructiveActions.filter((a) => a.requiresGovernedSandbox).length;
  const humanRequiredActions = 0;
  const sandboxOnlyActions = destructiveActions.filter((a) => a.sandboxOnly).length;
  const governanceViolations = destructiveActions.filter(
    (a) => a.kind.includes('governance') || a.kind.includes('protected'),
  ).length;

  const riskBreakdown = RISK_ORDER.reduce(
    (breakdown, level) => ({
      ...breakdown,
      [level]: destructiveActions.filter((a) => a.riskLevel === level).length,
    }),
    {} as Record<SandboxRiskLevel, number>,
  );

  const isolationRules = getAllIsolationRules(rootDir);

  const state: SandboxState = {
    generatedAt: new Date().toISOString(),
    destructiveActions,
    activeWorkspaces: [],
    protectedFiles,
    isolationRules,
    summary: {
      totalDestructiveActions: destructiveActions.length,
      humanRequiredActions,
      governedSandboxActions,
      sandboxOnlyActions,
      activeWorkspaces: 0,
      riskBreakdown,
      governanceViolations,
    },
  };

  const pulseDir = path.join(rootDir, '.pulse', 'current');
  ensureDir(pulseDir, { recursive: true });
  writeTextFile(path.join(pulseDir, ARTIFACT_FILE_NAME), JSON.stringify(state, null, 2));

  return state;
}
