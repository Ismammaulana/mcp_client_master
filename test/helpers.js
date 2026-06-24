import { vi } from "vitest";
import { loadConfig } from "../src/config.js";

export function testConfig(overrides = {}) {
  return loadConfig({
    MCP_SERVER_URL: "http://mcp.test:9200/mcp",
    MCP_HOST_HEADER: "mcp.internal",
    GATEWAY_HOST: "127.0.0.1",
    GATEWAY_PORT: "9100",
    LOG_LEVEL: "silent",
    MCP_CONNECT_TIMEOUT_SECONDS: "1",
    MCP_REQUEST_TIMEOUT_SECONDS: "2",
    API_KEY: "test-api-key",
    ALLOWED_TOOLS: "simulate_router_path,echo",
    REQUEST_BODY_LIMIT_BYTES: "65536",
    RATE_LIMIT_MAX: "1000",
    RATE_LIMIT_WINDOW: "1 minute",
    MCP_MAX_CONCURRENCY: "2",
    ...overrides,
  });
}

export function fakeMcpClient(overrides = {}) {
  return {
    probe: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "simulate_router_path",
          description: "Simulate a path",
          inputSchema: { type: "object" },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      isError: false,
      content: [{ type: "text", text: "ok" }],
      structuredContent: { path: ["router-a", "router-b"] },
    }),
    ...overrides,
  };
}

export const authHeaders = { "x-api-key": "test-api-key" };
