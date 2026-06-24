import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("loads defaults and parses the default allowlist", () => {
    const config = loadConfig({});
    expect(config.gatewayPort).toBe(9100);
    expect(config.mcpServerUrl).toBe("http://localhost:9200/mcp");
    expect([...config.allowedTools]).toEqual(["simulate_router_path"]);
  });

  it("loads overrides and trims the allowlist", () => {
    const config = loadConfig({
      MCP_SERVER_URL: "https://example.test/mcp",
      GATEWAY_PORT: "9201",
      ALLOWED_TOOLS: "echo, simulate_router_path,echo",
    });
    expect(config.gatewayPort).toBe(9201);
    expect([...config.allowedTools]).toEqual(["echo", "simulate_router_path"]);
  });

  it.each([
    [{ GATEWAY_PORT: "0" }, "GATEWAY_PORT"],
    [{ MCP_REQUEST_TIMEOUT_SECONDS: "0" }, "MCP_REQUEST_TIMEOUT_SECONDS"],
    [{ MCP_SERVER_URL: "not-a-url" }, "MCP_SERVER_URL"],
    [{ ALLOWED_TOOLS: ", ," }, "ALLOWED_TOOLS"],
  ])("rejects invalid configuration %#", (environment, expected) => {
    expect(() => loadConfig(environment)).toThrow(expected);
  });
});
