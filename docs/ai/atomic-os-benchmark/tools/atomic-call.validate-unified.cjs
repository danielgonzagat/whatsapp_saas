'use strict';

const path = require('node:path');
const {
  runValidationStep,
  syntheticValidationStep,
  budgetValidationStep,
  runLineBudgetChecks,
  runSourceChurnBudgetChecks,
  deriveValidationScanFiles,
} = require('./atomic-call.budget.cjs');

function runKloelUnifiedAgentValidation(options = {}) {
  const cwd = process.cwd();
  const protectedPaths = [
    'AGENTS.md',
    'CLAUDE.md',
    'CODEX.md',
    'ops',
    'scripts/ops',
    '.github',
    'docs/codacy',
    'docs/design',
    '.codacy.yml',
    'package.json',
    '.husky/pre-push',
    'backend/eslint.config.mjs',
    'frontend/eslint.config.mjs',
    'worker/eslint.config.mjs',
    'scripts/pulse/no-hardcoded-reality-audit.ts',
  ];
  const forbiddenPattern = ['as an'+'y','@'+'ts-ignore','@'+'ts-expect-error','@'+'ts-nocheck','eslint-'+'disable','biome-'+'ignore','codacy:','NO'+'SONAR','no'+'qa'].join('|');
  const scanFiles = deriveValidationScanFiles(cwd, options);
  const backendEslintFiles = Array.isArray(options.eslintFiles) && options.eslintFiles.length
    ? options.eslintFiles
    : scanFiles
        .filter((fileName) => fileName.startsWith('backend/'))
        .map((fileName) => fileName.slice('backend/'.length));
  const unifiedAgentServiceFile = 'backend/src/kloel/unified-agent.service.ts';
  const enforceFinalServiceResidue =
    options.enforceFinalServiceResidue === true ||
    String(options.validationProfile || '').includes('seven-helper');
  const defaultForbiddenTextChecks =
    enforceFinalServiceResidue && fs.existsSync(path.join(cwd, unifiedAgentServiceFile))
      ? [
        {
          file: unifiedAgentServiceFile,
          text: 'toolRouterDeps',
          label: 'service no cached toolRouterDeps facade state',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'routerDeps',
          label: 'service no routerDeps facade accessor',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'get routerDeps',
          label: 'service no routerDeps getter',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'validateAbiPayload',
          label: 'service delegates cognitive ABI validation',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'forEachSequential(',
          label: 'service no inline forEachSequential tool loop',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'buildPredecidedActionDraft(',
          label: 'service no inline predecided draft',
        },
        {
          file: unifiedAgentServiceFile,
          text: 'executePredecidedAgentActions',
          label: 'service no inline predecided executor',
        },
      ]
    : [];
  const forbiddenTextChecks = [
    ...defaultForbiddenTextChecks,
    ...(Array.isArray(options.forbiddenTextChecks) ? options.forbiddenTextChecks : []),
  ];
  const steps = [];
  if (options.includeJest !== false) {
    steps.push(runValidationStep('jest unified-agent', 'npx', ['jest', 'src/kloel/unified-agent.service.spec.ts', '--runInBand', '--silent'], {
      cwd: path.join(cwd, 'backend'),
    }));
  }
  const shouldRunFocusedEslint =
    options.includeEslint === true || enforceFinalServiceResidue;
  if (shouldRunFocusedEslint && backendEslintFiles.length > 0) {
    steps.push(runValidationStep('focused eslint', 'npx', ['eslint', ...backendEslintFiles, '--max-warnings', '0'], {
      cwd: path.join(cwd, 'backend'),
    }));
  }
  if (options.includeTypecheck !== false) {
    steps.push(runValidationStep('backend typecheck', 'npm', ['--prefix', 'backend', 'run', 'typecheck'], { cwd }));
  }
  steps.push(
    runValidationStep('diff check backend/src/kloel', 'git', ['diff', '--check', '--', 'backend/src/kloel'], { cwd }),
    runValidationStep('protected diff empty', 'git', ['diff', '--name-only', '--', ...protectedPaths], {
      cwd,
      okStatus: (status, result) => status === 0 && String(result.stdout || '').trim() === '',
    }),
    ...(scanFiles.length > 0
      ? [runValidationStep('forbidden suppression scan empty', 'rg', ['-n', forbiddenPattern, ...scanFiles], {
          cwd,
          okStatus: (status) => status === 1,
        })]
      : []),
  );
  for (const check of forbiddenTextChecks) {
    const fileName = check.file || check.path;
    const text = check.text;
    if (typeof fileName !== 'string' || typeof text !== 'string') {
      steps.push(syntheticValidationStep('forbidden text check malformed', false, 'forbiddenTextChecks require file/path and text'));
      continue;
    }
    const absFile = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
    const exists = fs.existsSync(absFile);
    const source = exists ? fs.readFileSync(absFile, 'utf8') : '';
    const ok = exists && !source.includes(text);
    steps.push(syntheticValidationStep(
      check.label || `forbidden text absent: ${fileName}`,
      ok,
      ok ? `absent: ${text}` : `found forbidden text ${JSON.stringify(text)} in ${fileName}`,
    ));
  }
  if (Array.isArray(options.requiredTextChecks)) {
    for (const check of options.requiredTextChecks) {
      const fileName = check.file || check.path;
      const text = check.text;
      if (typeof fileName !== 'string' || typeof text !== 'string') {
        steps.push(syntheticValidationStep('required text check malformed', false, 'requiredTextChecks require file/path and text'));
        continue;
      }
      const absFile = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
      const exists = fs.existsSync(absFile);
      const source = exists ? fs.readFileSync(absFile, 'utf8') : '';
      const ok = exists && source.includes(text);
      steps.push(syntheticValidationStep(
        check.label || `required text present: ${fileName}`,
        ok,
        ok ? `present: ${text}` : `missing required text ${JSON.stringify(text)} in ${fileName}`,
      ));
    }
  }
  if (Array.isArray(options.requiredRegexChecks)) {
    for (const check of options.requiredRegexChecks) {
      const fileName = check.file || check.path;
      const pattern = check.pattern || check.regex;
      if (typeof fileName !== 'string' || typeof pattern !== 'string') {
        steps.push(syntheticValidationStep('required regex check malformed', false, 'requiredRegexChecks require file/path and pattern'));
        continue;
      }
      const absFile = path.isAbsolute(fileName) ? fileName : path.join(cwd, fileName);
      const exists = fs.existsSync(absFile);
      const source = exists ? fs.readFileSync(absFile, 'utf8') : '';
      let regex;
      try {
        regex = new RegExp(pattern, check.flags || '');
      } catch (error) {
        steps.push(syntheticValidationStep(
          check.label || `required regex valid: ${fileName}`,
          false,
          `invalid required regex ${JSON.stringify(pattern)}: ${error.message}`,
        ));
        continue;
      }
      const ok = exists && regex.test(source);
      steps.push(syntheticValidationStep(
        check.label || `required regex present: ${fileName}`,
        ok,
        ok ? `present regex: ${pattern}` : `missing required regex ${JSON.stringify(pattern)} in ${fileName}`,
      ));
    }
  }
  if (Array.isArray(options.lineBudgetChecks)) {
    steps.push(...runLineBudgetChecks(cwd, options.lineBudgetChecks));
  }
  if (Array.isArray(options.sourceChurnBudgetChecks)) {
    steps.push(...runSourceChurnBudgetChecks(cwd, options.sourceChurnBudgetChecks));
  }
  return {
    ok: steps.every((step) => step.ok),
    profile: options.validationProfile || 'kloel-unified-agent-extract',
    scanFiles,
    steps,
  };
}



module.exports = { runKloelUnifiedAgentValidation };
