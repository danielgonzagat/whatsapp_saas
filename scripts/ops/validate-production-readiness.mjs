#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const failures = [];
const passes = [];

function relative(filePath) {
  return path.relative(rootDir, filePath) || '.';
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function check(ok, title, detail) {
  if (ok) {
    passes.push({ title, detail });
    return;
  }
  failures.push({ title, detail });
}

function requireFile(relPath, title) {
  const absPath = path.join(rootDir, relPath);
  check(fs.existsSync(absPath), title, relPath);
  return absPath;
}

function requireIncludes(filePath, needle, title) {
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  check(content.includes(needle), title, `${relative(filePath)} must include "${needle}"`);
}

function requireRegex(filePath, regex, title, detail) {
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  check(regex.test(content), title, detail || `${relative(filePath)} must match ${regex}`);
}

function requireNotRegex(filePath, regex, title, detail) {
  if (!fs.existsSync(filePath)) {
    check(false, title, `missing ${relative(filePath)}`);
    return;
  }
  const content = readText(filePath);
  check(!regex.test(content), title, detail || `${relative(filePath)} must not match ${regex}`);
}

function daysSince(isoString) {
  const parsed = Date.parse(isoString);
  if (!Number.isFinite(parsed)) return Number.POSITIVE_INFINITY;
  return (Date.now() - parsed) / (1000 * 60 * 60 * 24);
}

const requiredFiles = [
  ['.github/workflows/ci-cd.yml', 'CI workflow exists'],
  ['.github/workflows/codeql.yml', 'CodeQL workflow exists'],
  ['.github/workflows/dependabot-auto-merge.yml', 'Dependabot auto-merge workflow exists'],
  ['.github/workflows/deploy-staging.yml', 'Staging deploy workflow exists'],
  ['.github/workflows/deploy-production.yml', 'Production deploy workflow exists'],
  ['.github/workflows/nightly-ops-audit.yml', 'Nightly ops audit workflow exists'],
  ['.github/dependabot.yml', 'Dependabot config exists'],
  ['.github/copilot-instructions.md', 'Copilot review instructions exist'],
  ['.github/pull_request_template.md', 'Pull request template exists'],
  ['docs/DISASTER_RECOVERY.md', 'Disaster recovery runbook exists'],
  ['docs/RESTORE.md', 'Restore runbook exists'],
  ['docs/STAGING_ENVIRONMENT.md', 'Staging environment doc exists'],
  ['docs/MONITORING_AND_ALERTING.md', 'Monitoring and alerting doc exists'],
  ['docs/LEGAL_AND_FINANCIAL_COMPLIANCE.md', 'Legal and financial compliance doc exists'],
  ['docs/PRODUCTION_READINESS.md', 'Production readiness doc exists'],
  ['docs/GITHUB_REPOSITORY_SETTINGS.md', 'GitHub repository settings doc exists'],
  ['.backup-manifest.json', 'Backup manifest exists'],
  ['.dr-test.log', 'Disaster recovery evidence log exists'],
  ['frontend/src/app/(public)/privacy/page.tsx', 'Privacy policy page exists'],
  ['frontend/src/app/(public)/terms/page.tsx', 'Terms of use page exists'],
  ['.editorconfig', 'EditorConfig exists'],
  ['.prettierrc.json', 'Root Prettier config exists'],
  ['commitlint.config.cjs', 'Commitlint config exists'],
  ['.husky/pre-commit', 'Husky pre-commit hook exists'],
  ['.husky/pre-push', 'Husky pre-push hook exists'],
  ['.husky/commit-msg', 'Husky commit-msg hook exists'],
  ['.claude/settings.json', 'Claude hooks config exists'],
  ['scripts/ops/auto-sync-main.sh', 'Auto-sync runner exists'],
  ['scripts/ops/install-auto-sync-launchagent.sh', 'Auto-sync installer exists'],
  ['scripts/ops/print-auto-sync-status.sh', 'Auto-sync status printer exists'],
  ['scripts/ops/run-scoped-pre-push.mjs', 'Scoped pre-push validator exists'],
  ['backend/src/sentry.ts', 'Sentry bootstrap file exists'],
  [
    'backend/src/common/middleware/prompt-sanitizer.middleware.ts',
    'Prompt sanitization middleware exists',
  ],
  ['backend/src/health/system-health.controller.ts', 'System health controller exists'],
];

for (const [relPath, title] of requiredFiles) {
  requireFile(relPath, title);
}

const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(readText(packageJsonPath));
check(
  packageJson.scripts?.['readiness:check'] === 'node scripts/ops/validate-production-readiness.mjs',
  'Root readiness script is registered',
  'package.json must expose readiness:check',
);
check(
  packageJson.scripts?.['pulse:ci'] === 'node scripts/ops/run-pulse-ci.mjs',
  'Root PULSE CI script is registered',
  'package.json must expose pulse:ci',
);
check(
  packageJson.scripts?.['ops:audit'] === 'npm run readiness:check && npm run pulse:ci',
  'Root ops audit script is registered',
  'package.json must expose ops:audit',
);
for (const requiredScript of [
  'prepare',
  'lint',
  'format',
  'format:check',
  'typecheck',
  'prisma:validate',
  'prisma:generate',
  'db:migrate:prod',
  'guard:db-push',
  'prepush:scoped',
  'sync:install',
  'sync:run',
  'sync:status',
  'test',
  'build',
]) {
  check(
    typeof packageJson.scripts?.[requiredScript] === 'string' &&
      packageJson.scripts[requiredScript].length > 0,
    `Root script ${requiredScript} is registered`,
    `package.json must expose ${requiredScript}`,
  );
}

const backupManifestPath = path.join(rootDir, '.backup-manifest.json');
if (fs.existsSync(backupManifestPath)) {
  try {
    const manifest = JSON.parse(readText(backupManifestPath));
    const stores = Array.isArray(manifest.stores) ? manifest.stores : [];
    const requiredStoreTypes = ['database', 'cache', 'object_storage'];

    check(
      stores.length >= 3,
      'Backup manifest lists critical stores',
      '.backup-manifest.json must declare at least database, cache, and object storage',
    );
    for (const storeType of requiredStoreTypes) {
      const store = stores.find((entry) => entry?.type === storeType);
      check(
        Boolean(store),
        `Backup manifest contains ${storeType} store`,
        `.backup-manifest.json must include a ${storeType} entry`,
      );
      if (store) {
        check(
          store.configured === true,
          `${storeType} backup is configured`,
          `${storeType} store must be marked configured=true`,
        );
        check(
          store.tested === true,
          `${storeType} backup has restore evidence`,
          `${storeType} store must be marked tested=true`,
        );
      }
    }

    const manifestAgeDays = daysSince(
      manifest.lastBackupAt || manifest.lastBackup || manifest.lastUpdated,
    );
    check(
      manifestAgeDays <= 45,
      'Backup manifest is fresh',
      `.backup-manifest.json is stale (${Math.floor(manifestAgeDays)} days old)`,
    );
  } catch (error) {
    check(false, 'Backup manifest is valid JSON', String(error));
  }
}

const drLogPath = path.join(rootDir, '.dr-test.log');
if (fs.existsSync(drLogPath)) {
  const drLog = readText(drLogPath);
  check(
    drLog.includes('Overall: PASS'),
    'Disaster recovery drill last result passed',
    '.dr-test.log must include "Overall: PASS"',
  );
  requireRegex(
    drLogPath,
    /Next test:\s*\d{4}-\d{2}-\d{2}/,
    'Disaster recovery drill schedules the next exercise',
    '.dr-test.log must declare the next scheduled test date',
  );
}

const ciWorkflowPath = path.join(rootDir, '.github/workflows/ci-cd.yml');
requireIncludes(ciWorkflowPath, 'readiness:check', 'CI enforces readiness check');
requireIncludes(ciWorkflowPath, 'pulse:ci', 'CI enforces PULSE certification');
requireIncludes(ciWorkflowPath, 'guard:db-push', 'CI blocks prisma db push regressions');
requireIncludes(ciWorkflowPath, 'format:check', 'CI enforces formatting');
requireIncludes(ciWorkflowPath, 'typecheck', 'CI enforces TypeScript checking');
requireIncludes(ciWorkflowPath, 'prisma:validate', 'CI validates Prisma schema');
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
requireIncludes(nightlyWorkflowPath, 'pulse:report', 'Nightly ops audit generates a PULSE report');

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

const dependabotPath = path.join(rootDir, '.github/dependabot.yml');
for (const keyword of ['github-actions', '/backend', '/frontend', '/worker', '/e2e']) {
  requireIncludes(dependabotPath, keyword, `Dependabot covers ${keyword}`);
}

const mainTsPath = path.join(rootDir, 'backend/src/main.ts');
requireIncludes(mainTsPath, 'initSentry(', 'Backend initializes Sentry');
requireIncludes(mainTsPath, 'helmet(', 'Backend enables Helmet');
requireIncludes(mainTsPath, 'enableCors', 'Backend enables CORS');
requireIncludes(
  mainTsPath,
  'CORS_ALLOWED_ORIGINS',
  'Backend allows explicit production origin allowlists',
);
requireIncludes(
  mainTsPath,
  'CORS_ALLOWED_ORIGIN_REGEX',
  'Backend allows preview-origin regex configuration',
);
requireIncludes(mainTsPath, 'ValidationPipe', 'Backend enables global DTO validation');

const appModulePath = path.join(rootDir, 'backend/src/app.module.ts');
requireIncludes(
  appModulePath,
  'ThrottlerModule.forRoot',
  'Backend configures global rate limiting',
);
requireIncludes(
  appModulePath,
  'PromptSanitizerMiddleware',
  'Backend wires prompt sanitization middleware',
);

const checkoutWebhookPath = path.join(
  rootDir,
  'backend/src/checkout/checkout-webhook.controller.ts',
);
const legacyWebhookPath = path.join(rootDir, 'backend/src/webhooks/asaas-webhook.controller.ts');
requireIncludes(
  checkoutWebhookPath,
  'ASAAS_WEBHOOK_TOKEN',
  'Checkout webhook verifies Asaas token',
);
requireIncludes(
  legacyWebhookPath,
  'ASAAS_WEBHOOK_TOKEN',
  'Legacy Asaas webhook verifies Asaas token',
);

const metricsPath = path.join(rootDir, 'backend/src/metrics/metrics.controller.ts');
requireIncludes(metricsPath, 'METRICS_TOKEN', 'Metrics endpoint is token-protected');

const diagPath = path.join(rootDir, 'backend/src/app.controller.ts');
requireIncludes(diagPath, 'DIAG_TOKEN', 'Diagnostics endpoint is token-protected');
requireIncludes(diagPath, "@Get('health')", 'Backend exposes liveness health endpoint');

const rootEnvPath = path.join(rootDir, '.env.example');
for (const variable of [
  'ASAAS_WEBHOOK_TOKEN',
  'METRICS_TOKEN',
  'WORKER_METRICS_TOKEN',
  'DIAG_TOKEN',
  'OPS_WEBHOOK_URL',
  'DLQ_WEBHOOK_URL',
  'GUEST_CHAT_ENABLED',
]) {
  requireIncludes(rootEnvPath, variable, `Root env example documents ${variable}`);
}

const backendEnvPath = path.join(rootDir, 'backend/.env.example');
for (const variable of [
  'ASAAS_WEBHOOK_TOKEN',
  'METRICS_TOKEN',
  'WORKER_METRICS_TOKEN',
  'DIAG_TOKEN',
  'OPS_WEBHOOK_URL',
  'DLQ_WEBHOOK_URL',
  'GUEST_CHAT_ENABLED',
  'CORS_ALLOWED_ORIGINS',
  'CORS_ALLOWED_ORIGIN_REGEX',
]) {
  requireIncludes(backendEnvPath, variable, `Backend env example documents ${variable}`);
}

const frontendEnvPath = path.join(rootDir, 'frontend/.env.example');
for (const variable of [
  'NEXT_PUBLIC_API_URL',
  'BACKEND_URL',
  'NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS',
]) {
  requireIncludes(frontendEnvPath, variable, `Frontend env example documents ${variable}`);
}

const claudeSettingsPath = path.join(rootDir, '.claude/settings.json');
requireIncludes(claudeSettingsPath, 'PreToolUse', 'Claude settings define pre-write hooks');
requireIncludes(claudeSettingsPath, 'PostToolUse', 'Claude settings define post-write hooks');
requireIncludes(claudeSettingsPath, 'Stop', 'Claude settings define stop hooks');

const huskyPrePushPath = path.join(rootDir, '.husky/pre-push');
requireIncludes(
  huskyPrePushPath,
  'prepush:scoped',
  'Husky pre-push hook runs the scoped validator',
);

const githubSettingsDocPath = path.join(rootDir, 'docs/GITHUB_REPOSITORY_SETTINGS.md');
for (const keyword of [
  'Secret scanning',
  'Push protection',
  'Dependabot',
  'Code scanning',
  'Copilot',
  'Branch Protection',
]) {
  requireIncludes(githubSettingsDocPath, keyword, `GitHub settings doc covers ${keyword}`);
}

const backendPackagePath = path.join(rootDir, 'backend/package.json');
if (fs.existsSync(backendPackagePath)) {
  const backendPackage = JSON.parse(readText(backendPackagePath));
  check(
    !/prisma\s+db\s+push/i.test(backendPackage.scripts?.['start:prod'] || ''),
    'Backend production start script no longer uses prisma db push',
    'backend/package.json start:prod must not execute prisma db push',
  );
}

const monitoringDocPath = path.join(rootDir, 'docs/MONITORING_AND_ALERTING.md');
for (const keyword of [
  'Sentry',
  'METRICS_TOKEN',
  'OPS_WEBHOOK_URL',
  'DLQ_WEBHOOK_URL',
  '/health/system',
]) {
  requireIncludes(monitoringDocPath, keyword, `Monitoring doc covers ${keyword}`);
}

const stagingDocPath = path.join(rootDir, 'docs/STAGING_ENVIRONMENT.md');
for (const keyword of ['Railway', 'Vercel', 'workflow_dispatch', 'staging', 'preview']) {
  requireIncludes(stagingDocPath, keyword, `Staging doc covers ${keyword}`);
}

const legalDocPath = path.join(rootDir, 'docs/LEGAL_AND_FINANCIAL_COMPLIANCE.md');
for (const keyword of ['LGPD', 'Asaas', 'chargeback', 'refund', 'nota fiscal', 'split']) {
  requireIncludes(legalDocPath, keyword, `Compliance doc covers ${keyword}`);
}

const readinessDocPath = path.join(rootDir, 'docs/PRODUCTION_READINESS.md');
for (const keyword of ['readiness:check', 'pulse:ci', 'staging', 'backup', 'monitoring']) {
  requireIncludes(readinessDocPath, keyword, `Production readiness doc covers ${keyword}`);
}

console.log('');
console.log('KLOEL production-readiness audit');
console.log(`Passes: ${passes.length}`);
console.log(`Failures: ${failures.length}`);

if (failures.length > 0) {
  console.log('');
  for (const failure of failures) {
    console.log(`✗ ${failure.title}`);
    if (failure.detail) {
      console.log(`  ${failure.detail}`);
    }
  }
  process.exit(1);
}

console.log('');
for (const pass of passes.slice(0, 12)) {
  console.log(`✓ ${pass.title}`);
}
if (passes.length > 12) {
  console.log(`… ${passes.length - 12} additional checks passed`);
}
