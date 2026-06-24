import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "mcp_gateway_" });

  const requests = new Counter({
    name: "mcp_gateway_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
  });
  const duration = new Histogram({
    name: "mcp_gateway_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  });
  const active = new Gauge({
    name: "mcp_gateway_http_active_requests",
    help: "Active HTTP requests",
    registers: [registry],
  });

  return { registry, requests, duration, active };
}

export async function metricsPlugin(app, options) {
  const { metrics, authenticate } = options;

  app.addHook("onRequest", async (request) => {
    request.metricsStart = process.hrtime.bigint();
    metrics.active.inc();
  });

  app.addHook("onResponse", async (request, reply) => {
    metrics.active.dec();
    const route = request.routeOptions?.url ?? "unknown";
    const labels = {
      method: request.method,
      route,
      status_code: String(reply.statusCode),
    };
    metrics.requests.inc(labels);
    if (request.metricsStart) {
      const elapsed = Number(process.hrtime.bigint() - request.metricsStart) / 1e9;
      metrics.duration.observe(labels, elapsed);
    }
  });

  app.get("/metrics", { preHandler: authenticate }, async (_request, reply) => {
    reply.header("content-type", metrics.registry.contentType);
    return metrics.registry.metrics();
  });
}
