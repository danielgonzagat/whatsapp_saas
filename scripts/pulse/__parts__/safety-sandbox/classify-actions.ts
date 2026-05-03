import * as path from 'path';
import * as fs from 'fs';

import { pathExists } from '../../safe-fs';
import type { DestructiveAction } from '../../types.safety-sandbox';

import {
  buildFileEffectGraph,
  deriveActionKindsFromEffectGraph,
  normalizeRepoPath,
} from './effect-graph';
import {
  deriveRequirementsFromEffectGraph,
  deriveRiskLevelFromEffectGraph,
} from './risk-classification';
import { loadProtectedFiles } from './protected-files';

export function classifyDestructiveActions(rootDir: string): DestructiveAction[] {
  const protectedFiles = loadProtectedFiles(rootDir);
  const actions: DestructiveAction[] = [];
  const seen = new Set<string>();

  function walk(dir: string): void {
    if (!pathExists(dir)) {
      return;
    }

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (
        entry.name.startsWith('.') &&
        entry.name !== '.github' &&
        !entry.name.startsWith('.env') &&
        entry.name !== '.codacy.yml'
      ) {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }

      const full = path.join(dir, entry.name);
      const relative = path.relative(rootDir, full);

      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        let content = '';
        try {
          content = fs.readFileSync(full, 'utf8');
        } catch {
          content = '';
        }

        const normalizedRelative = normalizeRepoPath(relative);
        const isProtected = protectedFiles.some((protectedFile) => {
          const normalizedProtected = normalizeRepoPath(protectedFile);
          return (
            normalizedProtected === normalizedRelative ||
            normalizedRelative.startsWith(`${normalizedProtected}/`)
          );
        });
        const effectGraph = buildFileEffectGraph({
          relativePath: normalizedRelative,
          content,
          protectedByGovernance: isProtected,
        });

        for (const { kind, description } of deriveActionKindsFromEffectGraph(effectGraph)) {
          if (seen.has(`${kind}:${normalizedRelative}`)) continue;
          seen.add(`${kind}:${normalizedRelative}`);
          const reqs = deriveRequirementsFromEffectGraph(kind, effectGraph);
          const riskLevel = deriveRiskLevelFromEffectGraph(kind, effectGraph);

          actions.push({
            actionId: `${kind}:${normalizedRelative}`,
            kind,
            description: `${description}: ${normalizedRelative}`,
            targetFile: normalizedRelative,
            riskLevel,
            requiresHumanApproval: false,
            requiresGovernedSandbox: reqs.requiresGovernedSandbox,
            requiresDryRun: reqs.requiresDryRun,
            requiresBackup: reqs.requiresBackup,
            requiresRollbackProof: reqs.requiresRollbackProof,
            sandboxOnly: reqs.sandboxOnly,
          });
        }
      }
    }
  }

  walk(rootDir);
  return actions;
}
