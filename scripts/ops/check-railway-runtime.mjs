#!/usr/bin/env node

/**
 * Railway runtime anti-regression gate.
 *
 * This gate talks directly to Railway's public GraphQL API and to the deployed
 * KLOEL health endpoints. It is intentionally separate from `railway up` so a
 * no-op deployment reported as SKIPPED can still be evaluated against the real
 * currently-running service and runtime logs.
 */
import {
  deriveSystemHealthUrl,
  fetchJsonOrText,
  messageFor,
  normalizeName,
  printSummary,
  railwayRequest,
  readPositiveInteger,
  stripAnsi,
  truncate,
} from './check-railway-runtime.helpers.mjs';

const RAILWAY_GRAPHQL_ENDPOINTS = [
  'https://backboard.railway.com/graphql/v2',
  'https://backboard.railway.app/graphql/v2',
];

const TERMINAL_GOOD_STATUSES = new Set(['SUCCESS']);
const SKIPPED_REASON_NO_CHANGES = 'No changes to watched files';
const FAILURE_DEPLOYMENT_STATUSES = new Set([
  'CRASHED',
  'FAILED',
  'REMOVED',
  'WAITING',
  'QUEUED',
  'BUILDING',
  'DEPLOYING',
]);

const LOG_FAILURE_PATTERNS = [
  /ECONNREFUSED\s+127\.0\.0\.1:6379/i,
  /Cannot find module/i,
  /Nest can't resolve dependencies/i,
  /PrismaClientInitializationError/i,
  /Unhandled(?:PromiseRejection| exception| error)/i,
  /\bFATAL\b/i,
  /\bPANIC\b/i,
];

const required = process.env.RAILWAY_RUNTIME_REQUIRED === 'true';
const failOnWarnings = process.env.RAILWAY_RUNTIME_FAIL_ON_WARNINGS === 'true';
const maxLogAgeMinutes = readPositiveInteger('RAILWAY_RUNTIME_MAX_LOG_AGE_MINUTES', 30);
const deploymentLookback = readPositiveInteger('RAILWAY_RUNTIME_DEPLOYMENT_LOOKBACK', 8);
const logLimit = readPositiveInteger('RAILWAY_RUNTIME_LOG_LIMIT', 80);
const projectToken =
  process.env.RAILWAY_PROJECT_TOKEN ||
  process.env.RAILWAY_TOKEN ||
  process.env.RAILWAY_API_TOKEN ||
  '';
const projectId = process.env.RAILWAY_PROJECT_ID || '';
const environmentId = process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_ENV_ID || '';

const serviceInputs = [
  {
    key: 'backend',
    id: process.env.RAILWAY_BACKEND_SERVICE_ID || '',
    name:
      process.env.RAILWAY_BACKEND_SERVICE_NAME || process.env.RAILWAY_BACKEND_SERVICE || 'Backend',
  },
  {
    key: 'worker',
    id: process.env.RAILWAY_WORKER_SERVICE_ID || '',
    name: process.env.RAILWAY_WORKER_SERVICE_NAME || process.env.RAILWAY_WORKER_SERVICE || 'Worker',
  },
];

main().catch((error) => {
  console.error(`[railway-runtime] FAIL ${messageFor(error)}`);
  process.exit(1);
});

async function main() {
  const missing = requiredEnvFailures();
  if (missing.length > 0) {
    const message = `missing env: ${missing.join(', ')}`;
    if (required) {
      throw new Error(message);
    }
    console.log(`[railway-runtime] SKIP ${message}`);
    return;
  }

  const client = await createRailwayClient();
  const services = await resolveServices(client);
  const deploymentResults = [];

  for (const service of services) {
    const deployments = await listDeployments(client, service.id);
    deploymentResults.push(await assertServiceDeployment(client, service, deployments));
  }

  const healthResult = await assertHealthEndpoints();
  printSummary(deploymentResults, healthResult);
}

