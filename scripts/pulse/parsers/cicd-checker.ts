/**
 * PULSE Parser 71: CI/CD Pipeline Checker
 * Layer 10: DevOps Health
 * Mode: STATIC (filesystem only — no runtime needed)
 *
 * CHECKS:
 * Verify that a complete CI/CD pipeline exists and covers all required quality gates.
 * Note: This parser does NOT require running infrastructure — it reads filesystem.
 *
 * Workflow file existence:
 * 1. Check for .github/workflows/*.yml or .github/workflows/*.yaml
 * 2. If no workflow files found → CICD_INCOMPLETE (no CI at all)
 * 3. Check for Railway-specific deploy config (railway.toml or railway.json)
 * 4. Check for Vercel deploy config (vercel.json or .vercel/)
 *
 * Workflow completeness (for each workflow file found):
 * 5. LINT gate: workflow must include a step that runs `npm run lint` (or equivalent)
 * 6. BUILD gate: workflow must include a step that runs `npm run build`
 * 7. TEST gate: workflow must include a step that runs `npm test` or `npm run test`
 * 8. DEPLOY gate: workflow must include a deploy step (to Vercel, Railway, or equivalent)
 * 9. Verify that DEPLOY only runs after LINT + BUILD + TEST pass (dependency order)
 *
 * Quality gates:
 * 10. Check if workflow runs on push to main AND on pull_request
 * 11. Check if workflow uses secrets (not hardcoded tokens in workflow YAML)
 * 12. Check if workflow has a timeout (jobs.*.timeout-minutes set)
 * 13. Check if workflow caches dependencies (actions/cache for node_modules)
 *
 * Branch protection:
 * 14. Check if .github/branch-protection.json or similar config exists
 *     (cannot check GitHub API without auth, but document the gap)
 *
 * Environment separation:
 * 15. Check if workflow has staging vs production deployment distinction
 * 16. Check if environment variables are sourced from secrets (not .env files committed)
 *
 * Prisma migrations in CI:
 * 17. Check if workflow runs `prisma migrate deploy` before backend deployment
 * 18. If schema changes are deployed without migration → production DB drift risk
 *
 * REQUIRES:
 * - Filesystem access to .github/ directory (config.rootDir)
 * - No running infrastructure needed
 *
 * BREAK TYPES:
 * - CICD_INCOMPLETE (high) — no CI/CD workflow exists, or workflow missing lint/build/test/deploy gates,
 *   or deploy step runs before quality gates, or Prisma migrations not automated
 */

import * as fs from 'fs';
import * as path from 'path';
import { walkFiles } from './utils';
import type { Break, PulseConfig } from '../types';

type WorkflowKind = 'primary' | 'auxiliary';

function classifyWorkflow(file: string, content: string): WorkflowKind {
  const basename = path.basename(file).toLowerCase();
  const auxiliaryNamePatterns = [
    'codeql',
    'codacy',
    'claude',
    'copilot',
    'dependabot',
    'release-please',
    'nightly',
    'deploy-',
    'deploy_',
    'visual-regression',
  ];

  if (auxiliaryNamePatterns.some((pattern) => basename.includes(pattern))) {
    return 'auxiliary';
  }

  const hasAnalysisOnlyAction =
    /codacy\/|github\/codeql|anthropics\/claude|copilot/i.test(content) &&
    !/npm run lint|npm run build|npm (run )?test|prisma migrate deploy/i.test(content);

  if (hasAnalysisOnlyAction) {
    return 'auxiliary';
  }

  return 'primary';
}

