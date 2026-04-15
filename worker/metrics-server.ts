import http from 'node:http';
import { getHealth, getMetrics } from './metrics';

const port = Number(process.env.PORT || process.env.WORKER_METRICS_PORT || 3003);
const metricsToken = process.env.WORKER_METRICS_TOKEN;
const internalApiKey = process.env.INTERNAL_API_KEY;

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isAuthorized(req: http.IncomingMessage): boolean {
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
  const headerToken =
    bearer ||
    (typeof req.headers['x-metrics-token'] === 'string'
      ? req.headers['x-metrics-token']
      : undefined) ||
    (typeof req.headers['x-internal-key'] === 'string' ? req.headers['x-internal-key'] : undefined);

  if (internalApiKey && headerToken === internalApiKey) {
    return true;
  }

  if (metricsToken && headerToken === metricsToken) {
    return true;
  }

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
