export async function railwayRequest(endpoint, query, variables = {}, projectToken = '') {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Project-Access-Token': projectToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Railway API HTTP ${response.status}`);
  }
  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }
  return payload?.data;
}

export async function fetchJsonOrText(url, truncate) {
  const response = await fetch(url, { headers: { accept: 'application/json,text/plain,*/*' } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}: ${truncate(text)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { status: 'ok', body: text.slice(0, 200) };
  }
}

export function deriveSystemHealthUrl(backendHealthUrl) {
  if (!backendHealthUrl) {
    return '';
  }
  try {
    const url = new URL(backendHealthUrl);
    url.pathname = '/health/system';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
}

export function printSummary(deployments, health) {
  console.log('[railway-runtime] PASS');
  for (const deployment of deployments) {
    const skipped = deployment.skippedNoChanges ? ' latest=SKIPPED(no changes)' : '';
    console.log(
      `[railway-runtime] ${deployment.service}: active=${deployment.activeDeploymentId} latest=${deployment.latestDeploymentId} status=${deployment.latestStatus}${skipped}`,
    );
  }
  const systemStatus = health?.system?.status || health?.system?.details?.status || 'not_checked';
  console.log(`[railway-runtime] system health: ${systemStatus}`);
}

export function readPositiveInteger(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

export function truncate(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .slice(0, 500);
}

export function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}