function requiredEnvFailures() {
  const missing = [];
  if (!projectToken) {
    missing.push('RAILWAY_PROJECT_TOKEN or RAILWAY_TOKEN');
  }
  if (!projectId) {
    missing.push('RAILWAY_PROJECT_ID');
  }
  if (!environmentId) {
    missing.push('RAILWAY_ENVIRONMENT_ID');
  }
  return missing;
}

async function createRailwayClient() {
  const authCandidates = [
    { name: 'account-token', headers: { Authorization: `Bearer ${projectToken}` } },
    { name: 'project-token', headers: { 'Project-Access-Token': projectToken } },
  ];

  let lastError = null;
  for (const endpoint of RAILWAY_GRAPHQL_ENDPOINTS) {
    for (const auth of authCandidates) {
      try {
        const data = await railwayRequest(
          endpoint,
          `query($projectId: String!) {
            project(id: $projectId) {
              id
            }
          }`,
          { projectId },
          auth.headers,
        );
        const remoteProjectId = data?.project?.id;
        if (remoteProjectId !== projectId) {
          throw new Error(
            `Railway ${auth.name} resolved project ${remoteProjectId || '<none>'}, expected RAILWAY_PROJECT_ID=${projectId}`,
          );
        }
        return { endpoint, authHeaders: auth.headers, authMode: auth.name };
      } catch (error) {
        lastError = error;
      }
    }
  }
  throw lastError || new Error('Railway API connection failed');
}

async function resolveServices(client) {
  const missingIds = serviceInputs.filter((service) => !service.id);
  if (missingIds.length === 0) {
    return serviceInputs.map((service) => ({ ...service }));
  }

  const data = await gql(
    client,
    `query($projectId: String!) {
      project(id: $projectId) {
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }`,
    { projectId },
  );
  const remoteServices = data?.project?.services?.edges?.map((edge) => edge.node) || [];

  return serviceInputs.map((service) => {
    if (service.id) {
      return { ...service };
    }
    const normalizedExpected = normalizeName(service.name);
    const match = remoteServices.find(
      (candidate) =>
        candidate?.id === service.name || normalizeName(candidate?.name) === normalizedExpected,
    );
    if (!match?.id) {
      throw new Error(
        `could not resolve Railway ${service.key} service from name "${service.name}"`,
      );
    }
    return { ...service, id: match.id, name: match.name || service.name };
  });
}

async function listDeployments(client, serviceId) {
  const data = await gql(
    client,
    `query($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges {
          node {
            id
            status
            createdAt
            statusUpdatedAt
            serviceId
            service { id name }
            meta
          }
        }
      }
    }`,
    {
      input: {
        projectId,
        environmentId,
        serviceId,
        includeDeleted: false,
      },
      first: deploymentLookback,
    },
  );
  return data?.deployments?.edges?.map((edge) => edge.node).filter(Boolean) || [];
}

async function assertServiceDeployment(client, service, deployments) {
  if (deployments.length === 0) {
    throw new Error(`no deployments found for Railway service ${service.name}`);
  }

  const latest = deployments[0];
  if (FAILURE_DEPLOYMENT_STATUSES.has(latest.status)) {
    throw new Error(`${service.name} latest deployment ${latest.id} is ${latest.status}`);
  }

  let active = latest;
  let skippedNoChanges = false;

  if (latest.status === 'SKIPPED') {
    skippedNoChanges = latest.meta?.skippedReason === SKIPPED_REASON_NO_CHANGES;
    active = deployments.find((deployment) => TERMINAL_GOOD_STATUSES.has(deployment.status));
    if (!skippedNoChanges || !active) {
      throw new Error(
        `${service.name} latest deployment skipped without a prior healthy SUCCESS deployment`,
      );
    }
  } else if (!TERMINAL_GOOD_STATUSES.has(latest.status)) {
    throw new Error(
      `${service.name} latest deployment ${latest.id} has unsupported status ${latest.status}`,
    );
  }

  await assertDeploymentLogs(client, service, active);

  return {
    service: service.name,
    latestStatus: latest.status,
    latestDeploymentId: latest.id,
    activeDeploymentId: active.id,
    skippedNoChanges,
    activeCreatedAt: active.createdAt,
  };
}