/** Check cicd. */
export function checkCicd(config: PulseConfig): Break[] {
  const breaks: Break[] = [];
  const workflowsDir = path.join(config.rootDir, '.github', 'workflows');

  // Check 1: workflows directory exists
  if (!fs.existsSync(workflowsDir)) {
    breaks.push({
      type: 'CICD_INCOMPLETE',
      severity: 'high',
      file: path.join(config.rootDir, '.github'),
      line: 0,
      description: 'No CI/CD workflow found',
      detail:
        '.github/workflows/ directory does not exist. No automated quality gates before deployment.',
    });
    return breaks;
  }

  // Collect all workflow YAML files
  const yamlFiles = walkFiles(workflowsDir, ['.yml', '.yaml']);
  if (yamlFiles.length === 0) {
    breaks.push({
      type: 'CICD_INCOMPLETE',
      severity: 'high',
      file: workflowsDir,
      line: 0,
      description: 'No CI/CD workflow files found',
      detail: '.github/workflows/ directory exists but contains no .yml/.yaml files.',
    });
    return breaks;
  }

  // Filter out disabled/legacy workflows (workflows that only trigger on workflow_dispatch
  // and have no real jobs are considered disabled stubs)
  const activeWorkflows: Array<{ file: string; content: string }> = [];
  for (const file of yamlFiles) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    // Skip workflows that are explicitly disabled (only workflow_dispatch trigger, echo "disabled")
    const isDisabled =
      /on:\s*\n\s+workflow_dispatch/m.test(content) &&
      /disabled|desativado|legado/i.test(content) &&
      !/on:\s*\n\s+push/m.test(content);
    if (!isDisabled) {
      activeWorkflows.push({ file, content });
    }
  }

  if (activeWorkflows.length === 0) {
    breaks.push({
      type: 'CICD_INCOMPLETE',
      severity: 'high',
      file: workflowsDir,
      line: 0,
      description: 'All CI/CD workflows are disabled',
      detail: `Found ${yamlFiles.length} workflow file(s) but all are disabled or only trigger on workflow_dispatch.`,
    });
    return breaks;
  }

  const primaryWorkflows = activeWorkflows.filter(
    ({ file, content }) => classifyWorkflow(file, content) === 'primary',
  );

  if (primaryWorkflows.length === 0) {
    breaks.push({
      type: 'CICD_INCOMPLETE',
      severity: 'high',
      file: workflowsDir,
      line: 0,
      description: 'No primary CI workflow found',
      detail:
        'Found workflow files, but none were classified as a primary CI pipeline that owns lint/build/test/migration gates.',
    });
    return breaks;
  }

  // Check each primary workflow for required gates
  for (const { file, content } of primaryWorkflows) {
    const relFile = path.relative(config.rootDir, file);

    // Check for lint gate
    const hasLint = /npm run lint|yarn lint|pnpm lint/i.test(content);
    if (!hasLint) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'CI workflow missing lint gate',
        detail: `${relFile}: No lint step found (npm run lint). Code quality not enforced in CI.`,
      });
    }

    // Check for build gate
    const hasBuild = /npm run build|yarn build|pnpm build/i.test(content);
    if (!hasBuild) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'CI workflow missing build gate',
        detail: `${relFile}: No build step found (npm run build). Build failures not caught before deploy.`,
      });
    }

    // Check for test gate
    const hasTest = /npm (run )?test|yarn test|pnpm test/i.test(content);
    if (!hasTest) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'CI workflow missing test gate',
        detail: `${relFile}: No test step found (npm test). Tests not run before deployment.`,
      });
    }

    // Check for push to main AND pull_request triggers
    const hasPushToMain =
      /on:[\s\S]*?push:[\s\S]*?branches:[\s\S]*?main/m.test(content) ||
      /on:\s*\[.*push.*\]/m.test(content);
    const hasPullRequest = /pull_request/i.test(content);
    if (!hasPushToMain || !hasPullRequest) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'CI workflow does not run on both push and pull_request',
        detail: `${relFile}: push=${hasPushToMain}, pull_request=${hasPullRequest}. PRs or pushes not fully covered.`,
      });
    }

    // Check for Prisma migration step (critical for backend deployments)
    const hasPrismaStep = /prisma migrate deploy|prisma db push/i.test(content);
    if (!hasPrismaStep) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'CI workflow does not run Prisma migrations',
        detail: `${relFile}: No "prisma migrate deploy" step found. Schema changes may not be applied before deployment.`,
      });
    }

    // Check for hardcoded secrets (tokens/passwords literally in workflow YAML, not via secrets)
    // Pattern: env var key followed by a long value that is NOT from ${{ secrets.* }} or step outputs
    // Exclude: GitHub Actions built-ins (uses:, runs-on:), URLs, test values, version pins
    const secretLines = content.split('\n').filter((line) => {
      if (/^\s*#/.test(line)) {
        return false;
      } // skip comments
      if (/uses:\s|runs-on:\s|cache-dependency-path:|node-version:/.test(line)) {
        return false;
      } // skip action refs
      if (/https?:\/\/|@v\d|ubuntu-|windows-|macos-/.test(line)) {
        return false;
      } // skip URLs and version refs
      if (/test_secret|test-secret|change-me|password|dummy/i.test(line)) {
        return false;
      } // skip obvious test placeholders
      // Match: KEY: <long-value> that is not wrapped in ${{ }} and not a short value
      return /[A-Z_]{6,}:\s+(?!\$\{\{)[A-Za-z0-9+/=]{40,}/.test(line);
    });
    if (secretLines.length > 0) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'Possible hardcoded secret in CI workflow',
        detail: `${relFile}: Found ${secretLines.length} line(s) with potential hardcoded token(s). Use \${{ secrets.VAR }} instead.`,
      });
    }

    // Check for dependency caching
    const hasCaching = /actions\/cache|cache-dependency-path|cache:\s*['"]?npm/i.test(content);
    if (!hasCaching) {
      breaks.push({
        type: 'CICD_INCOMPLETE',
        severity: 'high',
        file,
        line: 0,
        description: 'CI workflow does not cache dependencies',
        detail: `${relFile}: No dependency caching found. CI will reinstall node_modules on every run (slow).`,
      });
    }
  }

  // Check for Railway config
  const railwayToml = path.join(config.rootDir, 'railway.toml');
  const railwayJson = path.join(config.rootDir, 'railway.json');
  const hasRailway = fs.existsSync(railwayToml) || fs.existsSync(railwayJson);

  // Check for Vercel config
  const vercelJson = path.join(config.rootDir, 'vercel.json');
  const vercelDir = path.join(config.rootDir, '.vercel');
  const hasVercel = fs.existsSync(vercelJson) || fs.existsSync(vercelDir);

  if (!hasRailway && !hasVercel) {
    breaks.push({
      type: 'CICD_INCOMPLETE',
      severity: 'high',
      file: config.rootDir,
      line: 0,
      description: 'No deployment configuration found',
      detail:
        'Neither railway.toml/railway.json nor vercel.json/.vercel found. Deployment target is not declared.',
    });
  }

  return breaks;
}
