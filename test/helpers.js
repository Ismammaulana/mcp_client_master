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
    ALLOWED_TOOLS:
      "simulate_router_path,echo,activation.get_workspace_context,activation.create_draft,device.search,activation.add_device_to_topology,topology.add_device,activation.validate_draft",
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
    discoverServer: vi.fn().mockResolvedValue({
      health: { ok: true, status: 200, body: '{"status":"ok"}' },
      transport: {
        mode: "primary",
        primaryUrl: "http://mcp.test:9200/mcp",
        activePostUrl: "http://mcp.test:9200/mcp",
        activeStreamUrl: "http://mcp.test:9200/mcp",
      },
      server: {
        info: { name: "fake-mcp", version: "1.0.0" },
        instructions: "Use only available capabilities.",
        capabilities: { tools: {}, prompts: {}, resources: {} },
      },
      session: { id: "session-123" },
      tools: [
        {
          name: "simulate_router_path",
          description: "Simulate a path",
          inputSchema: { type: "object" },
        },
      ],
      prompts: [
        {
          name: "router-brief",
          description: "Build a short router brief",
          arguments: [{ name: "topic", required: true }],
        },
      ],
      resources: [
        {
          name: "session-context",
          uri: "agent://session/session-123/resource/context",
          description: "Current session context",
          mimeType: "application/json",
        },
      ],
    }),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: "simulate_router_path",
          description: "Simulate a path",
          inputSchema: { type: "object" },
        },
      ],
    }),
    listPrompts: vi.fn().mockResolvedValue({
      prompts: [
        {
          name: "router-brief",
          description: "Build a short router brief",
          arguments: [{ name: "topic", required: true }],
        },
      ],
    }),
    getPrompt: vi.fn().mockResolvedValue({
      description: "Build a short router brief",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Create a router brief about edge latency.",
          },
        },
      ],
    }),
    listResources: vi.fn().mockResolvedValue({
      resources: [
        {
          name: "session-context",
          uri: "agent://session/session-123/resource/context",
          description: "Current session context",
          mimeType: "application/json",
        },
      ],
    }),
    readResource: vi.fn().mockResolvedValue({
      contents: [
        {
          uri: "agent://session/session-123/resource/context",
          text: '{"session":"session-123"}',
          mimeType: "application/json",
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
