#!/usr/bin/env node

/**
 * Codacy MAX-RIGOR lock for whatsapp_saas.
 *
 * This script is the only allowed mutation path for Codacy live state:
 * - keep a single canonical coding standard linked to the repo
 * - require that the canonical coding standard has all tools + all patterns enabled
 * - force repository quality thresholds to their strictest intended values
 * - force commit / PR quality gates to a zero-tolerance posture
 * - force provider integration features on (commit status, summaries, coverage)
 * - keep build-server analysis enabled
 *
 * Usage:
 *   npm run codacy:enforce-max-rigor
 *   npm run codacy:check-max-rigor
 */

const BASE_URL = 'https://api.codacy.com/api/v3';
const PROVIDER = process.env.CODACY_PROVIDER || 'gh';
const ORGANIZATION = process.env.CODACY_ORGANIZATION || 'danielgonzagat';
const REPOSITORY = process.env.CODACY_REPOSITORY || 'whatsapp_saas';
const MAX_RIGOR_GATE_POLICY_NAME = 'KLOEL Max Rigor';
const CHECK_ONLY = process.argv.includes('--check');

/**
 * Tools we explicitly DISABLE in MAX-RIGOR. These are deprecated by their
 * upstream maintainers and produce duplicative noise vs. Codacy's modern
 * engines. Listed by tool UUID so renames don't reintroduce them.
 *
 * Documentation contract: each entry must cite (a) the upstream deprecation
 * notice and (b) the modern replacement that already runs in this repo.
 */
const DEPRECATED_DISABLED_TOOLS = Object.freeze([
  {
    uuid: '612c22f7-663d-429c-ac02-e5cb3d1eb020',
    name: 'TSLint',
    upstreamStatus: 'Deprecated by Palantir 2019-12-01 (https://palantir.github.io/tslint/).',
    replacement: 'ESLint + Biome (both already enabled in .codacy.yml).',
  },
]);

const TARGET_REPOSITORY_QUALITY = Object.freeze({
  maxIssuePercentage: 0,
  maxDuplicatedFilesPercentage: 0,
  minCoveragePercentage: 100,
  maxComplexFilesPercentage: 0,
  fileDuplicationBlockThreshold: 0,
  fileComplexityValueThreshold: 0,
});

const TARGET_COMMIT_GATE = Object.freeze({
  issueThreshold: { threshold: 0, minimumSeverity: 'Info' },
  securityIssueThreshold: 0,
  securityIssueMinimumSeverity: 'Info',
  duplicationThreshold: 0,
  coverageThresholdWithDecimals: 0,
  complexityThreshold: 0,
});

const TARGET_PULL_REQUEST_GATE = Object.freeze({
  ...TARGET_COMMIT_GATE,
  diffCoverageThreshold: 100,
});

function getToken() {
  const entries = [
    ['CODACY_API_TOKEN', process.env.CODACY_API_TOKEN],
    ['CODACY_ACCOUNT_TOKEN', process.env.CODACY_ACCOUNT_TOKEN],
    ['CODACY_PROJECT_TOKEN', process.env.CODACY_PROJECT_TOKEN],
  ];
  const match = entries.find(([, value]) => typeof value === 'string' && value.trim().length > 0);
  if (!match) {
    throw new Error(
      'CODACY_API_TOKEN / CODACY_ACCOUNT_TOKEN / CODACY_PROJECT_TOKEN missing. ' +
        'Cannot verify or enforce Codacy max-rigor state.',
    );
  }
  return {
    name: match[0],
    value: match[1].trim(),
  };
}

const TOKEN = getToken();

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSortObject(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, inner]) => [key, stableSortObject(inner)]),
    );
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(stableSortObject(left)) === JSON.stringify(stableSortObject(right));
}

function jsonHeaders() {
  return {
    'api-token': TOKEN.value,
    'content-type': 'application/json',
  };
}

async function request(method, pathname, body) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: jsonHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    data,
    raw,
  };
}

async function expectJson(method, pathname, body) {
  const response = await request(method, pathname, body);
  if (!response.ok) {
    throw new Error(`${method} ${pathname} -> ${response.status} ${response.raw.slice(0, 400)}`);
  }
  return response.data;
}

