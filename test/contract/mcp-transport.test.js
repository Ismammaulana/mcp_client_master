import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ConcurrencyLimitError,
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from "../../src/domain/errors.js";
import { McpClientAdapter } from "../../src/infrastructure/mcp-client.js";
import { testConfig } from "../helpers.js";

function createFakeMcpServer() {
  const server = new McpServer({ name: "fake-mcp", version: "1.0.0" });
  server.registerPrompt(
    "router-brief",
    {
      description: "Build a short router brief",
      argsSchema: { topic: z.string() },
    },
    async ({ topic }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Create a router brief about ${topic}.`,
          },
        },
      ],
    }),
  );
  server.registerResource(
    "session-context",
    "agent://session/context",
    { mimeType: "application/json", description: "Current session context" },
    async (_uri, extra) => ({
      contents: [
        {
          uri: "agent://session/context",
          text: JSON.stringify({ sessionId: extra.sessionId ?? null }),
          mimeType: "application/json",
        },
      ],
    }),
  );
  server.registerTool(
    "echo",
    {
      description: "Echo a message",
      inputSchema: { message: z.string() },
    },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
      structuredContent: { echoed: message },
    }),
  );
  server.registerTool(
    "fail",
    { description: "Return a tool-level error", inputSchema: {} },
    async () => ({
      isError: true,
      content: [{ type: "text", text: "expected failure" }],
    }),
  );
  server.registerTool(
    "delay",
    { description: "Respond after a delay", inputSchema: {} },
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { content: [{ type: "text", text: "late" }] };
    },
  );
  return server;
}

const describeMcpContract =
  process.env.RUN_MCP_CONTRACT === "1" ? describe : describe.skip;

describeMcpContract("real MCP Streamable HTTP contract", () => {
  let httpServer;
  let adapter;
  let baseUrl;
  const receivedHosts = [];
  const transports = new Map();
  const sessionServers = new Map();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  beforeAll(async () => {
    const expressApp = createMcpExpressApp({ host: "test" });
    expressApp.get("/health", (_request, response) => {
      response.status(200).json({ status: "ok" });
    });
    expressApp.post("/broken", (_request, response) => response.destroy());
    expressApp.post("/invalid", (_request, response) => {
      response.status(200).type("application/json").send("not-json");
    });
    expressApp.post("/mcp", async (request, response) => {
      receivedHosts.push(request.headers.host);
      const server = createFakeMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
      response.on("close", async () => {
        await transport.close();
        await server.close();
      });
    });
    expressApp.post("/api/mcp", async (request, response) => {
      const sessionId = request.headers["mcp-session-id"];
      let transport = sessionId ? transports.get(sessionId) : undefined;
      let server = sessionId ? sessionServers.get(sessionId) : undefined;
      if (!transport && !sessionId && isInitializeRequest(request.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (createdSessionId) => {
            transports.set(createdSessionId, transport);
            sessionServers.set(createdSessionId, server);
          },
        });
        server = createFakeMcpServer();
        await server.connect(transport);
      }
      if (!transport || !server) {
        response.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        });
        return;
      }
      await transport.handleRequest(request, response, request.body);
    });
    expressApp.get("/api/mcp/stream", async (request, response) => {
      const sessionId = request.query.sessionId;
      if (typeof sessionId !== "string" || !transports.has(sessionId)) {
        response.status(400).send("Invalid or missing session ID");
        return;
      }
      request.headers["mcp-session-id"] = sessionId;
      await transports.get(sessionId).handleRequest(request, response);
    });

    httpServer = expressApp.listen(0, "127.0.0.1");
    await once(httpServer, "listening");
    const { port } = httpServer.address();
    baseUrl = `http://127.0.0.1:${port}`;
    adapter = new McpClientAdapter(
      testConfig({
        MCP_SERVER_URL: `${baseUrl}/mcp`,
        MCP_HOST_HEADER: "",
        MCP_REQUEST_TIMEOUT_SECONDS: "1",
      }),
      { logger },
    );
  });

  afterAll(async () => {
    await Promise.all(
      [...transports.values()].map(async (transport) => transport.close()),
    );
    await Promise.all(
      [...sessionServers.values()].map(async (server) => server.close()),
    );
    httpServer.close();
    await once(httpServer, "close");
  });

  it("performs initialize and list_tools round trips", async () => {
    const result = await adapter.listTools();
    expect(result.tools.map((tool) => tool.name).sort()).toEqual([
      "delay",
      "echo",
      "fail",
    ]);
    expect(logger.debug).toHaveBeenCalled();
  });

  it("returns structured tool output", async () => {
    const result = await adapter.callTool("echo", { message: "hello" });
    expect(result.structuredContent).toEqual({ echoed: "hello" });
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("discovers only advertised prompts and resources after a health check", async () => {
    const discovery = await adapter.discoverServer();
    expect(discovery.health).toMatchObject({ ok: true, status: 200 });
    expect(discovery.server.info).toEqual({ name: "fake-mcp", version: "1.0.0" });
    expect(discovery.prompts).toEqual([
      expect.objectContaining({ name: "router-brief" }),
    ]);
    expect(discovery.resources).toEqual([
      expect.objectContaining({ uri: "agent://session/context" }),
    ]);
  });

  it("falls back to POST /api/mcp plus GET /api/mcp/stream when /mcp is unavailable", async () => {
    const fallbackAdapter = new McpClientAdapter(
      testConfig({
        MCP_SERVER_URL: `${baseUrl}/missing-mcp`,
        MCP_FALLBACK_POST_URL: `${baseUrl}/api/mcp`,
        MCP_FALLBACK_STREAM_URL: `${baseUrl}/api/mcp/stream`,
        MCP_HEALTH_URL: `${baseUrl}/health`,
        MCP_HOST_HEADER: "",
        MCP_TRANSPORT_MODE: "fallback",
      }),
    );
    const discovery = await fallbackAdapter.discoverServer();
    expect(discovery.transport.mode).toBe("fallback");
    expect(discovery.session.id).toBeTruthy();
    const readResult = await fallbackAdapter.readResource(
      discovery.resources[0].uri,
    );
    expect(readResult.contents[0].mimeType).toBe("application/json");
  });

  it("preserves tool-level errors", async () => {
    const result = await adapter.callTool("fail", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("expected failure");
  });

  it("maps an SDK request timeout to the stable timeout error", async () => {
    const timeoutAdapter = new McpClientAdapter(
      Object.freeze({
        ...adapter.config,
        mcpRequestTimeoutMs: 20,
      }),
    );
    await expect(timeoutAdapter.callTool("delay", {})).rejects.toBeInstanceOf(
      UpstreamTimeoutError,
    );
  });

  it("passes a configured Host header to every MCP request", async () => {
    const hostAdapter = new McpClientAdapter(
      testConfig({
        MCP_SERVER_URL: `${baseUrl}/mcp`,
        MCP_HOST_HEADER: "virtual.test",
      }),
    );
    await hostAdapter.listTools();
    expect(receivedHosts.at(-1)).toBe("virtual.test");
  });

  it.each(["broken", "invalid"])(
    "maps %s upstream responses to the stable unavailable error",
    async (path) => {
      const failingAdapter = new McpClientAdapter(
        testConfig({
          MCP_SERVER_URL: `${baseUrl}/${path}`,
          MCP_HOST_HEADER: "",
          MCP_FALLBACK_POST_URL: `${baseUrl}/${path}`,
          MCP_FALLBACK_STREAM_URL: `${baseUrl}/${path}`,
        }),
      );
      await expect(failingAdapter.listTools()).rejects.toBeInstanceOf(
        UpstreamUnavailableError,
      );
    },
  );

  it("protects the MCP server with a real concurrency limit", async () => {
    const limitedAdapter = new McpClientAdapter(
      testConfig({
        MCP_SERVER_URL: `${baseUrl}/mcp`,
        MCP_HOST_HEADER: "",
        MCP_MAX_CONCURRENCY: "1",
      }),
    );
    const first = limitedAdapter.callTool("delay", {});
    await expect(limitedAdapter.callTool("delay", {})).rejects.toBeInstanceOf(
      ConcurrencyLimitError,
    );
    await expect(first).resolves.toMatchObject({
      content: [{ type: "text", text: "late" }],
    });
  });
});
