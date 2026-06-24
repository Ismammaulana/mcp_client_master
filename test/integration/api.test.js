import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { UpstreamTimeoutError } from "../../src/domain/errors.js";
import { authHeaders, fakeMcpClient, testConfig } from "../helpers.js";

const apps = [];

async function build(mcpClient = fakeMcpClient(), config = testConfig()) {
  const app = await createApp(config, { mcpClient, logger: false });
  apps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("gateway API", () => {
  it("serves liveness without probing MCP", async () => {
    const mcpClient = fakeMcpClient();
    const app = await build(mcpClient);
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "mcp-client-master-gateway",
    });
    expect(mcpClient.probe).not.toHaveBeenCalled();
  });

  it("bounds readiness to an MCP probe", async () => {
    const mcpClient = fakeMcpClient();
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(mcpClient.probe).toHaveBeenCalledOnce();
  });

  it("keeps liveness healthy when readiness fails", async () => {
    const mcpClient = fakeMcpClient({
      probe: async () => {
        throw new UpstreamTimeoutError();
      },
    });
    const app = await build(mcpClient);
    const readiness = await app.inject({
      method: "GET",
      url: "/health/ready",
      headers: authHeaders,
    });
    const liveness = await app.inject({ method: "GET", url: "/health/live" });
    expect(readiness.statusCode).toBe(504);
    expect(liveness.statusCode).toBe(200);
  });

  it("requires auth before invoking MCP", async () => {
    const mcpClient = fakeMcpClient();
    const app = await build(mcpClient);
    const response = await app.inject({ method: "GET", url: "/tools" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
    expect(mcpClient.listTools).not.toHaveBeenCalled();
  });

  it("permits local compatibility mode when API_KEY is empty", async () => {
    const app = await build(
      fakeMcpClient(),
      testConfig({ API_KEY: "" }),
    );
    const response = await app.inject({ method: "GET", url: "/tools" });
    expect(response.statusCode).toBe(200);
  });

  it("echoes a bounded incoming request ID", async () => {
    const app = await build();
    const response = await app.inject({
      method: "GET",
      url: "/health/live",
      headers: { "x-request-id": "correlation-123" },
    });
    expect(response.headers["x-request-id"]).toBe("correlation-123");
  });

  it("rejects oversized bodies with a stable 413 error", async () => {
    const app = await build(
      fakeMcpClient(),
      testConfig({ REQUEST_BODY_LIMIT_BYTES: "1024" }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/tools/call",
      headers: authHeaders,
      payload: { name: "echo", arguments: { data: "x".repeat(2048) } },
    });
    expect(response.statusCode).toBe(413);
    expect(response.json().error.code).toBe("REQUEST_TOO_LARGE");
  });

  it("returns a stable rate-limit envelope without invoking MCP", async () => {
    const mcpClient = fakeMcpClient();
    const app = await build(
      mcpClient,
      testConfig({ RATE_LIMIT_MAX: "1", API_KEY: "" }),
    );
    await app.inject({ method: "GET", url: "/health/live" });
    const response = await app.inject({ method: "GET", url: "/tools" });
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(mcpClient.listTools).not.toHaveBeenCalled();
  });

  it("returns 403 without upstream execution for a blocked tool", async () => {
    const mcpClient = fakeMcpClient();
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "POST",
      url: "/tools/call",
      headers: authHeaders,
      payload: { name: "dangerous", arguments: {} },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("TOOL_NOT_ALLOWED");
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("maps timeouts without exposing raw exception details", async () => {
    const mcpClient = fakeMcpClient({
      listTools: async () => {
        throw new UpstreamTimeoutError({ cause: new Error("10.0.0.1 secret") });
      },
    });
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "GET",
      url: "/tools",
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(504);
    expect(response.json().error.code).toBe("MCP_UPSTREAM_TIMEOUT");
    expect(response.body).not.toContain("10.0.0.1");
  });

  it("redacts API keys from structured request logs", async () => {
    let logs = "";
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    });
    const config = testConfig({ LOG_LEVEL: "info" });
    const mcpClient = fakeMcpClient();
    const app = await createApp(config, { mcpClient, logStream: stream });
    apps.push(app);
    await app.inject({
      method: "GET",
      url: "/tools",
      headers: { "x-api-key": "test-api-key" },
    });
    expect(logs).not.toContain("test-api-key");
    expect(logs).toContain("incoming request");
  });

  it("exposes Prometheus metrics only to an authenticated caller", async () => {
    const app = await build();
    const unauthorized = await app.inject({ method: "GET", url: "/metrics" });
    expect(unauthorized.statusCode).toBe(401);
    const response = await app.inject({
      method: "GET",
      url: "/metrics",
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("mcp_gateway_http_requests_total");
  });
});
