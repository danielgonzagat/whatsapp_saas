import http from 'node:http';
import { getHealth, getMetrics } from './metrics';

const port = Number(process.env.PORT || process.env.WORKER_METRICS_PORT || 3003);
const metricsToken = process.env.WORKER_METRICS_TOKEN;
const internalApiKey = process.env.INTERNAL_API_KEY;

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function extractBearerToken(auth: string | string[] | undefined): string | undefined {
  if (typeof auth !== 'string') return undefined;
  return auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
}

function readStringHeader(req: http.IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name];
  return typeof raw === 'string' ? raw : undefined;
}

function resolveRequestToken(req: http.IncomingMessage): string | undefined {
  return (
    extractBearerToken(req.headers.authorization) ||
    readStringHeader(req, 'x-metrics-token') ||
    readStringHeader(req, 'x-internal-key')
  );
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const headerToken = resolveRequestToken(req);

  if (internalApiKey && headerToken === internalApiKey) return true;
  if (metricsToken && headerToken === metricsToken) return true;

  return !internalApiKey && !metricsToken;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }

  const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);

  if (requestUrl.pathname.startsWith('/health')) {
    const data = await getHealth();
    sendJson(res, 200, { ...data, uptimeMs: process.uptime() * 1000 });
    return;
  }

  if (requestUrl.pathname.startsWith('/metrics')) {
    if (!isAuthorized(req)) {
      sendJson(res, 401, { error: 'unauthorized' });
      return;
    }

    try {
      const data = await getMetrics();
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(data);
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      sendJson(res, 500, { error: errorInstanceofError?.message || 'metrics_failed' });
    }
    return;
  }

  sendJson(res, 404, { error: 'not_found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[metrics-server] listening on port ${port}`);
});

export { server as metricsHttpServer };
