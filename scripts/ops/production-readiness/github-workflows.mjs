import path from 'node:path';
import { requireIncludes, requireNotRegex, requireWorkflowAction, rootDir } from './helpers.mjs';

/**
 * Verify every GitHub Actions workflow this project relies on for CI,
 * deployment, dependency management and static analysis. Each check
 * records a pass/fail via the shared `check()` sink in helpers.mjs.
 */
export function auditGithubWorkflows() {
  const ciWorkflowPath = path.join(rootDir, '.github/workflows/ci-cd.yml');
  requireIncludes(ciWorkflowPath, 'readiness:check', 'CI enforces readiness check');
  requireIncludes(ciWorkflowPath, 'pulse:ci', 'CI enforces PULSE certification');
  requireIncludes(ciWorkflowPath, 'guard:db-push', 'CI blocks prisma db push regressions');
  requireIncludes(ciWorkflowPath, 'format:check', 'CI enforces formatting');
  requireIncludes(ciWorkflowPath, 'seatbelt:check', 'CI enforces the ESLint seatbelt');
  requireIncludes(ciWorkflowPath, 'quality:dead-code', 'CI refreshes Knip dead-code evidence');
  requireIncludes(ciWorkflowPath, 'quality:graph', 'CI refreshes Madge cycle evidence');
  requireIncludes(ciWorkflowPath, 'typecheck', 'CI enforces TypeScript checking');
  requireIncludes(ciWorkflowPath, 'prisma:validate', 'CI validates Prisma schema');
  requireIncludes(ciWorkflowPath, 'ratchet:check', 'CI enforces the quality ratchet');
  requireWorkflowAction(
    ciWorkflowPath,
    'codecov/codecov-action',
    'v5',
    'CI uploads coverage to Codecov',
  );
  requireIncludes(ciWorkflowPath, 'coverage:normalize', 'CI normalizes LCOV paths before upload');
  requireWorkflowAction(
    ciWorkflowPath,
    'codacy/codacy-coverage-reporter-action',
    'v1.3.0',
    'CI uploads coverage to Codacy using a pinned official action',
  );
  requireIncludes(ciWorkflowPath, 'upload-artifact', 'CI publishes forensic artifacts');
  requireNotRegex(
    ciWorkflowPath,
    /\.github\/workflows\/deploy\.yml/,
    'CI no longer references the disabled legacy deploy workflow',
    '.github/workflows/ci-cd.yml must not reference .github/workflows/deploy.yml',
  );

  const stagingWorkflowPath = path.join(rootDir, '.github/workflows/deploy-staging.yml');
  requireIncludes(stagingWorkflowPath, 'workflow_run', 'Staging deploy is chained to CI');
  requireIncludes(
    stagingWorkflowPath,
    'environment: staging',
    'Staging deploy targets the staging environment',
  );

  const productionWorkflowPath = path.join(rootDir, '.github/workflows/deploy-production.yml');
  requireIncludes(
    productionWorkflowPath,
    'workflow_dispatch',
    'Production deploy requires manual dispatch',
  );
  requireIncludes(
    productionWorkflowPath,
    'environment: production',
    'Production deploy is bound to the production environment',
  );
  requireIncludes(
    productionWorkflowPath,
    'readiness:check',
    'Production deploy reruns readiness checks',
  );

  const nightlyWorkflowPath = path.join(rootDir, '.github/workflows/nightly-ops-audit.yml');
  requireIncludes(nightlyWorkflowPath, 'schedule:', 'Nightly ops audit is scheduled');
  requireIncludes(
    nightlyWorkflowPath,
    'pulse:report',
    'Nightly ops audit generates a PULSE report',
  );

  const releasePleaseWorkflowPath = path.join(rootDir, '.github/workflows/release-please.yml');
  requireIncludes(
    releasePleaseWorkflowPath,
    'googleapis/release-please-action',
    'Release Please workflow runs the official action',
  );
  requireIncludes(
    releasePleaseWorkflowPath,
    'release-please-config.json',
    'Release Please workflow reads the repo config',
  );

  const codeqlWorkflowPath = path.join(rootDir, '.github/workflows/codeql.yml');
  requireIncludes(
    codeqlWorkflowPath,
    'github/codeql-action/init',
    'CodeQL workflow initializes CodeQL',
  );
  requireIncludes(
    codeqlWorkflowPath,
    'github/codeql-action/analyze',
    'CodeQL workflow publishes analysis',
  );

  const codacyAnalysisWorkflowPath = path.join(rootDir, '.github/workflows/codacy-analysis.yml');
  requireWorkflowAction(
    codacyAnalysisWorkflowPath,
    'codacy/codacy-analysis-cli-action',
    'v4.4.7',
    'Codacy analysis workflow runs the pinned official action',
  );
  requireIncludes(
    codacyAnalysisWorkflowPath,
    'upload: true',
    'Codacy analysis workflow uploads results to Codacy',
  );

  const dependabotAutomergeWorkflowPath = path.join(
    rootDir,
    '.github/workflows/dependabot-auto-merge.yml',
  );
  requireIncludes(
    dependabotAutomergeWorkflowPath,
    'gh pr review',
    'Dependabot auto-merge workflow auto-approves eligible PRs',
  );
  requireIncludes(
    dependabotAutomergeWorkflowPath,
    '--auto --squash --delete-branch',
    'Dependabot auto-merge workflow enables auto-merge and branch cleanup',
  );

  const legacyDeployWorkflowPath = path.join(rootDir, '.github/workflows/deploy.yml');
  requireIncludes(
    legacyDeployWorkflowPath,
    'workflow_dispatch',
    'Legacy deploy workflow is dispatch-only',
  );
  requireNotRegex(
    legacyDeployWorkflowPath,
    /^\s*push:/m,
    'Legacy deploy workflow is no longer triggered on push',
    '.github/workflows/deploy.yml must not trigger on push',
  );

  const legacyCiWorkflowPath = path.join(rootDir, '.github/workflows/main.yml');
  requireIncludes(legacyCiWorkflowPath, 'workflow_dispatch', 'Legacy CI workflow is dispatch-only');
  requireNotRegex(
    legacyCiWorkflowPath,
    /^\s*(push|pull_request):/m,
    'Legacy CI workflow is no longer triggered automatically',
    '.github/workflows/main.yml must not trigger on push or pull_request',
  );
}
