import http from "http";
import { getHealth, getMetrics } from "./metrics";

const port = Number(process.env.WORKER_METRICS_PORT || 3003);
const metricsToken = process.env.WORKER_METRICS_TOKEN;

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404);
    res.end();
    return;
  }

  // Optional token protection
  if (metricsToken && (req.url.startsWith("/metrics") || req.url.startsWith("/health"))) {
    const auth = req.headers["authorization"];
    const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;
    const headerToken = bearer || (typeof req.headers["x-metrics-token"] === "string" ? req.headers["x-metrics-token"] : undefined);
    if (headerToken !== metricsToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  if (req.url.startsWith("/metrics")) {
    try {
      const data = await getMetrics();
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(data);
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err?.message }));
    }
    return;
  }

  if (req.url.startsWith("/health")) {
    const data = await getHealth();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...data, uptimeMs: process.uptime() * 1000 }));
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(port, () => {
  console.log(`📊 Worker metrics server listening on ${port}`);
});
