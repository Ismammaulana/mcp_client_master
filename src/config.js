import "dotenv/config";
import { z } from "zod";

const integerFromEnv = (minimum, maximum) =>
  z.coerce.number().int().min(minimum).max(maximum);

const environmentSchema = z.object({
  MCP_SERVER_URL: z.url().default("http://localhost:9200/mcp"),
  MCP_HOST_HEADER: z.string().optional().default(""),
  GATEWAY_HOST: z.string().min(1).default("0.0.0.0"),
  GATEWAY_PORT: integerFromEnv(1, 65535).default(9100),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MCP_CONNECT_TIMEOUT_SECONDS: integerFromEnv(1, 300).default(5),
  MCP_REQUEST_TIMEOUT_SECONDS: integerFromEnv(1, 3600).default(30),
  API_KEY: z.string().optional().default(""),
  ALLOWED_TOOLS: z.string().default("simulate_router_path"),
  REQUEST_BODY_LIMIT_BYTES: integerFromEnv(1024, 10 * 1024 * 1024).default(
    1024 * 1024,
  ),
  RATE_LIMIT_MAX: integerFromEnv(1, 100000).default(100),
  RATE_LIMIT_WINDOW: z.string().min(1).default("1 minute"),
  MCP_MAX_CONCURRENCY: integerFromEnv(1, 1000).default(20),
});

export function loadConfig(environment = process.env) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid configuration: ${details}`);
  }

  const env = parsed.data;
  const allowedTools = new Set(
    env.ALLOWED_TOOLS.split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );

  if (allowedTools.size === 0) {
    throw new Error("Invalid configuration: ALLOWED_TOOLS cannot be empty");
  }

  return Object.freeze({
    mcpServerUrl: env.MCP_SERVER_URL,
    mcpHostHeader: env.MCP_HOST_HEADER || null,
    gatewayHost: env.GATEWAY_HOST,
    gatewayPort: env.GATEWAY_PORT,
    logLevel: env.LOG_LEVEL,
    mcpConnectTimeoutMs: env.MCP_CONNECT_TIMEOUT_SECONDS * 1000,
    mcpRequestTimeoutMs: env.MCP_REQUEST_TIMEOUT_SECONDS * 1000,
    apiKey: env.API_KEY || null,
    allowedTools,
    bodyLimit: env.REQUEST_BODY_LIMIT_BYTES,
    rateLimitMax: env.RATE_LIMIT_MAX,
    rateLimitWindow: env.RATE_LIMIT_WINDOW,
    mcpMaxConcurrency: env.MCP_MAX_CONCURRENCY,
  });
}
