import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { request as undiciRequest } from "undici";
import {
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from "../domain/errors.js";
import { ConcurrencyGate } from "./concurrency-gate.js";

const LONG_RUNNING_TOOL_MIN_TIMEOUT_MS = 120_000;
const LONG_RUNNING_TOOLS = new Set([
  "activation.verify_schema",
  "activation.execute_schema",
]);

function isTimeoutError(error) {
  return (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error?.code === -32001 ||
    error?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    error?.code === "ETIMEDOUT"
  );
}

function createBaseHeaders(config) {
  const headers = new Headers();
  if (config.mcpAuthorization) {
    headers.set("authorization", config.mcpAuthorization);
  }
  if (config.mcpSecretValue) {
    headers.set(config.mcpSecretHeader, config.mcpSecretValue);
  }
  return headers;
}

function mergeHeaders(baseHeaders, initHeaders) {
  const headers = new Headers(baseHeaders);
  if (initHeaders) {
    const additional = new Headers(initHeaders);
    for (const [name, value] of additional.entries()) {
      headers.set(name, value);
    }
  }
  return headers;
}

function createBoundedFetch(config, strategy, getTimeout) {
  const baseHeaders = createBaseHeaders(config);
  return async (input, init = {}) => {
    const headers = mergeHeaders(baseHeaders, init.headers);
    const timeoutSignal = AbortSignal.timeout(getTimeout());
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

    if (strategy.kind === "fallback" && (init.method ?? "GET") === "GET") {
      const streamUrl = new URL(strategy.streamUrl);
      const sessionId = headers.get("mcp-session-id");
      if (sessionId) {
        streamUrl.searchParams.set("sessionId", sessionId);
      }
      input = streamUrl;
    } else if (strategy.kind === "fallback") {
      input = strategy.postUrl;
    }

    if (!config.mcpHostHeader) {
      return fetch(input, { ...init, headers, signal });
    }

    headers.set("host", config.mcpHostHeader);
    const requestHeaders = Object.fromEntries(headers.entries());
    const response = await undiciRequest(String(input), {
      method: init.method ?? "GET",
      headers: requestHeaders,
      body: init.body,
      signal,
    });
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          responseHeaders.append(name, item);
        }
      } else if (value !== undefined) {
        responseHeaders.set(name, String(value));
      }
    }
    const hasBody = ![204, 205, 304].includes(response.statusCode);
    return new Response(hasBody ? response.body : null, {
      status: response.statusCode,
      headers: responseHeaders,
    });
  };
}

function createTransportStrategies(config, cachedStrategyKind) {
  const primary = {
    kind: "primary",
    transportUrl: config.mcpServerUrl,
  };
  const fallback = createFallbackStrategy(config);
  return cachedStrategyKind === "fallback"
    ? [fallback, primary]
    : [primary, fallback];
}

function createFallbackStrategy(config) {
  return {
    kind: "fallback",
    transportUrl: config.mcpFallbackPostUrl,
    postUrl: config.mcpFallbackPostUrl,
    streamUrl: config.mcpFallbackStreamUrl,
  };
}

function sanitizeInstructions(instructions) {
  return typeof instructions === "string" && instructions.length > 0
    ? instructions
    : null;
}

function logAdapterEvent(logger, level, message, details = {}) {
  const method = logger?.[level];
  if (typeof method !== "function") {
    return;
  }
  method.call(logger, details, message);
}

export class McpClientAdapter {
  constructor(config, { logger } = {}) {
    this.config = config;
    this.logger = logger;
    this.gate = new ConcurrencyGate(config.mcpMaxConcurrency);
    this.lastSuccessfulStrategyKind = null;
  }