async function getRepository() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}`,
  );
  return payload.data;
}

async function listOrganizationTools() {
  const payload = await expectJson('GET', '/tools');
  return payload.data || [];
}

async function listCodingStandardTools(codingStandardId) {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/coding-standards/${codingStandardId}/tools`,
  );
  return payload.data || [];
}

async function getCodingStandard(codingStandardId) {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/coding-standards/${codingStandardId}`,
  );
  return payload.data;
}

async function getToolPatternTotal(toolUuid) {
  const payload = await expectJson('GET', `/tools/${toolUuid}/patterns?limit=1`);
  return Number(payload.pagination?.total || 0);
}

async function getRepositoryQualitySettings() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/quality/repository`,
  );
  return payload.data;
}

async function putRepositoryQualitySettings(settings) {
  return expectJson(
    'PUT',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/quality/repository`,
    settings,
  );
}

async function getCommitQualitySettings() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/quality/commits`,
  );
  return payload.data?.qualityGate || {};
}

async function putCommitQualitySettings(settings) {
  return expectJson(
    'PUT',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/quality/commits`,
    settings,
  );
}

async function getPullRequestQualitySettings() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/quality/pull-requests`,
  );
  return payload.data?.qualityGate || {};
}

async function putPullRequestQualitySettings(settings) {
  return expectJson(
    'PUT',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/quality/pull-requests`,
    settings,
  );
}

async function getBuildServerAnalysisSetting() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/analysis`,
  );
  return Boolean(payload.buildServerAnalysisSetting);
}

async function updateBuildServerAnalysisSetting(enabled) {
  return expectJson(
    'PATCH',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/settings/analysis`,
    { buildServerAnalysisSetting: enabled },
  );
}

async function getProviderIntegrationSettings() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/integrations/providerSettings`,
  );
  return payload.settings || {};
}

async function patchProviderIntegrationSettings(settings) {
  return expectJson(
    'PATCH',
    `/organizations/${PROVIDER}/${ORGANIZATION}/repositories/${REPOSITORY}/integrations/providerSettings`,
    settings,
  );
}

