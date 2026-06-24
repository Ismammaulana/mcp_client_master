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
});
