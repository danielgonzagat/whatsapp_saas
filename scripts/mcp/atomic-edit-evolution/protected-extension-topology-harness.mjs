#!/usr/bin/env node
/**
 * protected-extension-topology-harness.mjs - pure classifier for protected-core
 * extension attempts. It turns A/B acceptance boundaries into machine-checkable
 * findings without knowing the task, repo, or domain-specific file names.
 */

const TEST_PATH_RE = /(^|\/)(__tests__|tests?|specs?)\/|(?:\.|-)(?:test|spec)\.[cm]?[jt]sx?$/;
const SOURCE_PATH_RE = /\.[cm]?[jt]sx?$/;
const PACKAGE_PATH_RE = /(^|\/)package\.json$/;
const PRELOAD_RE = /--(?:import|require)\s+(["']?)([^"'\s]+)\1/g;
const IMPORT_SPECIFIER_RE = /\b(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']\s*\)/g;
const PROTOTYPE_ASSIGN_RE = /(?:\b[A-Za-z_$][\w$]*\.prototype\b|\bprototype\s*\[|\bprototype\s*\.|\bproto\s*\[|\bproto\.)[\s\S]{0,120}=/;
const MONKEY_PATCH_HINT_RE = /\bmonkey[- ]?patch\b|\bprototype\b|\bas\s+unknown\s+as\s+Record\s*</i;
const DEFAULT_PROTECTED_SHADOW_EXTENSIONS = Object.freeze([
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
]);


function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function arrayOfRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '');
}

function withoutExtension(path) {
  return normalizePath(path).replace(/\.[^/.]+$/, '');
}

function basename(path) {
  const parts = normalizePath(path).split('/');
  return parts[parts.length - 1] || '';
}

function dirname(path) {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf('/');
  return slash >= 0 ? normalized.slice(0, slash) : '';
}

function joinNormalizedPath(basePath, childPath) {
  const parts = `${basePath}/${childPath}`.split('/');
  const resolved = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

function resolveImportSpecifier(fromPath, specifier) {
  const raw = String(specifier ?? '');
  if (!raw.startsWith('.')) return normalizePath(raw);
  return joinNormalizedPath(dirname(fromPath), raw);
}

function protectedImportConsumerDetails(consumerPaths, protectedPaths, fileTexts) {
  const details = [];
  for (const consumerPath of consumerPaths) {
    const normalizedConsumer = normalizePath(consumerPath);
    const text = getFileText(fileTexts, normalizedConsumer);
    if (!text) continue;
    IMPORT_SPECIFIER_RE.lastIndex = 0;
    let match;
    while ((match = IMPORT_SPECIFIER_RE.exec(text)) !== null) {
      const specifier = match[1] ?? match[2] ?? '';
      const resolvedStem = withoutExtension(resolveImportSpecifier(normalizedConsumer, specifier));
      const protectedMatch = protectedPaths.find((protectedPath) => {
        const protectedStem = withoutExtension(protectedPath);
        return resolvedStem === protectedStem || resolvedStem.endsWith(`/${protectedStem}`);
      });
      if (protectedMatch) {
        details.push({ consumerPath: normalizedConsumer, importSpecifier: specifier, protectedPath: protectedMatch });
      }
    }
  }
  return details;
}


function isProtectedPath(path, protectedPaths) {
  const normalized = normalizePath(path);
  return protectedPaths.some((candidate) => {
    const protectedPath = normalizePath(candidate);
    if (!protectedPath) return false;
    if (protectedPath.endsWith('/**')) {
      return normalized.startsWith(protectedPath.slice(0, -3));
    }
    if (protectedPath.endsWith('/')) {
      return normalized.startsWith(protectedPath);
    }
    return normalized === protectedPath || normalized.startsWith(`${protectedPath}/`);
  });
}

function splitExtension(path) {
  const normalized = normalizePath(path);
  const slash = normalized.lastIndexOf('/');
  const dot = normalized.lastIndexOf('.');
  if (dot <= slash) {
    return { stem: normalized, ext: '' };
  }
  return { stem: normalized.slice(0, dot), ext: normalized.slice(dot) };
}

function isProtectedShadowPath(path, protectedPaths, shadowExtensions) {
  const candidate = splitExtension(path);
  if (!candidate.stem || !shadowExtensions.includes(candidate.ext)) return false;
  return protectedPaths.some((protectedPathRaw) => {
    const protectedPath = normalizePath(protectedPathRaw);
    if (!protectedPath || protectedPath.endsWith('/') || protectedPath.endsWith('/**')) return false;
    const protectedSplit = splitExtension(protectedPath);
    const shadowsProtectedStem = candidate.stem === protectedSplit.stem
      || candidate.stem.startsWith(`${protectedSplit.stem}.`)
      || candidate.stem.startsWith(`${protectedSplit.stem}-`);
    return normalizePath(path) !== protectedPath && shadowsProtectedStem;
  });
}

function operationPath(record) {
  if (!isRecord(record)) return '';
  const direct = record.path ?? record.file ?? record.target;
  if (typeof direct === 'string') return normalizePath(direct);
  const input = isRecord(record.input) ? record.input : {};
  for (const key of ['path', 'file', 'target']) {
    if (typeof input[key] === 'string') return normalizePath(input[key]);
  }
  return '';
}

function hasPositiveDelta(file) {

  return (Number(file.additions ?? 0) > 0)
    || (Number(file.deletions ?? 0) > 0)
    || ['A', 'M', 'D', 'R', 'C'].includes(String(file.status ?? '').toUpperCase());
}

function finding(kind, message, detail = null) {
  return { kind, message, detail };
}

function getFileText(fileTexts, path) {
  if (!isRecord(fileTexts)) return '';
  const normalized = normalizePath(path);
  return typeof fileTexts[normalized] === 'string' ? fileTexts[normalized] : '';
}

function collectPreloads(fileTexts) {
  const preloads = [];
  if (!isRecord(fileTexts)) return preloads;
  for (const [rawPath, rawText] of Object.entries(fileTexts)) {
    const sourcePath = normalizePath(rawPath);
    const text = typeof rawText === 'string' ? rawText : '';
    if (!PACKAGE_PATH_RE.test(sourcePath) && !/\bnpm\s+test\b|\bnode\s+--(?:import|require)\b/.test(text)) {
      continue;
    }
    PRELOAD_RE.lastIndex = 0;
    let match;
    while ((match = PRELOAD_RE.exec(text)) !== null) {
      preloads.push({ sourcePath, importedPath: normalizePath(match[2]) });
    }
  }
  return preloads;
}

function isAllowedPreload(importedPath, allowedPreloads) {
  const normalized = normalizePath(importedPath);
  return allowedPreloads.some((candidate) => {
    const allowed = normalizePath(candidate);
    return normalized === allowed || normalized.endsWith(allowed);
  });
}

function textReferencesPath(text, targetPath) {

  const target = withoutExtension(targetPath);
  const base = withoutExtension(basename(targetPath));
  const normalizedText = String(text ?? '').replace(/\\/g, '/');
  return normalizedText.includes(target)
    || normalizedText.includes(`./${target}`)
    || (base.length > 0 && normalizedText.includes(base));
}

function isPreloadRuntimeWired(preload, runtimeEntrypoints, fileTexts) {
  return runtimeEntrypoints.some((entryPath) => textReferencesPath(getFileText(fileTexts, entryPath), preload.importedPath));
}

function changedSourceImplementationFiles(changedFiles, protectedPaths) {
  return changedFiles
    .map((file) => ({ ...file, path: normalizePath(file.path) }))
    .filter((file) => hasPositiveDelta(file))
    .filter((file) => SOURCE_PATH_RE.test(file.path))
    .filter((file) => !TEST_PATH_RE.test(file.path))
    .filter((file) => !isProtectedPath(file.path, protectedPaths));
}

function entrypointReferencesImplementation(entryText, implementationPath) {
  return textReferencesPath(entryText, implementationPath);
}

function hasPublicEntrypointWiring(implementationFiles, runtimeEntrypoints, fileTexts) {
  if (implementationFiles.length === 0) return true;
  return implementationFiles.some((file) => runtimeEntrypoints.some((entryPath) => {
    const entryText = getFileText(fileTexts, entryPath);
    return entrypointReferencesImplementation(entryText, file.path);
  }));
}

function monkeyPatchFiles(changedFiles, fileTexts) {
  return changedFiles
    .map((file) => normalizePath(file.path))
    .filter((path) => SOURCE_PATH_RE.test(path))
    .filter((path) => {
      const text = getFileText(fileTexts, path);
      return PROTOTYPE_ASSIGN_RE.test(text) || (MONKEY_PATCH_HINT_RE.test(text) && /\bprototype\b/.test(text));
    });
}

export function classifyProtectedExtensionTopology(input) {
function hasGovernedProtectedMutationProof(record) {
  if (!isRecord(record)) return false;
  const validationPlan = arrayOfStrings(record.validationPlan);
  const hasReceipt = typeof record.receipt === 'string' && record.receipt.trim().length > 0;
  const hasProof = typeof record.proof === 'string' && record.proof.trim().length > 0;
  return typeof record.path === 'string'
    && record.path.trim().length > 0
    && typeof record.intent === 'string'
    && record.intent.trim().length > 0
    && validationPlan.length > 0
    && (hasReceipt || hasProof);
}

  if (!isRecord(input)) {
    return {
      ok: false,
      blockers: [finding('INPUT_INVALID', 'input must be an object')],
      warnings: [],
      findings: [],
      honestCeiling: HONEST_CEILING,
    };
  }

  const protectedPaths = arrayOfStrings(input.protectedPaths).map(normalizePath);
  const runtimeEntrypoints = arrayOfStrings(input.runtimeEntrypoints).map(normalizePath);
  const acceptanceEntrypoints = arrayOfStrings(input.acceptanceEntrypoints).map(normalizePath);
  const requireAcceptanceEntrypointCoverage = input.requireAcceptanceEntrypointCoverage === true;
  const blockDirectProtectedAcceptanceConsumers = input.blockDirectProtectedAcceptanceConsumers === true;
  const changedFiles = arrayOfRecords(input.changedFiles).map((file) => ({
    ...file,
    path: normalizePath(file.path),
  }));
  const fileTexts = isRecord(input.fileTexts) ? input.fileTexts : {};
  const testChangesAllowed = input.testChangesAllowed === true;
  const requirePublicEntrypointWiring = input.requirePublicEntrypointWiring === true;
  const allowPrototypeMonkeyPatch = input.allowPrototypeMonkeyPatch === true;
  const allowedPreloads = arrayOfStrings(input.allowedPreloads).map(normalizePath);
  const operationHistory = arrayOfRecords(input.operationHistory);
  const allowGovernedProtectedMutations = input.allowGovernedProtectedMutations === true;
  const governedProtectedMutationRecords = arrayOfRecords(input.governedProtectedMutations).map((record) => ({
    ...record,
    path: normalizePath(record.path),
  }));
  const allowProtectedShadowFiles = input.allowProtectedShadowFiles === true;
  const inputShadowExtensions = arrayOfStrings(input.protectedShadowExtensions);
  const protectedShadowExtensions = (inputShadowExtensions.length > 0
    ? inputShadowExtensions
    : [...DEFAULT_PROTECTED_SHADOW_EXTENSIONS])
    .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));


  const blockers = [];
  const warnings = [];
  const findings = [];

  const protectedMutations = changedFiles
    .filter(hasPositiveDelta)
    .filter((file) => isProtectedPath(file.path, protectedPaths))
    .map((file) => file.path);
  const governedProtectedMutations = protectedMutations.filter((path) => allowGovernedProtectedMutations
    && governedProtectedMutationRecords.some((record) => record.path === path && hasGovernedProtectedMutationProof(record)));
  const ungovernedProtectedMutations = protectedMutations
    .filter((path) => !governedProtectedMutations.includes(path));
  if (ungovernedProtectedMutations.length > 0) {
    blockers.push(finding('PROTECTED_FILE_MUTATION', 'changed files include ungoverned protected paths', ungovernedProtectedMutations));
  }
  if (governedProtectedMutations.length > 0) {
    warnings.push(finding(
      'GOVERNED_PROTECTED_MUTATION_ALLOWED',
      'protected paths changed under explicit governed override metadata; review validation proof before accepting',
      governedProtectedMutationRecords.filter((record) => governedProtectedMutations.includes(record.path)),
    ));
  }


  const protectedShadowFiles = changedFiles
    .filter(hasPositiveDelta)
    .map((file) => file.path)
    .filter((path) => isProtectedShadowPath(path, protectedPaths, protectedShadowExtensions));
  const protectedShadowAttempts = operationHistory
    .map(operationPath)
    .filter(Boolean)
    .filter((path) => isProtectedShadowPath(path, protectedPaths, protectedShadowExtensions));
  const protectedShadowAll = [...new Set([...protectedShadowFiles, ...protectedShadowAttempts])];
  if (!allowProtectedShadowFiles && protectedShadowAll.length > 0) {
    blockers.push(finding(
      'PROTECTED_SHADOW_FILE_ATTEMPT',
      'changed or attempted files shadow protected paths by same stem with another runtime extension or sidecar suffix',
      protectedShadowAll,
    ));
  } else if (protectedShadowAll.length > 0) {
    warnings.push(finding(
      'PROTECTED_SHADOW_FILE_ALLOWED',
      'protected same-stem shadow files were explicitly allowed but remain high risk',
      protectedShadowAll,
    ));
  }

  const testMutations = changedFiles
    .filter(hasPositiveDelta)
    .filter((file) => TEST_PATH_RE.test(file.path))
    .map((file) => file.path);
  if (!testChangesAllowed && testMutations.length > 0) {
    blockers.push(finding('PROMPT_FORBIDDEN_TEST_CHANGE', 'tests changed while the acceptance policy forbids test edits', testMutations));
  } else if (testMutations.length > 0) {
    warnings.push(finding('TEST_CHANGE_ALLOWED', 'tests changed under an explicit allow-test-edits policy', testMutations));
  }

  const preloads = collectPreloads(fileTexts)
    .filter((preload) => !isAllowedPreload(preload.importedPath, allowedPreloads));

  const testOnlyPreloads = preloads.filter((preload) => !isPreloadRuntimeWired(preload, runtimeEntrypoints, fileTexts));
  if (testOnlyPreloads.length > 0) {
    blockers.push(finding('TEST_ONLY_PRELOAD', 'runtime behavior is loaded through command preload without public product entrypoint wiring', testOnlyPreloads));
  }

  const implementationFiles = changedSourceImplementationFiles(changedFiles, protectedPaths);
  const publicEntrypointWired = hasPublicEntrypointWiring(implementationFiles, runtimeEntrypoints, fileTexts);
  if (requirePublicEntrypointWiring && !publicEntrypointWired) {
    blockers.push(finding(
      'MISSING_PUBLIC_ENTRYPOINT_WIRING',
      'changed implementation files are not referenced by the declared runtime/public entrypoints',
      implementationFiles.map((file) => file.path),
    ));
  }

  const directProtectedAcceptanceConsumers = protectedImportConsumerDetails(
    acceptanceEntrypoints,
    protectedPaths,
    fileTexts,
  );
  if (
    directProtectedAcceptanceConsumers.length > 0
    && protectedMutations.length === 0
    && (blockDirectProtectedAcceptanceConsumers
      || (requireAcceptanceEntrypointCoverage && implementationFiles.length > 0))
  ) {
    blockers.push(finding(
      'DIRECT_PROTECTED_IMPORT_CONSUMER_UNSERVED',
      'acceptance or runtime consumers import protected paths directly, so a public side adapter cannot satisfy that behavior without a governed protected mutation or consumer migration',
      directProtectedAcceptanceConsumers,
    ));
  }

  const monkeyPatches = monkeyPatchFiles(changedFiles, fileTexts);
  if (!allowPrototypeMonkeyPatch && monkeyPatches.length > 0) {
    blockers.push(finding('PROTOTYPE_MONKEY_PATCH', 'changed source files patch prototypes or equivalent runtime objects', monkeyPatches));
  } else if (monkeyPatches.length > 0) {
    warnings.push(finding('PROTOTYPE_MONKEY_PATCH_ALLOWED', 'prototype patching was explicitly allowed but remains high risk', monkeyPatches));
  }

  findings.push(
    finding('PROTECTED_MUTATIONS', 'protected changed paths found', protectedMutations),
    finding('GOVERNED_PROTECTED_MUTATIONS', 'protected changed paths admitted by governed override metadata', governedProtectedMutations),
    finding('UNGOVERNED_PROTECTED_MUTATIONS', 'protected changed paths without governed override metadata', ungovernedProtectedMutations),
    finding('PROTECTED_SHADOW_FILES', 'changed paths shadowing protected files found', protectedShadowFiles),
    finding('PROTECTED_SHADOW_ATTEMPTS', 'operation-history paths shadowing protected files found', protectedShadowAttempts),
    finding('TEST_MUTATIONS', 'test changed paths found', testMutations),
    finding('COMMAND_PRELOADS', 'command preloads found', preloads),
    finding('IMPLEMENTATION_FILES', 'changed non-test source implementation files found', implementationFiles.map((file) => file.path)),
    finding('PUBLIC_ENTRYPOINT_WIRED', 'at least one changed implementation file is referenced by runtime/public entrypoints', publicEntrypointWired),
    finding('DIRECT_PROTECTED_ACCEPTANCE_CONSUMERS', 'acceptance or runtime consumers importing protected paths directly found', directProtectedAcceptanceConsumers),
    finding('MONKEY_PATCH_FILES', 'prototype patching files found', monkeyPatches),
  );

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    findings,
    protectedPaths,
    runtimeEntrypoints,
    acceptanceEntrypoints,
    blockDirectProtectedAcceptanceConsumers,
    allowGovernedProtectedMutations,
    governedProtectedMutationRecords,
    protectedShadowExtensions,
    changedFiles,
    honestCeiling: HONEST_CEILING,
  };
}

export const HONEST_CEILING = 'Pure topology classifier only. It uses supplied changed-file metadata and supplied file text; it does not inspect git, prove behavioral correctness, or decide whether protected policy itself is valid.';

export function runCli(argv = process.argv.slice(2), stdin = '') {
  if (!argv.includes('--classify-protected-extension-topology')) {
    return {
      ok: false,
      blockers: [finding('COMMAND_INVALID', 'expected --classify-protected-extension-topology')],
      warnings: [],
      findings: [],
      honestCeiling: HONEST_CEILING,
    };
  }
  let input;
  try {
    input = JSON.parse(stdin || '{}');
  } catch (error) {
    return {
      ok: false,
      blockers: [finding('JSON_INVALID', error instanceof Error ? error.message : String(error))],
      warnings: [],
      findings: [],
      honestCeiling: HONEST_CEILING,
    };
  }
  return classifyProtectedExtensionTopology(input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    stdin += chunk;
  });
  process.stdin.on('end', () => {
    const result = runCli(process.argv.slice(2), stdin);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}
