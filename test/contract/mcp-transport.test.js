import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

  beforeAll(async () => {
    const expressApp = createMcpExpressApp({ host: "test" });
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
    );
  });

  afterAll(async () => {
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
  });

  it("returns structured tool output", async () => {
    const result = await adapter.callTool("echo", { message: "hello" });
    expect(result.structuredContent).toEqual({ echoed: "hello" });
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
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