async function assertDeploymentLogs(client, service, deployment) {
  const data = await gql(
    client,
    `query($deploymentId: String!, $limit: Int) {
      deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
        timestamp
        message
        severity
      }
    }`,
    { deploymentId: deployment.id, limit: logLimit },
  );

  const logs = data?.deploymentLogs || [];
  if (logs.length === 0) {
    throw new Error(`${service.name} deployment ${deployment.id} returned no runtime logs`);
  }

  const now = Date.now();
  const recentLogs = logs.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp || '');
    return Number.isFinite(timestamp) && now - timestamp <= maxLogAgeMinutes * 60_000;
  });

  if (recentLogs.length === 0) {
    throw new Error(
      `${service.name} deployment ${deployment.id} has no logs in the last ${maxLogAgeMinutes} minutes`,
    );
  }

  for (const entry of recentLogs) {
    const message = stripAnsi(String(entry.message || ''));
    const severity = String(entry.severity || '').toLowerCase();
    if (severity === 'error' || severity === 'fatal') {
      throw new Error(`${service.name} runtime log severity=${severity}: ${truncate(message)}`);
    }
    if (failOnWarnings && severity === 'warn') {
      throw new Error(`${service.name} runtime warning: ${truncate(message)}`);
    }
    for (const pattern of LOG_FAILURE_PATTERNS) {
      if (pattern.test(message)) {
        throw new Error(`${service.name} runtime failure pattern ${pattern}: ${truncate(message)}`);
      }
    }
  }
}

async function assertHealthEndpoints() {
  const backendHealthUrl =
    process.env.RAILWAY_BACKEND_HEALTH_URL || process.env.PRODUCTION_BACKEND_HEALTHCHECK_URL || '';
  const frontendHealthUrl =
    process.env.RAILWAY_FRONTEND_HEALTH_URL ||
    process.env.PRODUCTION_FRONTEND_HEALTHCHECK_URL ||
    '';
  const systemHealthUrl =
    process.env.RAILWAY_SYSTEM_HEALTH_URL || deriveSystemHealthUrl(backendHealthUrl);

  if (!backendHealthUrl && !systemHealthUrl) {
    throw new Error('missing RAILWAY_BACKEND_HEALTH_URL or RAILWAY_SYSTEM_HEALTH_URL');
  }

  const result = {};
  if (backendHealthUrl) {
    result.backend = await fetchJsonOrText(backendHealthUrl);
  }
  if (frontendHealthUrl) {
    result.frontend = await fetchJsonOrText(frontendHealthUrl);
  }
  if (systemHealthUrl) {
    const system = await fetchJsonOrText(systemHealthUrl);
    assertSystemHealth(systemHealthUrl, system);
    result.system = system;
  }
  return result;
}

function assertSystemHealth(url, system) {
  const status = system?.status || system?.details?.status;
  if (status !== 'UP' && status !== 'ok') {
    throw new Error(`${url} returned non-UP status ${String(status)}`);
  }

  const details = system?.details || system?.components || {};
  const requiredComponents = ['database', 'redis', 'worker', 'queues'];
  for (const componentName of requiredComponents) {
    const component = details[componentName];
    if (!component) {
      throw new Error(`${url} missing component ${componentName}`);
    }
    if (component.status !== 'UP' && component.status !== 'ok') {
      throw new Error(`${url} component ${componentName} is ${component.status}`);
    }
  }

  const queues = details.queues || {};
  if ((queues.failed || 0) > 0 || (queues.dlqWaiting || 0) > 0 || (queues.dlqFailed || 0) > 0) {
    throw new Error(`${url} queues are not clean: ${JSON.stringify(queues)}`);
  }
}

async function gql(client, query, variables = {}) {
  return railwayRequest(client.endpoint, query, variables, client.authHeaders);
}
