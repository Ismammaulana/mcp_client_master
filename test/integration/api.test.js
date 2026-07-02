import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("exposes upstream discovery with transport choice and session metadata", async () => {
    const app = await build();
    const response = await app.inject({
      method: "GET",
      url: "/mcp/discovery",
      headers: authHeaders,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "success",
      discovery: {
        transport: { mode: "primary" },
        session: { id: "session-123" },
        tools: [{ name: "simulate_router_path" }],
        prompts: [{ name: "router-brief" }],
        resources: [
          { uri: "agent://session/session-123/resource/context" },
        ],
      },
    });
  });

  it("lists prompts and reads resources through dedicated routes", async () => {
    const app = await build();
    const prompts = await app.inject({
      method: "GET",
      url: "/prompts",
      headers: authHeaders,
    });
    expect(prompts.statusCode).toBe(200);
    expect(prompts.json().prompts[0].name).toBe("router-brief");

    const prompt = await app.inject({
      method: "POST",
      url: "/prompts/get",
      headers: authHeaders,
      payload: { name: "router-brief", arguments: { topic: "edge latency" } },
    });
    expect(prompt.statusCode).toBe(200);
    expect(prompt.json().prompt.messages[0].content.text).toContain(
      "edge latency",
    );

    const resources = await app.inject({
      method: "GET",
      url: "/resources",
      headers: authHeaders,
    });
    expect(resources.statusCode).toBe(200);
    expect(resources.json().resources[0].uri).toContain("/resource/context");

    const resource = await app.inject({
      method: "POST",
      url: "/resources/read",
      headers: authHeaders,
      payload: { uri: "agent://session/session-123/resource/context" },
    });
    expect(resource.statusCode).toBe(200);
    expect(resource.json().resource.contents[0].text).toContain("session-123");
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

  it("executes a plan through MCP tools and returns per-step status", async () => {
    const mcpClient = fakeMcpClient({
      callTool: async (name, args) => {
        if (name === "activation.get_workspace_context") {
          return {
            isError: false,
            content: [{ type: "text", text: "workspace loaded" }],
            structuredContent: {
              workspace_id: "ws-1",
              draft_id: "draft-existing",
            },
          };
        }
        if (name === "device.search") {
          return {
            isError: false,
            content: [{ type: "text", text: "device found" }],
            structuredContent: {
              data: {
                data: [{ device_id: 12567 }],
              },
            },
          };
        }
        if (name === "activation.create_draft") {
          return {
            isError: false,
            content: [{ type: "text", text: "draft created" }],
            structuredContent: {
              draftId: "draft-1",
            },
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: "device added" }],
          structuredContent: {
            draftId: args.draft_id,
          },
        };
      },
    });
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "POST",
      url: "/plans/execute",
      headers: authHeaders,
      payload: {
        planId: "plan-1",
        sessionId: "session-1",
        page: "aktivasi-service",
        workspaceId: "ws-1",
        steps: [
          {
            id: "step-1",
            tool: "activation.get_workspace_context",
            arguments: { session_id: "session-1" },
          },
          {
            id: "step-2",
            tool: "device.search",
            arguments: {
              query: "router-a",
            },
          },
          {
            id: "step-3",
            tool: "activation.create_draft",
            arguments: {
              service_type: "service",
            },
          },
          {
            id: "step-4",
            tool: "activation.add_device_to_topology",
            arguments: {
              device_id: "result:device.search.data.data[0].device_id",
              role: "intermediate",
              position: { x: 1, y: 2 },
            },
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      planId: "plan-1",
      status: "success",
      steps: [
        { id: "step-1", tool: "activation.get_workspace_context", status: "success" },
        { id: "step-2", tool: "device.search", status: "success" },
        {
          id: "step-3",
          tool: "activation.create_draft",
          status: "success",
          result: {
            arguments: {
              workspace_id: "ws-1",
              service_type: "service",
            },
          },
        },
        {
          id: "step-4",
          tool: "activation.add_device_to_topology",
          status: "success",
          result: {
            arguments: {
              draft_id: "draft-1",
              device_id: "12567",
            },
          },
        },
      ],
      summary: {
        message: "Plan executed 4 step(s) successfully",
      },
    });
  });

  it("propagates selectedService through draft creation and validates the draft", async () => {
    const calls = [];
    const mcpClient = fakeMcpClient({
      callTool: vi.fn(async (name, args) => {
        calls.push([name, args]);
        if (name === "activation.create_draft") {
          return {
            isError: false,
            content: [{ type: "text", text: "draft created" }],
            structuredContent: {
              selectedService: args.selectedService,
              draftId: "draft-1",
            },
          };
        }
        if (name === "device.search") {
          return {
            isError: false,
            content: [{ type: "text", text: "device found" }],
            structuredContent: {
              data: {
                data: [{ device_id: 1219 }],
              },
            },
          };
        }
        if (name === "topology.add_device") {
          return {
            isError: false,
            content: [{ type: "text", text: "device added" }],
            structuredContent: {
              ok: true,
            },
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: "validation ok" }],
          structuredContent: {
            valid: true,
            issues: [],
          },
        };
      }),
    });
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "POST",
      url: "/plans/execute",
      headers: authHeaders,
      payload: {
        planId: "plan-4",
        sessionId: "session-1",
        page: "aktivasi-service",
        workspaceId: "ws-1",
        steps: [
          {
            tool: "activation.create_draft",
            arguments: {
              service_type: "service",
              draft_name: "Draft Test",
              selectedService: "dia_mix",
            },
          },
          {
            tool: "device.search",
            arguments: {
              query: "10.0.1.60",
            },
          },
          {
            tool: "activation.add_device_to_topology",
            arguments: {
              device_id: "result:device.search.data.data[0].device_id",
              role: "intermediate",
              position: { x: 480, y: 220 },
            },
          },
          {
            tool: "activation.validate_draft",
            arguments: {
              draft_id: "result:activation.create_draft.draftId",
            },
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.planId).toBe("plan-4");
    expect(payload.status).toBe("success");
    expect(payload.steps).toHaveLength(4);
    expect(payload.steps[0]).toMatchObject({
      tool: "activation.create_draft",
      status: "success",
      result: {
        arguments: {
          selectedService: "dia_mix",
        },
      },
    });
    expect(payload.steps[3]).toMatchObject({
      tool: "activation.validate_draft",
      status: "success",
      result: {
        arguments: {
          draft_id: "draft-1",
        },
      },
    });
    expect(payload.summary.message).toBe(
      "Plan executed 4 step(s) successfully",
    );
    expect(calls[0][0]).toBe("activation.create_draft");
    expect(calls[0][1]).toMatchObject({
      selectedService: "dia_mix",
    });
    expect(calls[3][0]).toBe("activation.validate_draft");
    expect(calls[3][1]).toMatchObject({
      draft_id: "draft-1",
    });
  });

  it("propagates tabId from the plan root into activation normalization", async () => {
    const calls = [];
    const mcpClient = fakeMcpClient({
      callTool: vi.fn(async (name, args) => {
        calls.push([name, args]);
        if (name === "activation.create_draft") {
          return {
            isError: false,
            content: [{ type: "text", text: "draft created" }],
            structuredContent: {
              draftId: "draft-1",
            },
          };
        }
        if (name === "activation.get_workspace_context") {
          return {
            isError: false,
            content: [{ type: "text", text: "workspace context" }],
            structuredContent: {
              workspace_id: "ws-1",
              draft_id: "draft-1",
            },
          };
        }
        return {
          isError: false,
          content: [{ type: "text", text: "validation ok" }],
          structuredContent: {
            valid: true,
            issues: [],
          },
        };
      }),
    });
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "POST",
      url: "/plans/execute",
      headers: authHeaders,
      payload: {
        planId: "plan-tabid",
        sessionId: "session-1",
        page: "aktivasi-service",
        workspaceId: "ws-1",
        tabId: "tab-actual",
        steps: [
          {
            tool: "activation.create_draft",
            arguments: {
              service_type: "service",
              draft_name: "Draft Test",
            },
          },
          {
            tool: "activation.get_workspace_context",
            arguments: {},
          },
          {
            tool: "activation.validate_draft",
            arguments: {},
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(calls[0][1]).toMatchObject({
      tab_id: "tab-actual",
    });
    expect(calls[1][1]).toMatchObject({
      tab_id: "tab-actual",
    });
    expect(calls[2][1]).toMatchObject({
      tab_id: "tab-actual",
      draft_id: "draft-1",
    });
  });

  it("fails early when activation plan arguments are still incomplete after normalization", async () => {
    const mcpClient = fakeMcpClient();
    const app = await build(mcpClient);
    const response = await app.inject({
      method: "POST",
      url: "/plans/execute",
      headers: authHeaders,
      payload: {
        planId: "plan-2",
        sessionId: "session-1",
        page: "aktivasi-service",
        workspaceId: "ws-1",
        steps: [
          {
            tool: "activation.create_draft",
            arguments: {
              workspace_id: "ws-1",
            },
          },
          {
            tool: "device.search",
            arguments: { query: "router-a" },
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      planId: "plan-2",
      status: "failed",
      steps: [
        {
          tool: "activation.create_draft",
          status: "failed",
          result: {
            error: {
              code: "PLAN_ARGUMENTS_INVALID",
              fatal: true,
            },
          },
        },
        { tool: "device.search", status: "skipped", result: null },
      ],
    });
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("stops a plan when a step fails fatally", async () => {
    const app = await build(
      fakeMcpClient({
        callTool: async (name) => ({
          isError: name === "device.search",
          content: [{ type: "text", text: `${name} result` }],
          structuredContent:
            name === "activation.get_workspace_context"
              ? { workspaceId: "ws-1" }
              : { items: [] },
        }),
      }),
    );
    const response = await app.inject({
      method: "POST",
      url: "/plans/execute",
      headers: authHeaders,
      payload: {
        planId: "plan-3",
        sessionId: "session-1",
        page: "activation",
        steps: [
          {
            tool: "activation.get_workspace_context",
            arguments: {},
          },
          {
            tool: "device.search",
            arguments: {
              workspaceId: "result:activation.get_workspace_context.workspaceId",
            },
          },
          {
            tool: "activation.validate_draft",
            arguments: {},
          },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      planId: "plan-3",
      status: "failed",
      steps: [
        { tool: "activation.get_workspace_context", status: "success" },
        {
          tool: "device.search",
          status: "failed",
          result: {
            error: {
              code: "MCP_TOOL_ERROR",
              fatal: true,
            },
          },
        },
        { tool: "activation.validate_draft", status: "skipped", result: null },
      ],
    });
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
    expect(logs).toContain("HTTP request completed");
    expect(logs).toContain("Tool list request completed");
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
