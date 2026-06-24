import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { authHeaders, fakeMcpClient, testConfig } from "../helpers.js";

describe("legacy success contracts", () => {
  let app;
  let mcpClient;

  beforeEach(async () => {
    mcpClient = fakeMcpClient();
    app = await createApp(testConfig(), { mcpClient, logger: false });
  });

  afterEach(async () => app.close());

  it("GET /health retains the compatibility response", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "mcp-client-gateway",
      mcp_server_url: "http://mcp.test:9200/mcp",
      mcp_host_header: "mcp.internal",
    });
  });

  it("GET /tools retains the tool schema response", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/tools",
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "success",
      tools: [
        {
          name: "simulate_router_path",
          description: "Simulate a path",
          inputSchema: { type: "object" },
        },
      ],
    });
  });

  it("POST /tools/call retains content and parsed result", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/tools/call",
      headers: authHeaders,
      payload: { name: "echo" },
    });
    expect(response.statusCode).toBe(200);
    expect(mcpClient.callTool).toHaveBeenCalledWith("echo", {});
    expect(response.json()).toEqual({
      status: "success",
      tool_name: "echo",
      ok: true,
      content: [{ type: "text", text: "ok" }],
      structured_content: { path: ["router-a", "router-b"] },
      parsed_result: {
        ok: true,
        mode: "structured",
        data: { path: ["router-a", "router-b"] },
      },
    });
  });

  it("POST /simulate-path forwards exact arguments", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/simulate-path",
      headers: authHeaders,
      payload: { source: "router-a", destination: "router-b" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().result.mode).toBe("structured");
    expect(mcpClient.callTool).toHaveBeenCalledWith("simulate_router_path", {
      source: "router-a",
      destination: "router-b",
    });
  });

  it("returns 422 for invalid request bodies", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/simulate-path",
      headers: authHeaders,
      payload: { source: "", destination: "router-b" },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("keeps tool-level errors as HTTP 200 with ok false", async () => {
    mcpClient.callTool.mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "tool failed" }],
    });
    const response = await app.inject({
      method: "POST",
      url: "/tools/call",
      headers: authHeaders,
      payload: { name: "echo", arguments: {} },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(false);
    expect(response.json().parsed_result.ok).toBe(false);
  });
});
