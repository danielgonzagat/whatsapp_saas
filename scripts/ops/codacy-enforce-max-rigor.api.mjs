/**
 * Codacy API client + thin wrappers used by the MAX-RIGOR enforcement script.
 * Extracted to keep the orchestrator file under the architecture line budget.
 *
 * All functions in this module are pure I/O wrappers — no policy decisions
 * live here; those stay in codacy-enforce-max-rigor.mjs.
 */

const CODACY_API_ORIGIN = 'https://api.codacy.com';
const CODACY_API_PATH_PREFIX = '/api/v3';

function jsonHeaders(token) {
  return {
    'api-token': token.value,
    'content-type': 'application/json',
  };
}

export async function codacyRequest(token, method, pathname, body) {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(`${CODACY_API_PATH_PREFIX}${normalizedPathname}`, CODACY_API_ORIGIN);
  if (url.origin !== CODACY_API_ORIGIN || !url.pathname.startsWith(CODACY_API_PATH_PREFIX)) {
    throw new Error(`Refusing Codacy API request outside allow-listed API origin: ${url.href}`);
  }
  const response = await fetch(url.href, {
    method,
    headers: jsonHeaders(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assertOkResponse(response, method, pathname, text);
  return parseJsonBody(text, method, pathname);
}

function assertOkResponse(response, method, pathname, text) {
  if (!response.ok) {
    console.error(
      `[codacy-max-rigor] ${method} ${pathname} -> ${response.status} ${text || response.statusText}`,
    );
    throw new Error(`Codacy API ${method} ${pathname} failed (${response.status}).`);
  }
}

function parseJsonBody(text, method, pathname) {
  if (!text || text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(`[codacy-max-rigor] Invalid JSON from ${method} ${pathname}: ${error.message}`);
    throw error;
  }
}

export async function expectJson(token, method, pathname, body) {
  const payload = await codacyRequest(token, method, pathname, body);
  if (payload == null) {
    throw new Error(`Codacy API ${method} ${pathname} returned empty body.`);
  }
  return payload;
}

export function buildCodacyApi({ token, provider, organization, repository, gatePolicyName }) {
  const orgScope = `/organizations/${provider}/${organization}`;
  const repoScope = `${orgScope}/repositories/${repository}`;

  return {
    async getRepository() {
      const payload = await expectJson(token, 'GET', repoScope);
      return payload.data;
    },

    async listOrganizationTools() {
      const payload = await expectJson(token, 'GET', '/tools');
      return payload.data || [];
    },

    async listCodingStandardTools(codingStandardId) {
      const payload = await expectJson(
        token,
        'GET',
        `${orgScope}/coding-standards/${codingStandardId}/tools`,
      );
      return payload.data || [];
    },

    async getCodingStandard(codingStandardId) {
      const payload = await expectJson(
        token,
        'GET',
        `${orgScope}/coding-standards/${codingStandardId}`,
      );
      return payload.data;
    },

    async getToolPatternTotal(toolUuid) {
      const payload = await expectJson(token, 'GET', `/tools/${toolUuid}/patterns?limit=1`);
      return Number(payload.pagination?.total || 0);
    },

    async getRepositoryQualitySettings() {
      const payload = await expectJson(token, 'GET', `${repoScope}/settings/quality/repository`);
      return payload.data;
    },

    async putRepositoryQualitySettings(settings) {
      await codacyRequest(token, 'PUT', `${repoScope}/settings/quality/repository`, settings);
    },

    async getCommitQualitySettings() {
      const payload = await expectJson(token, 'GET', `${repoScope}/settings/quality/commits`);
      return payload.data?.qualityGate || {};
    },

    async putCommitQualitySettings(settings) {
      await codacyRequest(token, 'PUT', `${repoScope}/settings/quality/commits`, settings);
    },

    async getPullRequestQualitySettings() {
      const payload = await expectJson(token, 'GET', `${repoScope}/settings/quality/pull-requests`);
      return payload.data?.qualityGate || {};
    },

    async putPullRequestQualitySettings(settings) {
      await codacyRequest(token, 'PUT', `${repoScope}/settings/quality/pull-requests`, settings);
    },

    async getBuildServerAnalysisSetting() {
      const payload = await expectJson(token, 'GET', `${repoScope}/settings/analysis`);
      return Boolean(payload.buildServerAnalysisSetting);
    },

    async updateBuildServerAnalysisSetting(enabled) {
      return expectJson(token, 'PATCH', `${repoScope}/settings/analysis`, {
        buildServerAnalysisSetting: enabled,
      });
    },

    async getProviderIntegrationSettings() {
      const payload = await expectJson(token, 'GET', `${repoScope}/integrations/providerSettings`);
      return payload.settings || {};
    },

    async patchProviderIntegrationSettings(settings) {
      return expectJson(token, 'PATCH', `${repoScope}/integrations/providerSettings`, settings);
    },

    async listGatePolicies() {
      const payload = await expectJson(token, 'GET', `${orgScope}/gate-policies?limit=100`);
      return payload.data || [];
    },

    async createGatePolicy(settings) {
      const payload = await expectJson(token, 'POST', `${orgScope}/gate-policies`, {
        gatePolicyName,
        isDefault: false,
        settings,
      });
      return payload.data;
    },

    async updateGatePolicy(gatePolicyId, settings) {
      const payload = await expectJson(
        token,
        'PATCH',
        `${orgScope}/gate-policies/${gatePolicyId}`,
        {
          gatePolicyName,
          isDefault: false,
          settings,
        },
      );
      return payload.data;
    },

    async applyGatePolicy(gatePolicyId, repoName, linkedRepoNames) {
      const unlink = linkedRepoNames.filter((name) => name !== repoName);
      return codacyRequest(token, 'PUT', `${orgScope}/gate-policies/${gatePolicyId}/repositories`, {
        link: [repoName],
        unlink,
      });
    },

    async listGatePolicyRepositories(gatePolicyId) {
      const payload = await expectJson(
        token,
        'GET',
        `${orgScope}/gate-policies/${gatePolicyId}/repositories?limit=100`,
      );
      return payload.data || [];
    },

    async patchCodingStandardRepositories(codingStandardId, body) {
      return expectJson(
        token,
        'PATCH',
        `${orgScope}/coding-standards/${codingStandardId}/repositories`,
        body,
      );
    },

    async patchCodingStandardTool(codingStandardId, toolUuid, body) {
      return expectJson(
        token,
        'PATCH',
        `${orgScope}/coding-standards/${codingStandardId}/tools/${toolUuid}`,
        body,
      );
    },
  };
}
