import { describe, expect, it, vi } from "vitest";
import { ToolNotAllowedError } from "../../src/domain/errors.js";
import { ToolService } from "../../src/services/tool-service.js";

describe("ToolService", () => {
  it("rejects a tool outside the allowlist before calling upstream", async () => {
    const mcpClient = { callTool: vi.fn() };
    const service = new ToolService(mcpClient, new Set(["allowed"]));
    await expect(service.callTool("blocked", {})).rejects.toBeInstanceOf(
      ToolNotAllowedError,
    );
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("passes shortcut arguments exactly", async () => {
    const mcpClient = {
      callTool: vi.fn().mockResolvedValue({ structuredContent: { hops: 2 } }),
    };
    const service = new ToolService(
      mcpClient,
      new Set(["simulate_router_path"]),
    );
    await service.simulatePath("router-a", "router-b");
    expect(mcpClient.callTool).toHaveBeenCalledWith("simulate_router_path", {
      source: "router-a",
      destination: "router-b",
    });
  });

  it("normalizes discovery output without inventing capabilities", async () => {
    const mcpClient = {
      discoverServer: vi.fn().mockResolvedValue({
        health: { ok: true, status: 200, body: "{\"status\":\"ok\"}" },
        transport: {
          mode: "fallback",
          primaryUrl: "http://example.test/mcp",
          activePostUrl: "http://example.test/api/mcp",
          activeStreamUrl: "http://example.test/api/mcp/stream",
        },
        server: {
          info: { name: "master", version: "1.0.0" },
          instructions: "Use only discovered resources.",
          capabilities: { tools: {}, resources: {} },
        },
        session: { id: "session-1" },
        tools: [{ name: "echo", description: undefined, inputSchema: undefined }],
        prompts: [],
        resources: [
          {
            uri: "agent://session/session-1/resource/context",
            name: undefined,
            description: undefined,
            mimeType: undefined,
          },
        ],
      }),
    };
    const service = new ToolService(mcpClient, new Set(["echo"]));
    const result = await service.discoverServer();
    expect(result.tools).toEqual([
      { name: "echo", description: null, inputSchema: null },
    ]);
    expect(result.prompts).toEqual([]);
    expect(result.resources).toEqual([
      {
        name: null,
        uri: "agent://session/session-1/resource/context",
        description: null,
        mimeType: null,
      },
    ]);
  });

  it("executes a plan sequentially and resolves result placeholders", async () => {
    const mcpClient = {
      callTool: vi
        .fn()
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "workspace loaded" }],
          structuredContent: {
            workspace_id: "ws-1",
            draft_id: "draft-existing",
          },
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "device found" }],
          structuredContent: {
            data: {
              data: [{ device_id: 12567 }],
            },
          },
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "draft created" }],
          structuredContent: {
            draftId: "draft-44",
          },
        }),
    };
    const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };
    const service = new ToolService(
      mcpClient,
      new Set([
        "activation.get_workspace_context",
        "device.search",
        "activation.create_draft",
        "activation.add_device_to_topology",
      ]),
      { logger },
    );

    const result = await service.executePlan({
      planId: "plan-1",
      sessionId: "session-1",
      page: "aktivasi-service",
      workspaceId: "ws-1",
      steps: [
        {
          id: "step-1",
          tool: "activation.get_workspace_context",
          arguments: {
            session_id: "session-1",
            include: ["workspace", "draft"],
          },
        },
        {
          id: "step-2",
          tool: "device.search",
          arguments: { query: "router-a" },
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
            role: "PE",
            position: { x: 10, y: 20 },
          },
        },
      ],
    });

    expect(result).toMatchObject({
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
              workspace_id: "ws-1",
              draft_id: "draft-44",
              device_id: "12567",
            },
          },
        },
      ],
    });
    expect(mcpClient.callTool).toHaveBeenNthCalledWith(
      1,
      "activation.get_workspace_context",
      {
        workspace_id: "ws-1",
        session_id: "session-1",
        include: ["workspace", "draft"],
      },
    );
    expect(mcpClient.callTool).toHaveBeenNthCalledWith(
      2,
      "device.search",
      { workspace_id: "ws-1", query: "router-a" },
    );
    expect(mcpClient.callTool).toHaveBeenNthCalledWith(
      3,
      "activation.create_draft",
      expect.objectContaining({
        workspace_id: "ws-1",
        service_type: "service",
        draft_name: expect.stringMatching(/^Draft service /),
      }),
    );
    expect(mcpClient.callTool).toHaveBeenNthCalledWith(
      4,
      "activation.add_device_to_topology",
      {
        workspace_id: "ws-1",
        draft_id: "draft-44",
        device_id: "12567",
        role: "PE",
        position: { x: 10, y: 20 },
      },
    );
    expect(logger.info).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  it("executes validate_draft without forcing a draft_id", async () => {
    const mcpClient = {
      callTool: vi
        .fn()
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "draft created" }],
          structuredContent: {
            draftId: "",
          },
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "validation ok" }],
          structuredContent: {
            valid: true,
          },
        }),
    };
    const service = new ToolService(
      mcpClient,
      new Set(["activation.create_draft", "activation.validate_draft"]),
    );

    await service.executePlan({
      planId: "plan-validate",
      sessionId: "session-1",
      page: "aktivasi-service",
      workspaceId: "ws-1",
      steps: [
        {
          tool: "activation.create_draft",
          arguments: {
            service_type: "service",
            draft_name: "Draft Test",
          },
        },
        {
          tool: "activation.validate_draft",
          arguments: {},
        },
      ],
    });

    expect(mcpClient.callTool).toHaveBeenNthCalledWith(
      2,
      "activation.validate_draft",
      {
        workspace_id: "ws-1",
        draft_id: "draft-ws-1-service",
      },
    );
  });

  it("maps activation add-device tool to legacy topology.add_device when only legacy name is allowed", async () => {
    const mcpClient = {
      callTool: vi
        .fn()
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "draft created" }],
          structuredContent: {
            draftId: "draft-44",
          },
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: "text", text: "device added" }],
          structuredContent: {
            ok: true,
          },
        }),
    };
    const service = new ToolService(
      mcpClient,
      new Set(["activation.create_draft", "topology.add_device"]),
    );

    await service.executePlan({
      planId: "plan-legacy-alias",
      sessionId: "session-1",
      page: "aktivasi-service",
      workspaceId: "ws-1",
      steps: [
        {
          tool: "activation.create_draft",
          arguments: {
            service_type: "service",
            draft_name: "Draft Test",
          },
        },
        {
          tool: "activation.add_device_to_topology",
          arguments: {
            device_id: "dev-9",
            role: "PE",
            position: { x: 10, y: 20 },
          },
        },
      ],
    });

    expect(mcpClient.callTool).toHaveBeenNthCalledWith(
      2,
      "topology.add_device",
      {
        workspace_id: "ws-1",
        draft_id: "draft-44",
        device_id: "dev-9",
        role: "PE",
        position: { x: 10, y: 20 },
      },
    );
  });

  it("fails early when required activation arguments remain missing after normalization", async () => {
    const mcpClient = { callTool: vi.fn() };
    const service = new ToolService(
      mcpClient,
      new Set(["activation.create_draft", "device.search"]),
    );

    const result = await service.executePlan({
      planId: "plan-2",
      sessionId: "session-1",
      page: "aktivasi-service",
      workspaceId: "ws-1",
      steps: [
        {
          tool: "activation.create_draft",
          arguments: { workspace_id: "ws-1" },
        },
        {
          tool: "device.search",
          arguments: { query: "router-a" },
        },
      ],
    });

    expect(result).toMatchObject({
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
    expect(result.steps[0].result.error.message).toContain("service_type");
    expect(result.steps[0].result.error.message).toContain("draft_name");
    expect(mcpClient.callTool).not.toHaveBeenCalled();
  });

  it("stops a plan on placeholder resolution failure and skips remaining steps", async () => {
    const mcpClient = {
      callTool: vi.fn().mockResolvedValue({
        isError: false,
        content: [{ type: "text", text: "workspace loaded" }],
        structuredContent: {
          workspaceId: "ws-1",
        },
      }),
    };
    const service = new ToolService(
      mcpClient,
      new Set(["activation.get_workspace_context", "device.search"]),
    );

    const result = await service.executePlan({
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
          arguments: { deviceId: "result:device.search.items[0].deviceId" },
        },
        {
          tool: "device.search",
          arguments: { workspaceId: "ws-1" },
        },
      ],
    });

    expect(result).toMatchObject({
      planId: "plan-3",
      status: "failed",
      steps: [
        { tool: "activation.get_workspace_context", status: "success" },
        {
          tool: "device.search",
          status: "failed",
          result: {
            error: {
              code: "PLACEHOLDER_RESOLUTION_FAILED",
              fatal: true,
            },
          },
        },
        { tool: "device.search", status: "skipped", result: null },
      ],
    });
    expect(mcpClient.callTool).toHaveBeenCalledTimes(1);
  });
});
