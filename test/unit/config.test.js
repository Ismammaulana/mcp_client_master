import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";

describe("loadConfig", () => {
  it("loads defaults and parses the default allowlist", () => {
    const config = loadConfig({});
    expect(config.gatewayPort).toBe(9100);
    expect(config.mcpServerUrl).toBe("http://localhost:9200/mcp");
    expect(config.mcpHealthUrl).toBe("http://localhost:9200/health");
    expect(config.mcpFallbackPostUrl).toBe("http://localhost:9200/api/mcp");
    expect(config.mcpFallbackStreamUrl).toBe(
      "http://localhost:9200/api/mcp/stream",
    );
    expect([...config.allowedTools]).toEqual([
      "simulate_router_path",
      "activation.get_workspace_context",
      "activation.create_draft",
      "activation.import_ewo_schema",
      "device.search",
      "device.get_ports",
      "activation.add_device_to_topology",
      "topology.add_device",
      "activation.configure_device",
      "activation.validate_draft",
      "activation.verify_schema",
      "activation.execute_schema",
    ]);
  });

  it("loads overrides and trims the allowlist", () => {
    const config = loadConfig({
      MCP_SERVER_URL: "https://example.test/mcp",
      MCP_HEALTH_URL: "https://example.test/readyz",
      MCP_FALLBACK_POST_URL: "https://example.test/api/mcp",
      MCP_FALLBACK_STREAM_URL: "https://example.test/api/mcp/stream",
      MCP_TRANSPORT_MODE: "fallback",
      GATEWAY_PORT: "9201",
      MCP_AUTHORIZATION: "Bearer test-token",
      MCP_SECRET_HEADER: "x-custom-secret",
      MCP_SECRET_VALUE: "secret-value",
      ALLOWED_TOOLS: "echo, simulate_router_path,echo",
    });
    expect(config.gatewayPort).toBe(9201);
    expect(config.mcpHealthUrl).toBe("https://example.test/readyz");
    expect(config.mcpTransportMode).toBe("fallback");
    expect(config.mcpAuthorization).toBe("Bearer test-token");
    expect(config.mcpSecretHeader).toBe("x-custom-secret");
    expect(config.mcpSecretValue).toBe("secret-value");
    expect([...config.allowedTools]).toEqual(["echo", "simulate_router_path"]);
  });

  it("loads upstream secret aliases when present", () => {
    const config = loadConfig({
      MCP_UPSTREAM_SECRET_HEADER: "x-upstream-secret",
      MCP_UPSTREAM_SECRET: "upstream-secret-value",
      MCP_SECRET_HEADER: "x-legacy-secret",
      MCP_SECRET_VALUE: "legacy-secret-value",
    });

    expect(config.mcpSecretHeader).toBe("x-upstream-secret");
    expect(config.mcpSecretValue).toBe("upstream-secret-value");
  });

  it.each([
    [{ GATEWAY_PORT: "0" }, "GATEWAY_PORT"],
    [{ MCP_REQUEST_TIMEOUT_SECONDS: "0" }, "MCP_REQUEST_TIMEOUT_SECONDS"],
    [{ MCP_SERVER_URL: "not-a-url" }, "MCP_SERVER_URL"],
    [{ MCP_HEALTH_URL: "not-a-url" }, "MCP_HEALTH_URL"],
    [{ MCP_TRANSPORT_MODE: "invalid" }, "MCP_TRANSPORT_MODE"],
    [{ ALLOWED_TOOLS: ", ," }, "ALLOWED_TOOLS"],
  ])("rejects invalid configuration %#", (environment, expected) => {
    expect(() => loadConfig(environment)).toThrow(expected);
  });
});
