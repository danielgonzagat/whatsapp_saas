import path from 'node:path';
import { requireIncludes, requireNotRegex, requireWorkflowAction, rootDir } from './helpers.mjs';

function workflowPath(fileName) {
  return path.join(rootDir, '.github/workflows', fileName);
}

function checkCiWorkflow() {
  const filePath = workflowPath('ci-cd.yml');
  requireIncludes(filePath, 'readiness:check', 'CI enforces readiness check');
  requireIncludes(filePath, 'pulse:ci', 'CI enforces PULSE certification');
  requireIncludes(filePath, 'guard:db-push', 'CI blocks prisma db push regressions');
  requireIncludes(filePath, 'format:check', 'CI enforces formatting');
  requireIncludes(filePath, 'seatbelt:check', 'CI enforces the ESLint seatbelt');
  requireIncludes(filePath, 'quality:dead-code', 'CI refreshes Knip dead-code evidence');
  requireIncludes(filePath, 'quality:graph', 'CI refreshes Madge cycle evidence');
  requireIncludes(filePath, 'typecheck', 'CI enforces TypeScript checking');
  requireIncludes(filePath, 'prisma:validate', 'CI validates Prisma schema');
  requireIncludes(filePath, 'ratchet:check', 'CI enforces the quality ratchet');
  requireWorkflowAction(filePath, 'codecov/codecov-action', 'v5', 'CI uploads coverage to Codecov');
  requireIncludes(filePath, 'coverage:normalize', 'CI normalizes LCOV paths before upload');
  requireWorkflowAction(
    filePath,
    'codacy/codacy-coverage-reporter-action',
    'v1.3.0',
    'CI uploads coverage to Codacy using a pinned official action',
  );
  requireIncludes(filePath, 'upload-artifact', 'CI publishes forensic artifacts');
  requireNotRegex(
    filePath,
    /\.github\/workflows\/deploy\.yml/,
    'CI no longer references the disabled legacy deploy workflow',
    '.github/workflows/ci-cd.yml must not reference .github/workflows/deploy.yml',
  );
}

function checkStagingDeployWorkflow() {
  const filePath = workflowPath('deploy-staging.yml');
  requireIncludes(filePath, 'workflow_run', 'Staging deploy is chained to CI');
  requireIncludes(
    filePath,
    'environment: staging',
    'Staging deploy targets the staging environment',
  );
}

function checkProductionDeployWorkflow() {
  const filePath = workflowPath('deploy-production.yml');
  requireIncludes(filePath, 'workflow_dispatch', 'Production deploy requires manual dispatch');
  requireIncludes(
    filePath,
    'environment: production',
    'Production deploy is bound to the production environment',
  );
  requireIncludes(filePath, 'readiness:check', 'Production deploy reruns readiness checks');
}

function checkNightlyOpsAuditWorkflow() {
  const filePath = workflowPath('nightly-ops-audit.yml');
  requireIncludes(filePath, 'schedule:', 'Nightly ops audit is scheduled');
  requireIncludes(filePath, 'pulse:report', 'Nightly ops audit generates a PULSE report');
}

function checkReleasePleaseWorkflow() {
  const filePath = workflowPath('release-please.yml');
  requireIncludes(
    filePath,
    'googleapis/release-please-action',
    'Release Please workflow runs the official action',
  );
  requireIncludes(
    filePath,
    'release-please-config.json',
    'Release Please workflow reads the repo config',
  );
}

function checkCodeqlWorkflow() {
  const filePath = workflowPath('codeql.yml');
  requireIncludes(filePath, 'github/codeql-action/init', 'CodeQL workflow initializes CodeQL');
  requireIncludes(filePath, 'github/codeql-action/analyze', 'CodeQL workflow publishes analysis');
}

function checkCodacyAnalysisWorkflow() {
  const filePath = workflowPath('codacy-analysis.yml');
  requireWorkflowAction(
    filePath,
    'codacy/codacy-analysis-cli-action',
    'v4.4.7',
    'Codacy analysis workflow runs the pinned official action',
  );
  requireIncludes(filePath, 'upload: true', 'Codacy analysis workflow uploads results to Codacy');
}

function checkDependabotAutomergeWorkflow() {
  const filePath = workflowPath('dependabot-auto-merge.yml');
  requireIncludes(
    filePath,
    'gh pr review',
    'Dependabot auto-merge workflow auto-approves eligible PRs',
  );
  requireIncludes(
    filePath,
    '--auto --squash --delete-branch',
    'Dependabot auto-merge workflow enables auto-merge and branch cleanup',
  );
}

function checkLegacyDeployWorkflow() {
  const filePath = workflowPath('deploy.yml');
  requireIncludes(filePath, 'workflow_dispatch', 'Legacy deploy workflow is dispatch-only');
  requireNotRegex(
    filePath,
    /^\s*push:/m,
    'Legacy deploy workflow is no longer triggered on push',
    '.github/workflows/deploy.yml must not trigger on push',
  );
}

function checkLegacyCiWorkflow() {
  const filePath = workflowPath('main.yml');
  requireIncludes(filePath, 'workflow_dispatch', 'Legacy CI workflow is dispatch-only');
  requireNotRegex(
    filePath,
    /^\s*(push|pull_request):/m,
    'Legacy CI workflow is no longer triggered automatically',
    '.github/workflows/main.yml must not trigger on push or pull_request',
  );
}

/**
 * Verify every GitHub Actions workflow this project relies on for CI,
 * deployment, dependency management and static analysis. Each check
 * records a pass/fail via the shared `check()` sink in helpers.mjs.
 */
export function auditGithubWorkflows() {
  checkCiWorkflow();
  checkStagingDeployWorkflow();
  checkProductionDeployWorkflow();
  checkNightlyOpsAuditWorkflow();
  checkReleasePleaseWorkflow();
  checkCodeqlWorkflow();
  checkCodacyAnalysisWorkflow();
  checkDependabotAutomergeWorkflow();
  checkLegacyDeployWorkflow();
  checkLegacyCiWorkflow();
}
