#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  check,
  daysSince,
  failures,
  isTracked,
  passes,
  readText,
  relative,
  requireFile,
  requireIncludes,
  requireNotRegex,
  requireRegex,
  rootDir,
} from './production-readiness/helpers.mjs';
import { auditGithubWorkflows } from './production-readiness/github-workflows.mjs';

/**
 * Assert that `filePath` resolves inside the repo root, then return whether
 * the path exists. Throws on traversal attempts.
 */
function safeExistsSync(filePath) {
  const resolved = path.resolve(filePath);
  const boundary = rootDir + path.sep;
  if (resolved !== rootDir && !resolved.startsWith(boundary)) {
    throw new Error(`Path traversal detected: ${resolved} is outside repo root`);
  }
  return fs.existsSync(resolved);
}

const requiredFiles = [
  ['.github/workflows/ci-cd.yml', 'CI workflow exists'],
  ['.github/workflows/codeql.yml', 'CodeQL workflow exists'],
  ['.github/workflows/codacy-analysis.yml', 'Codacy analysis workflow exists'],
  ['.github/workflows/dependabot-auto-merge.yml', 'Dependabot auto-merge workflow exists'],
  ['.github/workflows/deploy-staging.yml', 'Staging deploy workflow exists'],
  ['.github/workflows/deploy-production.yml', 'Production deploy workflow exists'],
  ['.github/workflows/nightly-ops-audit.yml', 'Nightly ops audit workflow exists'],
  ['.github/workflows/release-please.yml', 'Release Please workflow exists'],
  ['.github/dependabot.yml', 'Dependabot config exists'],
  ['.github/CODEOWNERS', 'CODEOWNERS policy exists'],
  ['.github/branch-protection.json', 'Branch protection policy doc exists'],
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
  ['.eslint-seatbelt.tsv', 'ESLint seatbelt baseline exists'],
  ['codecov.yml', 'Codecov config exists'],
  ['knip.json', 'Knip config exists'],
  ['.mcp.json', 'MCP config exists'],
  ['release-please-config.json', 'Release Please config exists'],
  ['.release-please-manifest.json', 'Release Please manifest exists'],
  ['.husky/pre-commit', 'Husky pre-commit hook exists'],
  ['.husky/pre-push', 'Husky pre-push hook exists'],
  ['.husky/commit-msg', 'Husky commit-msg hook exists'],
  ['.claude/settings.json', 'Claude hooks config exists'],
  ['scripts/ops/auto-sync-main.sh', 'Auto-sync runner exists'],
  ['scripts/ops/install-auto-sync-launchagent.sh', 'Auto-sync installer exists'],
  ['scripts/ops/print-auto-sync-status.sh', 'Auto-sync status printer exists'],
  ['scripts/ops/run-scoped-pre-push.mjs', 'Scoped pre-push validator exists'],
  ['scripts/ops/collect-knip-issues.mjs', 'Knip collector exists'],
  ['scripts/ops/check-madge-cycles.mjs', 'Madge cycle checker exists'],
  ['scripts/ops/run-eslint-seatbelt.mjs', 'Seatbelt runner exists'],
  ['scripts/ops/normalize-lcov-paths.mjs', 'LCOV normalizer exists'],
  ['backend/src/instrument.ts', 'Sentry bootstrap file exists'],
  [
    'backend/src/common/middleware/prompt-sanitizer.middleware.ts',
    'Prompt sanitization middleware exists',
  ],
  ['backend/src/health/system-health.controller.ts', 'System health controller exists'],
];

for (const [relPath, title] of requiredFiles) {
  requireFile(relPath, title);
}

