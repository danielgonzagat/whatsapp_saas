// sentry-bridge-mcp — handler implementations (extracted for line budget).

import { request } from 'node:https';

const TOKEN = process.env.SENTRY_PERSONAL_TOKEN || process.env.SENTRY_AUTH_TOKEN;
const ORG = process.env.SENTRY_ORG || 'kloel-inteligencia-comercial-a';
const REGION = 'us';

function sentryRequest(path, options = {}) {
  return new Promise((resolve) => {
    if (!TOKEN) {
      resolve({ status: 401, body: { error: 'SENTRY_PERSONAL_TOKEN missing in env' } });
      return;
    }
    const url = new URL(`https://${REGION}.sentry.io/api/0${path}`);
    const req = request({
      method: options.method || 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'sentry-bridge-mcp/0.1.0',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

export async function topIssues({ project, window_hours, limit }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=${limit || 10}&statsPeriod=${window_hours || 24}h&sort=freq`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  const issues = (r.body || []).map((i) => ({
    id: i.shortId, title: i.title, culprit: i.culprit,
    count: Number(i.count), userCount: i.userCount, level: i.level,
    firstSeen: i.firstSeen, lastSeen: i.lastSeen, permalink: i.permalink,
    issue_url: `https://${ORG}.sentry.io/issues/${i.id}/`,
  }));
  return { code: 200, count: issues.length, issues };
}

export async function recentIssues({ project, since_minutes }) {
  const m = Number(since_minutes || 60);
  const sinceMs = Date.now() - m * 60 * 1000;
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=50&statsPeriod=${Math.max(1, Math.ceil(m / 60))}h&sort=new`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  const recent = (r.body || []).filter((i) => new Date(i.firstSeen).getTime() >= sinceMs);
  return {
    code: 200, since_minutes: m, new_issues_count: recent.length,
    issues: recent.map((i) => ({
      id: i.shortId, title: i.title, count: Number(i.count),
      level: i.level, firstSeen: i.firstSeen, permalink: i.permalink,
    })),
  };
}

export async function issueDetail({ issue_id }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/`);
  if (r.status !== 200) return { code: r.status, body: r.body };
  const i = r.body;
  const ev = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/events/latest/`);
  const event = ev.status === 200 ? ev.body : null;
  return {
    code: 200,
    issue: {
      id: i.shortId, title: i.title, culprit: i.culprit, count: i.count,
      userCount: i.userCount, level: i.level, status: i.status,
      assignedTo: i.assignedTo, tags: i.tags?.slice(0, 10),
      firstSeen: i.firstSeen, lastSeen: i.lastSeen, permalink: i.permalink,
    },
    latest_event: event ? {
      eventID: event.eventID, message: event.message, platform: event.platform,
      dateCreated: event.dateCreated, contexts: event.contexts,
      tags: event.tags?.slice(0, 10),
      exception: event.entries?.find((e) => e.type === 'exception')?.data?.values?.[0],
      breadcrumbs: event.entries?.find((e) => e.type === 'breadcrumbs')?.data?.values?.slice(-5),
    } : null,
  };
}

export async function issueEvents({ issue_id, limit }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/events/?limit=${limit || 5}`);
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200, count: r.body?.length || 0,
    events: (r.body || []).slice(0, limit || 5).map((e) => ({
      eventID: e.eventID, message: e.message,
      dateCreated: e.dateCreated, tags: e.tags?.slice(0, 8),
    })),
  };
}

export async function releases({ project, limit }) {
  const r = await sentryRequest(`/organizations/${ORG}/releases/?project=${project || 'node'}&per_page=${limit || 10}`);
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200, count: r.body?.length || 0,
    releases: (r.body || []).map((rel) => ({
      version: rel.version, shortVersion: rel.shortVersion,
      dateReleased: rel.dateReleased || rel.dateCreated,
      newGroups: rel.newGroups,
      crashFreeSessions: rel.crashFreeSessions, crashFreeUsers: rel.crashFreeUsers,
    })),
  };
}

export async function errorsSinceCommit({ project, since_iso }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=100&statsPeriod=14d&query=${encodeURIComponent(`firstSeen:>${since_iso}`)}`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200, since: since_iso, new_issues_count: r.body?.length || 0,
    issues: (r.body || []).map((i) => ({
      id: i.shortId, title: i.title, count: Number(i.count),
      level: i.level, firstSeen: i.firstSeen, permalink: i.permalink,
    })),
  };
}

export async function eventSearch({ project, query, statsPeriod }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=20&statsPeriod=${statsPeriod || '24h'}&query=${encodeURIComponent(query)}`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200, query, count: r.body?.length || 0,
    issues: (r.body || []).map((i) => ({ id: i.shortId, title: i.title, count: Number(i.count), level: i.level })),
  };
}

export async function resolveIssue({ issue_id, note }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/`, {
    method: 'PUT',
    body: { status: 'resolved', ...(note ? { statusDetails: { inNextRelease: false } } : {}) },
  });
  return { code: r.status, body: r.body, action: 'resolved', issue_id };
}

export async function assignIssue({ issue_id, username }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/`, {
    method: 'PUT',
    body: { assignedTo: username },
  });
  return { code: r.status, body: r.body, action: 'assigned', issue_id, to: username };
}

export async function projectStats({ project, hours }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/stats/?stat=received&since=${Math.floor(Date.now() / 1000) - (hours || 24) * 3600}&resolution=1h`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  const series = Array.isArray(r.body) ? r.body : [];
  const total = series.reduce((s, [, v]) => s + v, 0);
  const avgPerHour = series.length ? total / series.length : 0;
  return {
    code: 200, project, hours, total_events: total,
    avg_per_hour: Math.round(avgPerHour),
    series: series.slice(-24),
  };
}