  async listTools() {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.listTools started");
    const result = await this.gate.run(() =>
      this.#withClient("listTools", async (client) => {
        const tools = await this.#collectList(client.listTools.bind(client), "tools");
        return { tools };
      }),
    );
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.listTools completed", {
      toolCount: result.tools.length,
    });
    return result;
  }

  async listPrompts() {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.listPrompts started");
    const result = await this.gate.run(() =>
      this.#withClient("listPrompts", async (client) => {
        if (!client.getServerCapabilities()?.prompts) {
          return { prompts: [] };
        }
        const prompts = await this.#collectList(
          client.listPrompts.bind(client),
          "prompts",
        );
        return { prompts };
      }),
    );
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.listPrompts completed", {
      promptCount: result.prompts.length,
    });
    return result;
  }

  async getPrompt(name, args = {}) {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.getPrompt started", {
      promptName: name,
      argumentKeys: Object.keys(args),
    });
    const result = await this.gate.run(() =>
      this.#withClient("getPrompt", async (client) => {
        if (!client.getServerCapabilities()?.prompts) {
          return null;
        }
        return client.getPrompt(
          { name, arguments: args },
          { timeout: this.config.mcpRequestTimeoutMs },
        );
      }),
    );
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.getPrompt completed", {
      promptName: name,
      hasPrompt: result !== null,
    });
    return result;
  }

  async listResources() {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.listResources started");
    const result = await this.gate.run(() =>
      this.#withClient("listResources", async (client) => {
        if (!client.getServerCapabilities()?.resources) {
          return { resources: [] };
        }
        const resources = await this.#collectList(
          client.listResources.bind(client),
          "resources",
        );
        return { resources };
      }),
    );
    logAdapterEvent(
      this.logger,
      "debug",
      "McpClientAdapter.listResources completed",
      {
        resourceCount: result.resources.length,
      },
    );
    return result;
  }

  async readResource(uri) {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.readResource started", {
      uri,
    });
    const result = await this.gate.run(() =>
      this.#withClient("readResource", async (client) => {
        if (!client.getServerCapabilities()?.resources) {
          return null;
        }
        return client.readResource(
          { uri },
          { timeout: this.config.mcpRequestTimeoutMs },
        );
      }),
    );
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.readResource completed", {
      uri,
      hasResource: result !== null,
    });
    return result;
  }

  async callTool(name, args) {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.callTool started", {
      toolName: name,
      argumentKeys: Object.keys(args ?? {}),
    });
    // Verifikasi dan eksekusi perangkat dapat melewati timeout umum tanpa berarti upstream macet.
    const requestTimeoutMs = LONG_RUNNING_TOOLS.has(name)
      ? Math.max(this.config.mcpRequestTimeoutMs, LONG_RUNNING_TOOL_MIN_TIMEOUT_MS)
      : this.config.mcpRequestTimeoutMs;
    const result = await this.gate.run(() =>
      this.#withClient("callTool", (client) =>
        client.callTool({ name, arguments: args }, undefined, {
          timeout: requestTimeoutMs,
        }),
        requestTimeoutMs,
      ),
    );
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.callTool completed", {
      toolName: name,
      isError: Boolean(result?.isError),
    });
    return result;
  }

  async probe() {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.probe started");
    await this.gate.run(() => this.#withClient("probe", async () => undefined));
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.probe completed");
  }

  async discoverServer() {
    logAdapterEvent(this.logger, "debug", "McpClientAdapter.discoverServer started");
    const health = await this.#checkHealth();
    const discovery = await this.gate.run(() =>
      this.#withClient("discoverServer", async (client, context) => {
        const capabilities = client.getServerCapabilities() ?? {};
        const tools = capabilities.tools
          ? await this.#collectList(client.listTools.bind(client), "tools")
          : [];
        const prompts = capabilities.prompts
          ? await this.#collectList(client.listPrompts.bind(client), "prompts")
          : [];
        const resources = capabilities.resources
          ? await this.#collectList(client.listResources.bind(client), "resources")
          : [];
        return {
          health,
          transport: {
            mode: context.strategy.kind,
            primaryUrl: this.config.mcpServerUrl,
            activePostUrl:
              context.strategy.kind === "fallback"
                ? this.config.mcpFallbackPostUrl
                : this.config.mcpServerUrl,
            activeStreamUrl:
              context.strategy.kind === "fallback"
                ? this.config.mcpFallbackStreamUrl
                : this.config.mcpServerUrl,
          },
          server: {
            info: client.getServerVersion() ?? null,
            instructions: sanitizeInstructions(client.getInstructions()),
            capabilities,
          },
          session: {
            id: context.transport.sessionId ?? null,
          },
          tools,
          prompts,
          resources,
        };
      }),
    );
    logAdapterEvent(
      this.logger,
      "debug",
      "McpClientAdapter.discoverServer completed",
      {
        transportMode: discovery.transport.mode,
        sessionId: discovery.session.id,
        toolCount: discovery.tools.length,
        promptCount: discovery.prompts.length,
        resourceCount: discovery.resources.length,
      },
    );
    return discovery;
  }

  async #withClient(operationName, operation, requestTimeoutMs = this.config.mcpRequestTimeoutMs) {
    const strategies = await this.#resolveTransportStrategies();
    const failures = [];
    logAdapterEvent(this.logger, "debug", "MCP client operation started", {
      operationName,
      strategyKinds: strategies.map((strategy) => strategy.kind),
    });

    for (const strategy of strategies) {
      try {
        const result = await this.#withClientStrategy(
          operationName,
          strategy,
          operation,
          requestTimeoutMs,
        );
        logAdapterEvent(this.logger, "debug", "MCP client operation completed", {
          operationName,
          strategy: strategy.kind,
        });
        return result;
      } catch (error) {
        failures.push(error);
        if (isTimeoutError(error)) {
          break;
        }
      }
    }

    this.logger?.warn(
      {
        strategyKinds: strategies.map((strategy) => strategy.kind),
        err: failures.at(-1),
      },
      "All MCP transport strategies failed",
    );
    throw this.#mapError(failures.at(-1));
  }

  async #withClientStrategy(operationName, strategy, operation, requestTimeoutMs) {
    let timeout = this.config.mcpConnectTimeoutMs;
    const transport = new StreamableHTTPClientTransport(
      new URL(strategy.transportUrl),
      { fetch: createBoundedFetch(this.config, strategy, () => timeout) },
    );
    const client = new Client({
      name: "mcp-client-master-gateway",
      version: "1.0.0",
    });

    try {
      logAdapterEvent(this.logger, "debug", "MCP client connect started", {
        operationName,
        strategy: strategy.kind,
      });
      await client.connect(transport, {
        timeout: this.config.mcpConnectTimeoutMs,
      });
      timeout = requestTimeoutMs;
      this.lastSuccessfulStrategyKind = strategy.kind;
      logAdapterEvent(this.logger, "debug", "MCP client connect completed", {
        operationName,
        strategy: strategy.kind,
      });
      return await operation(client, { strategy, transport });
    } catch (error) {
      this.logger?.warn(
        { err: error, strategy: strategy.kind, operationName },
        "MCP operation failed",
      );
      throw error;
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        this.logger?.debug(
          { err: closeError, strategy: strategy.kind, operationName },
          "MCP client close failed",
        );
      }
    }
  }

  async #collectList(listMethod, key) {
    const items = [];
    let cursor;
    do {
      const page = await listMethod(
        cursor ? { cursor } : undefined,
        { timeout: this.config.mcpRequestTimeoutMs },
      );
      items.push(...(page[key] ?? []));
      cursor = page.nextCursor;
    } while (cursor);
    return items;
  }

  async #checkHealth() {
    try {
      logAdapterEvent(this.logger, "debug", "MCP health check started", {
        healthUrlMode: this.config.mcpTransportMode,
      });
      const response = await createBoundedFetch(
        this.config,
        { kind: "primary" },
        () => this.config.mcpConnectTimeoutMs,
      )(this.config.mcpHealthUrl, {
        method: "GET",
        headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
      });
      const text = await response.text();
      const health = {
        ok: response.ok,
        status: response.status,
        body: text || null,
      };
      logAdapterEvent(this.logger, "debug", "MCP health check completed", {
        ok: health.ok,
        status: health.status,
      });
      return health;
    } catch (error) {
      logAdapterEvent(this.logger, "warn", "MCP health check failed", {
        err: error,
      });
      throw this.#mapError(error);
    }
  }

  async #resolveTransportStrategies() {
    if (this.config.mcpTransportMode === "primary") {
      return createTransportStrategies(this.config, "primary").slice(0, 1);
    }
    if (this.config.mcpTransportMode === "fallback") {
      return [createFallbackStrategy(this.config)];
    }
    if (this.lastSuccessfulStrategyKind === "fallback") {
      return createTransportStrategies(this.config, "fallback");
    }
    return createTransportStrategies(this.config, this.lastSuccessfulStrategyKind);
  }

  #mapError(error) {
    if (error instanceof UpstreamTimeoutError || error instanceof UpstreamUnavailableError) {
      return error;
    }
    if (isTimeoutError(error)) {
      return new UpstreamTimeoutError({ cause: error });
    }
    return new UpstreamUnavailableError({ cause: error });
  }
}