async function listGatePolicies() {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/gate-policies?limit=100`,
  );
  return payload.data || [];
}

async function createGatePolicy(settings) {
  const payload = await expectJson(
    'POST',
    `/organizations/${PROVIDER}/${ORGANIZATION}/gate-policies`,
    {
      gatePolicyName: MAX_RIGOR_GATE_POLICY_NAME,
      isDefault: false,
      settings,
    },
  );
  return payload.data;
}

async function updateGatePolicy(gatePolicyId, settings) {
  const payload = await expectJson(
    'PATCH',
    `/organizations/${PROVIDER}/${ORGANIZATION}/gate-policies/${gatePolicyId}`,
    {
      gatePolicyName: MAX_RIGOR_GATE_POLICY_NAME,
      isDefault: false,
      settings,
    },
  );
  return payload.data;
}

async function applyGatePolicy(gatePolicyId, repoName, linkedRepoNames) {
  const unlink = linkedRepoNames.filter((name) => name !== repoName);
  return expectJson(
    'PUT',
    `/organizations/${PROVIDER}/${ORGANIZATION}/gate-policies/${gatePolicyId}/repositories`,
    {
      link: [repoName],
      unlink,
    },
  );
}

async function listGatePolicyRepositories(gatePolicyId) {
  const payload = await expectJson(
    'GET',
    `/organizations/${PROVIDER}/${ORGANIZATION}/gate-policies/${gatePolicyId}/repositories?limit=100`,
  );
  return payload.data || [];
}

async function patchCodingStandardRepositories(codingStandardId, body) {
  return expectJson(
    'PATCH',
    `/organizations/${PROVIDER}/${ORGANIZATION}/coding-standards/${codingStandardId}/repositories`,
    body,
  );
}

async function patchCodingStandardTool(codingStandardId, toolUuid, body) {
  return expectJson(
    'PATCH',
    `/organizations/${PROVIDER}/${ORGANIZATION}/coding-standards/${codingStandardId}/tools/${toolUuid}`,
    body,
  );
}

async function ensureDeprecatedToolsDisabled(codingStandardId, standardTools) {
  const actions = [];
  for (const deprecated of DEPRECATED_DISABLED_TOOLS) {
    const entry = standardTools.find((tool) => tool.uuid === deprecated.uuid);
    if (!entry) {
      // Tool not present in the standard's tool list — nothing to disable.
      continue;
    }
    if (entry.isEnabled === false || entry.enabled === false) {
      continue;
    }
    await patchCodingStandardTool(codingStandardId, deprecated.uuid, { isEnabled: false });
    actions.push(deprecated.name);
  }
  return actions;
}

function normalizeRepositoryQualitySettings(data) {
  return {
    maxIssuePercentage: Number(data.maxIssuePercentage),
    maxDuplicatedFilesPercentage: Number(data.maxDuplicatedFilesPercentage),
    minCoveragePercentage: Number(data.minCoveragePercentage),
    maxComplexFilesPercentage: Number(data.maxComplexFilesPercentage),
    fileDuplicationBlockThreshold: Number(data.fileDuplicationBlockThreshold),
    fileComplexityValueThreshold: Number(data.fileComplexityValueThreshold),
  };
}

function normalizeQualityGateSettings(data, { includeDiffCoverage }) {
  const normalized = {
    issueThreshold: {
      threshold: Number(data.issueThreshold?.threshold ?? 0),
      minimumSeverity: data.issueThreshold?.minimumSeverity ?? 'Info',
    },
    securityIssueThreshold: Number(data.securityIssueThreshold ?? 0),
    securityIssueMinimumSeverity: data.securityIssueMinimumSeverity ?? 'Info',
    duplicationThreshold: Number(data.duplicationThreshold ?? 0),
    coverageThresholdWithDecimals: Number(data.coverageThresholdWithDecimals ?? 0),
    complexityThreshold: Number(data.complexityThreshold ?? 0),
  };

  if (includeDiffCoverage) {
    normalized.diffCoverageThreshold = Number(data.diffCoverageThreshold ?? 0);
  }

  return normalized;
}

function buildProviderSettingsTarget(current) {
  const target = {
    commitStatus: true,
    pullRequestComment: true,
    pullRequestSummary: true,
    coverageSummary: true,
    suggestions: true,
    pullRequestUnifiedSummary: true,
  };

  if ('aiEnhancedComments' in current) {
    target.aiEnhancedComments = true;
  }
  if ('aiPullRequestReviewer' in current) {
    target.aiPullRequestReviewer = true;
  }
  if ('aiPullRequestReviewerAutomatic' in current) {
    target.aiPullRequestReviewerAutomatic = true;
  }

  return target;
}

function pickCanonicalStandard(standards) {
  const sorted = [...standards].sort((left, right) => {
    const leftTools = Number(left.meta?.enabledToolsCount || 0);
    const rightTools = Number(right.meta?.enabledToolsCount || 0);
    if (rightTools !== leftTools) return rightTools - leftTools;
    const leftPatterns = Number(left.meta?.enabledPatternsCount || 0);
    const rightPatterns = Number(right.meta?.enabledPatternsCount || 0);
    if (rightPatterns !== leftPatterns) return rightPatterns - leftPatterns;
    return Number(right.id) - Number(left.id);
  });
  return sorted[0] || null;
}

async function verifyCanonicalStandard(codingStandard) {
  const orgTools = await listOrganizationTools();
  const standardTools = await listCodingStandardTools(codingStandard.id);
  const orgToolCount = orgTools.length;
  const enabledStandardTools = standardTools.filter((tool) => tool.enabled !== false);

  const deprecatedUuidsForPatternCount = new Set(
    DEPRECATED_DISABLED_TOOLS.map((entry) => entry.uuid),
  );
  let totalOrganizationPatterns = 0;
  for (const tool of orgTools) {
    if (deprecatedUuidsForPatternCount.has(tool.uuid)) continue;
    // Pattern inventory uses tool UUIDs from Codacy; the API returns
    // pagination.total even when limit=1, so one request per tool is enough.
    totalOrganizationPatterns += await getToolPatternTotal(tool.uuid);
  }

  const standardMeta = await getCodingStandard(codingStandard.id);
  const enabledToolsCount = Number(
    standardMeta.meta?.enabledToolsCount ?? codingStandard.meta?.enabledToolsCount ?? 0,
  );
  const enabledPatternsCount = Number(
    standardMeta.meta?.enabledPatternsCount ?? codingStandard.meta?.enabledPatternsCount ?? 0,
  );

  // Deprecated tools are intentionally excluded from MAX-RIGOR. The "all tools
  // enabled" invariant becomes "all non-deprecated tools enabled" so a renamed
  // entry can never silently smuggle a dead analyzer back in.
  const deprecatedUuids = new Set(DEPRECATED_DISABLED_TOOLS.map((entry) => entry.uuid));
  const targetEnabledToolsCount = orgToolCount - DEPRECATED_DISABLED_TOOLS.length;
  const deprecatedActuallyDisabled = DEPRECATED_DISABLED_TOOLS.every((entry) => {
    const tool = standardTools.find((candidate) => candidate.uuid === entry.uuid);
    if (!tool) return true; // not present in the standard, treated as disabled
    return tool.isEnabled === false || tool.enabled === false;
  });
  const enabledNonDeprecatedTools = enabledStandardTools.filter(
    (tool) => !deprecatedUuids.has(tool.uuid),
  );

  return {
    orgToolCount,
    targetEnabledToolsCount,
    totalOrganizationPatterns,
    enabledToolsCount,
    enabledPatternsCount,
    deprecatedActuallyDisabled,
    hasAllToolsEnabled:
      enabledToolsCount === targetEnabledToolsCount &&
      enabledNonDeprecatedTools.length === targetEnabledToolsCount &&
      deprecatedActuallyDisabled,
    hasAllPatternsEnabled: enabledPatternsCount === totalOrganizationPatterns,
  };
}

async function unlinkStragglerStandards(repo, canonicalStandardId) {
  const stragglers = (repo.standards || []).filter(
    (standard) => Number(standard.id) !== canonicalStandardId,
  );
  for (const standard of stragglers) {
    await patchCodingStandardRepositories(standard.id, {
      link: [],
      unlink: [REPOSITORY],
    });
  }
  return stragglers.map((standard) => standard.id);
}

async function ensureGatePolicy() {
  const policies = await listGatePolicies();
  const current = policies.find((policy) => policy.name === MAX_RIGOR_GATE_POLICY_NAME) || null;
  if (!current) {
    const created = await createGatePolicy(TARGET_PULL_REQUEST_GATE);
    return created;
  }
  return updateGatePolicy(current.id, TARGET_PULL_REQUEST_GATE);
}

function summarizeCheck(result, expected, actual) {
  return {
    ok: sameJson(expected, actual),
    expected,
    actual,
  };
}

async function main() {
  console.log(`[codacy-max-rigor] Using token from ${TOKEN.name} (value hidden).`);
  console.log(
    `[codacy-max-rigor] Target repository: ${PROVIDER}/${ORGANIZATION}/${REPOSITORY} (${CHECK_ONLY ? 'check' : 'enforce'})`,
  );

  const repoBefore = await getRepository();
  const canonicalStandard = pickCanonicalStandard(repoBefore.standards || []);
  if (!canonicalStandard) {
    throw new Error('Repository is not linked to any coding standard.');
  }

  const standardVerification = await verifyCanonicalStandard(canonicalStandard);
  const repoQualityBefore = normalizeRepositoryQualitySettings(
    await getRepositoryQualitySettings(),
  );
  const commitGateBefore = normalizeQualityGateSettings(await getCommitQualitySettings(), {
    includeDiffCoverage: false,
  });
  const pullRequestGateBefore = normalizeQualityGateSettings(
    await getPullRequestQualitySettings(),
    {
      includeDiffCoverage: true,
    },
  );
  const providerSettingsBefore = await getProviderIntegrationSettings();
  const providerSettingsTarget = buildProviderSettingsTarget(providerSettingsBefore);
  const buildServerAnalysisBefore = await getBuildServerAnalysisSetting();

  const checks = {
    repositoryQuality: summarizeCheck(
      'repositoryQuality',
      TARGET_REPOSITORY_QUALITY,
      repoQualityBefore,
    ),
    commitGate: summarizeCheck('commitGate', TARGET_COMMIT_GATE, commitGateBefore),
    pullRequestGate: summarizeCheck(
      'pullRequestGate',
      TARGET_PULL_REQUEST_GATE,
      pullRequestGateBefore,
    ),
    providerSettings: summarizeCheck(
      'providerSettings',
      providerSettingsTarget,
      Object.fromEntries(
        Object.keys(providerSettingsTarget).map((key) => [
          key,
          Boolean(providerSettingsBefore[key]),
        ]),
      ),
    ),
    buildServerAnalysis: {
      ok: buildServerAnalysisBefore === true,
      expected: true,
      actual: buildServerAnalysisBefore,
    },
    codingStandardLock: {
      ok:
        (repoBefore.standards || []).length === 1 &&
        Number(repoBefore.codingStandardId) === Number(canonicalStandard.id) &&
        standardVerification.hasAllToolsEnabled &&
        standardVerification.hasAllPatternsEnabled,
      expected: {
        linkedStandards: 1,
        codingStandardId: Number(canonicalStandard.id),
        enabledToolsCount: standardVerification.targetEnabledToolsCount,
        enabledPatternsCount: standardVerification.totalOrganizationPatterns,
        deprecatedToolsDisabled: DEPRECATED_DISABLED_TOOLS.map((entry) => entry.name),
      },
      actual: {
        linkedStandards: (repoBefore.standards || []).map((standard) => standard.id),
        codingStandardId: Number(repoBefore.codingStandardId),
        enabledToolsCount: standardVerification.enabledToolsCount,
        enabledPatternsCount: standardVerification.enabledPatternsCount,
        deprecatedToolsDisabled: standardVerification.deprecatedActuallyDisabled
          ? DEPRECATED_DISABLED_TOOLS.map((entry) => entry.name)
          : [],
      },
    },
  };

  if (CHECK_ONLY) {
    const failures = Object.entries(checks).filter(([, result]) => !result.ok);
    if (failures.length > 0) {
      console.error('[codacy-max-rigor] Drift detected:');
      for (const [name, result] of failures) {
        console.error(`- ${name}`);
        console.error(`  expected: ${JSON.stringify(result.expected)}`);
        console.error(`  actual:   ${JSON.stringify(result.actual)}`);
      }
      process.exit(1);
    }
    console.log('[codacy-max-rigor] OK — live Codacy state matches the canonical max-rigor lock.');
    return;
  }

  if (!checks.codingStandardLock.ok) {
    const unlinked = await unlinkStragglerStandards(repoBefore, Number(canonicalStandard.id));
    if (unlinked.length > 0) {
      console.log(
        `[codacy-max-rigor] Unlinked straggler coding standards from repo: ${unlinked.join(', ')}`,
      );
    }
    const standardToolsForDisable = await listCodingStandardTools(canonicalStandard.id);
    const disabledNow = await ensureDeprecatedToolsDisabled(
      canonicalStandard.id,
      standardToolsForDisable,
    );
    if (disabledNow.length > 0) {
      console.log(
        `[codacy-max-rigor] Disabled deprecated tools in canonical standard: ${disabledNow.join(', ')}`,
      );
    }
  }

  if (!checks.repositoryQuality.ok) {
    await putRepositoryQualitySettings(TARGET_REPOSITORY_QUALITY);
    console.log('[codacy-max-rigor] Repository quality settings hardened.');
  }

  const gatePolicy = await ensureGatePolicy();
  const linkedRepositories = await listGatePolicyRepositories(gatePolicy.id);
  const linkedRepositoryNames = linkedRepositories.map((entry) => entry.name);
  if (!linkedRepositoryNames.includes(REPOSITORY)) {
    await applyGatePolicy(gatePolicy.id, REPOSITORY, linkedRepositoryNames);
    console.log(`[codacy-max-rigor] Gate policy "${MAX_RIGOR_GATE_POLICY_NAME}" linked to repo.`);
  } else {
    console.log(`[codacy-max-rigor] Gate policy "${MAX_RIGOR_GATE_POLICY_NAME}" already linked.`);
  }

  if (!checks.commitGate.ok) {
    await putCommitQualitySettings(TARGET_COMMIT_GATE);
    console.log('[codacy-max-rigor] Commit quality gate hardened.');
  }

  if (!checks.pullRequestGate.ok) {
    await putPullRequestQualitySettings(TARGET_PULL_REQUEST_GATE);
    console.log('[codacy-max-rigor] Pull request quality gate hardened.');
  }

  if (!checks.providerSettings.ok) {
    await patchProviderIntegrationSettings(providerSettingsTarget);
    console.log('[codacy-max-rigor] Provider integration settings hardened.');
  }

  if (!checks.buildServerAnalysis.ok) {
    await updateBuildServerAnalysisSetting(true);
    console.log('[codacy-max-rigor] Build-server analysis enabled.');
  }

  const repoAfter = await getRepository();
  const canonicalAfter = pickCanonicalStandard(repoAfter.standards || []);
  const standardAfter = await verifyCanonicalStandard(canonicalAfter);
  const repoQualityAfter = normalizeRepositoryQualitySettings(await getRepositoryQualitySettings());
  const commitGateAfter = normalizeQualityGateSettings(await getCommitQualitySettings(), {
    includeDiffCoverage: false,
  });
  const pullRequestGateAfter = normalizeQualityGateSettings(await getPullRequestQualitySettings(), {
    includeDiffCoverage: true,
  });
  const providerSettingsAfterRaw = await getProviderIntegrationSettings();
  const providerSettingsAfter = Object.fromEntries(
    Object.keys(providerSettingsTarget).map((key) => [key, Boolean(providerSettingsAfterRaw[key])]),
  );
  const buildServerAnalysisAfter = await getBuildServerAnalysisSetting();

  const finalFailures = [];

  if (!sameJson(repoQualityAfter, TARGET_REPOSITORY_QUALITY)) {
    finalFailures.push(
      `repository quality mismatch expected=${JSON.stringify(TARGET_REPOSITORY_QUALITY)} actual=${JSON.stringify(repoQualityAfter)}`,
    );
  }
  if (!sameJson(commitGateAfter, TARGET_COMMIT_GATE)) {
    finalFailures.push(
      `commit gate mismatch expected=${JSON.stringify(TARGET_COMMIT_GATE)} actual=${JSON.stringify(commitGateAfter)}`,
    );
  }
  if (!sameJson(pullRequestGateAfter, TARGET_PULL_REQUEST_GATE)) {
    finalFailures.push(
      `pull request gate mismatch expected=${JSON.stringify(TARGET_PULL_REQUEST_GATE)} actual=${JSON.stringify(pullRequestGateAfter)}`,
    );
  }
  if (!sameJson(providerSettingsAfter, providerSettingsTarget)) {
    finalFailures.push(
      `provider settings mismatch expected=${JSON.stringify(providerSettingsTarget)} actual=${JSON.stringify(providerSettingsAfter)}`,
    );
  }
  if (buildServerAnalysisAfter !== true) {
    finalFailures.push('buildServerAnalysisSetting is not enabled');
  }
  if ((repoAfter.standards || []).length !== 1) {
    finalFailures.push(
      `repo still linked to multiple coding standards: ${(repoAfter.standards || []).map((s) => s.id).join(', ')}`,
    );
  }
  if (!standardAfter.hasAllToolsEnabled || !standardAfter.hasAllPatternsEnabled) {
    finalFailures.push(
      `canonical coding standard ${canonicalAfter.id} is not fully enabled (tools ${standardAfter.enabledToolsCount}/${standardAfter.orgToolCount}, patterns ${standardAfter.enabledPatternsCount}/${standardAfter.totalOrganizationPatterns})`,
    );
  }

  if (finalFailures.length > 0) {
    console.error('[codacy-max-rigor] Final verification failed:');
    for (const failure of finalFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(
    '[codacy-max-rigor] OK — Codacy live state hardened to the canonical max-rigor lock.',
  );
}

main().catch((error) => {
  console.error(`[codacy-max-rigor] ${error?.message || String(error)}`);
  process.exit(1);
});