for (const relPath of [
  '.eslint-seatbelt.tsv',
  'ratchet.json',
  'PULSE_HEALTH.json',
  'PULSE_CLI_DIRECTIVE.json',
  'PULSE_ARTIFACT_INDEX.json',
  'PULSE_WORLD_STATE.json',
  'PULSE_CERTIFICATE.json',
]) {
  check(
    isTracked(relPath),
    `${relPath} is versioned`,
    `${relPath} must be tracked so CI and nightly ratchets do not depend on local-only artifacts`,
  );
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
  'seatbelt:update',
  'seatbelt:bootstrap',
  'seatbelt:check',
  'format',
  'format:check',
  'quality:graph',
  'quality:graph:strict',
  'quality:dead-code',
  'quality:dead-code:strict',
  'quality:static',
  'backend:test:coverage',
  'frontend:test:coverage',
  'worker:test:coverage',
  'test:coverage',
  'coverage:normalize',
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
if (safeExistsSync(backupManifestPath)) {
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
if (safeExistsSync(drLogPath)) {
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

auditGithubWorkflows();

const dependabotPath = path.join(rootDir, '.github/dependabot.yml');
for (const keyword of ['github-actions', '/backend', '/frontend', '/worker', '/e2e']) {
  requireIncludes(dependabotPath, keyword, `Dependabot covers ${keyword}`);
}

const mainTsPath = path.join(rootDir, 'backend/src/main.ts');
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
  'SentryModule.forRoot()',
  'Backend wires the official Sentry module',
);
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

const paymentWebhookPath = path.join(rootDir, 'backend/src/webhooks/payment-webhook.controller.ts');
requireIncludes(
  paymentWebhookPath,
  'STRIPE_WEBHOOK_SECRET',
  'Payment webhook verifies Stripe signature secret',
);
requireIncludes(
  paymentWebhookPath,
  "@Post('stripe')",
  'Payment webhook exposes the Stripe endpoint',
);

const metricsPath = path.join(rootDir, 'backend/src/metrics/metrics.controller.ts');
requireIncludes(metricsPath, 'METRICS_TOKEN', 'Metrics endpoint is token-protected');

const diagPath = path.join(rootDir, 'backend/src/app.controller.ts');
requireIncludes(diagPath, 'DIAG_TOKEN', 'Diagnostics endpoint is token-protected');
requireIncludes(diagPath, "@Get('health')", 'Backend exposes liveness health endpoint');

const rootEnvPath = path.join(rootDir, '.env.example');
for (const variable of [
  'STRIPE_WEBHOOK_SECRET',
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
  'STRIPE_WEBHOOK_SECRET',
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
  'Codecov',
  'Codacy',
  'seatbelt',
  'Code scanning',
  'Copilot',
  'Branch Protection',
  'Require one approving review',
  'Require CODEOWNER reviews',
  'linear history',
  '.mcp.json',
  'release-please',
]) {
  requireIncludes(githubSettingsDocPath, keyword, `GitHub settings doc covers ${keyword}`);
}

const mcpConfigPath = path.join(rootDir, '.mcp.json');
if (!safeExistsSync(mcpConfigPath)) {
  check(false, 'Codacy MCP server is configured', 'missing .mcp.json');
} else {
  const mcpConfig = readText(mcpConfigPath);
  const usesOfficialPackage = mcpConfig.includes('@codacy/codacy-mcp');
  const usesLauncher = mcpConfig.includes('scripts/mcp/codacy-mcp-launcher.sh');
  check(
    usesOfficialPackage || usesLauncher,
    'Codacy MCP server is configured',
    '.mcp.json must include "@codacy/codacy-mcp" or "scripts/mcp/codacy-mcp-launcher.sh"',
  );
}

const branchProtectionPath = path.join(rootDir, '.github/branch-protection.json');
if (safeExistsSync(branchProtectionPath)) {
  try {
    const branchProtection = JSON.parse(readText(branchProtectionPath));
    check(
      branchProtection.branch === 'main',
      'Branch protection targets main',
      '.github/branch-protection.json must target main',
    );
    check(
      branchProtection.required_pull_request_reviews?.required_approving_review_count === 1,
      'Branch protection requires one approval',
      'required_approving_review_count must be 1 for the CODEOWNERS policy',
    );
    check(
      branchProtection.required_pull_request_reviews?.require_code_owner_reviews === true,
      'Branch protection requires CODEOWNERS approval',
      'require_code_owner_reviews must be true for the CODEOWNERS policy',
    );
    check(
      branchProtection.required_linear_history === true,
      'Branch protection enforces linear history',
      'required_linear_history must be true',
    );
    const requiredContexts = [
      'architecture',
      'quality',
      'e2e',
      'Analyze (javascript-typescript)',
      'claude-review',
      'Visual diff (Chromium)',
      'codecov/patch',
      'Codacy Analysis',
      'Codacy Static Code Analysis',
      'Codacy Diff Coverage',
    ];
    const configuredContexts = branchProtection.required_status_checks?.contexts || [];
    for (const context of requiredContexts) {
      check(
        configuredContexts.includes(context),
        `Branch protection requires ${context}`,
        `.github/branch-protection.json must include ${context} in required_status_checks.contexts`,
      );
    }
  } catch (error) {
    check(false, 'Branch protection policy is valid JSON', String(error));
  }
}

const backendPackagePath = path.join(rootDir, 'backend/package.json');
if (safeExistsSync(backendPackagePath)) {
  const backendPackage = JSON.parse(readText(backendPackagePath));
  check(
    !/prisma\s+db\s+push/i.test(backendPackage.scripts?.['start:prod'] || ''),
    'Backend production start script no longer uses prisma db push',
    'backend/package.json start:prod must not execute prisma db push',
  );
}

const rootPackagePath = path.join(rootDir, 'package.json');
if (safeExistsSync(rootPackagePath)) {
  const rootPackage = JSON.parse(readText(rootPackagePath));
  check(
    rootPackage.scripts?.['railway:backend:build'] ===
      'npm --prefix backend ci --include=dev && npm --prefix backend run prisma:generate && npm --prefix backend run build',
    'Root Railway backend build script uses npm --prefix contract',
    'package.json railway:backend:build must delegate to backend via npm --prefix instead of shell cd.',
  );
  check(
    rootPackage.scripts?.['railway:backend:start'] === 'npm --prefix backend run start:prod',
    'Root Railway backend start script uses npm --prefix contract',
    'package.json railway:backend:start must delegate to backend via npm --prefix instead of shell cd.',
  );
}

const railwayTomlPath = path.join(rootDir, 'railway.toml');
if (safeExistsSync(railwayTomlPath)) {
  const railwayToml = readText(railwayTomlPath);
  requireIncludes(
    railwayTomlPath,
    'buildCommand = "npm run railway:backend:build"',
    'Railway build command uses root canonical backend script',
  );
  requireIncludes(
    railwayTomlPath,
    'startCommand = "npm run railway:backend:start"',
    'Railway start command uses root canonical backend script',
  );
  requireIncludes(
    railwayTomlPath,
    'healthcheckPath = "/health/live"',
    'Railway healthcheck uses liveness endpoint',
  );
  check(
    !/Command\s*=\s*".*\bcd\b/i.test(railwayToml),
    'Railway commands avoid shell builtin cd',
    'railway.toml build/start commands must not depend on shell builtin cd.',
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
