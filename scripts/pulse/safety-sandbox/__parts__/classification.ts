// PULSE — Safety Sandbox Action Classification & Gate Decisions
// Part: classification — destructive action scanner, risk classification, gate requirements, patch validation

import * as path from 'path';
import * as fs from 'fs';

import { discoverDirectorySkipHintsFromEvidence } from '../../dynamic-reality-kernel/__parts__/token-evidence';
import {
  _kindAtOrdinal,
  _riskAtOrdinal,
  _u,
  _u2,
  _u3,
  _u4,
  _u5,
  _u6,
  _u7,
  _z,
  buildFileEffectGraph,
  deriveActionKindsFromEffectGraph,
  deriveRequirementsFromEffectGraph,
  deriveRiskLevelFromEffectGraph,
  getRiskOrder,
} from './effect-graph';
import { loadProtectedFiles } from './protected-files';
import { pathExists } from '../../safe-fs';
import type {
  DestructiveAction,
  DestructiveActionKind,
  SandboxRiskLevel,
} from '../../types.safety-sandbox';

// ────────────────────────────────────────────────────────────────────────────
// Destructive Action Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyDestructiveActions(rootDir: string): DestructiveAction[] {
  const protectedFiles = loadProtectedFiles(rootDir);
  const skipHints = discoverDirectorySkipHintsFromEvidence();
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
      if (skipHints.has(entry.name)) {
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

        const normalizedRelative = full.replace(/\\/g, '/').replace(/^\.\//, '');
        const isProtected = protectedFiles.some((protectedFile) => {
          const normalizedProtected = protectedFile.replace(/\\/g, '/').replace(/^\.\//, '');
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

// ────────────────────────────────────────────────────────────────────────────
// Risk Classification
// ────────────────────────────────────────────────────────────────────────────

export function classifyRiskLevel(kind: DestructiveActionKind): SandboxRiskLevel {
  return deriveRiskLevelFromEffectGraph(kind, null);
}

export function isActionAllowedInAutonomy(action: DestructiveAction): boolean {
  if (action.requiresGovernedSandbox) {
    return false;
  }
  if (action.sandboxOnly) {
    return false;
  }
  const restricted = new Set([_kindAtOrdinal(_u6), _kindAtOrdinal(_u7), _kindAtOrdinal(_u4)]);
  if (restricted.has(action.kind)) {
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Gate Requirements Per Operation Type
// ────────────────────────────────────────────────────────────────────────────

/**
 * Gate level derived from the operation kind's risk profile and requirements.
 *
 * Used by the autonomy loop to decide whether a proposed change can proceed
 * through PULSE-governed validation.
 */
export type GateDecision =
  | 'alllow_autonomous' // No gate required; safe for autonomous execution
  | 'require_sandbox' // Must execute inside a validated sandbox
  | 'block_permanently'; // Operation should never be attempted

function buildGovernedSandboxChecks(action: DestructiveAction): string[] {
  const checks = ['sandbox-created', 'pre-validation', 'patch-validated'];

  if (action.requiresDryRun) {
    checks.push('dry-run');
  }
  if (action.requiresBackup) {
    checks.push('backup-created');
  }
  if (action.requiresRollbackProof) {
    checks.push('rollback-validated');
  }

  checks.push('post-validation');
  return checks;
}

function isAutonomousPolicyBoundary(action: DestructiveAction): boolean {
  return action.requiresGovernedSandbox && !action.requiresDryRun && !action.sandboxOnly;
}

/**
 * Classify the gate requirement for a specific destructive action.
 *
 * This is the central decision function that the autonomy loop calls
 * before applying any change to the repository.
 */
export function classifyGateRequirement(action: DestructiveAction): {
  decision: GateDecision;
  reason: string;
  requiredChecks: string[];
} {
  const kind = action.kind;

  if (isAutonomousPolicyBoundary(action)) {
    return {
      decision: 'block_permanently',
      reason: `${kind} is outside autonomous execution policy. PULSE records the boundary and blocks execution with policy evidence.`,
      requiredChecks: ['policy-boundary-recorded'],
    };
  }

  if (action.requiresGovernedSandbox || action.sandboxOnly) {
    return {
      decision: 'require_sandbox',
      reason: `${kind} requires governed sandbox validation from its patch effects, blast radius, and proof needs.`,
      requiredChecks: buildGovernedSandboxChecks(action),
    };
  }

  return {
    decision: 'alllow_autonomous',
    reason: `${kind} has no sandbox-only, dry-run, backup, rollback, or boundary proof requirement.`,
    requiredChecks: [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Patch Validation
// ────────────────────────────────────────────────────────────────────────────

export function validatePatchForProtectedFiles(
  patchFile: string,
  protectedFiles: string[],
): boolean {
  if (!protectedFiles.length) {
    return true;
  }

  if (!pathExists(patchFile)) {
    return false;
  }

  let content: string;
  try {
    content = fs.readFileSync(patchFile, 'utf8');
  } catch {
    return false;
  }

  const modifiedFiles = extractModifiedFilesFromPatch(content);

  for (const file of modifiedFiles) {
    for (const pf of protectedFiles) {
      if (file === pf) {
        return false;
      }
      if (pf.endsWith('/') && file.startsWith(pf)) {
        return false;
      }
      if (file.startsWith(pf + '/')) {
        return false;
      }
    }
  }

  return true;
}

function extractModifiedFilesFromPatch(patch: string): string[] {
  const files: string[] = [];
  const seen = new Set<string>();

  for (const line of patch.split('\n')) {
    if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      const filePath = line.replace(/^[-+]{3} [ab]\//, '').trim();
      if (filePath && filePath !== '/dev/null' && !seen.has(filePath)) {
        seen.add(filePath);
        files.push(filePath);
      }
    }
  }

  return files;
}
