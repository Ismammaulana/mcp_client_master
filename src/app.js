import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { createAuthenticate } from "./api/auth.js";
import { gatewayErrorHandler } from "./api/error-handler.js";
import { healthRoutes } from "./api/health-routes.js";
import { toolRoutes } from "./api/tool-routes.js";
import { GatewayError } from "./domain/errors.js";
import { McpClientAdapter } from "./infrastructure/mcp-client.js";
import { createMetrics, metricsPlugin } from "./infrastructure/metrics.js";
import { ToolService } from "./services/tool-service.js";

export async function createApp(config, dependencies = {}) {
  const loggerOptions = {
    level: config.logLevel,
    redact: [
      "req.headers.authorization",
      "req.headers.x-api-key",
      "request.headers.authorization",
      "request.headers.x-api-key",
    ],
    ...(dependencies.logStream ? { stream: dependencies.logStream } : {}),
  };
  const app = Fastify({
    logger: dependencies.logger === false ? false : loggerOptions,
    bodyLimit: config.bodyLimit,
    forceCloseConnections: "idle",
    genReqId(request) {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && incoming.length <= 128
        ? incoming
        : randomUUID();
    },
  });
  app.addHook("onRequest", async (request) => {
    request.gatewayStartedAt = process.hrtime.bigint();
    request.log?.debug(
      {
        requestId: request.id,
        method: request.method,
        url: request.url,
      },
      "HTTP request received",
    );
  });
  app.addHook("onResponse", async (request, reply) => {
    const startedAt = request.gatewayStartedAt;
    const durationMs = startedAt
      ? Number(process.hrtime.bigint() - startedAt) / 1e6
      : null;
    request.log?.info(
      {
        requestId: request.id,
        method: request.method,
        route: request.routeOptions?.url ?? request.url,
        statusCode: reply.statusCode,
        durationMs,
      },
      "HTTP request completed",
    );
  });

  const mcpClient =
    dependencies.mcpClient ?? new McpClientAdapter(config, { logger: app.log });
  const toolService =
    dependencies.toolService ??
    new ToolService(mcpClient, config.allowedTools, { logger: app.log });
  const authenticate = createAuthenticate(config);
  const metrics = dependencies.metrics ?? createMetrics();

  app.setErrorHandler(gatewayErrorHandler);
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("x-request-id", request.id);
    return payload;
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    errorResponseBuilder() {
      return new GatewayError(
        "RATE_LIMIT_EXCEEDED",
        "Rate limit exceeded",
        429,
      );
    },
  });
  await metricsPlugin(app, { metrics, authenticate });
  await app.register(healthRoutes, { config, mcpClient, authenticate });
  await app.register(toolRoutes, {
    config,
    toolService,
    authenticate,
  });

  return app;
}
