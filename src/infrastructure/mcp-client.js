import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { request as undiciRequest } from "undici";
import {
  UpstreamTimeoutError,
  UpstreamUnavailableError,
} from "../domain/errors.js";
import { ConcurrencyGate } from "./concurrency-gate.js";

function isTimeoutError(error) {
  return (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    error?.code === -32001 ||
    error?.code === "UND_ERR_CONNECT_TIMEOUT" ||
    error?.code === "ETIMEDOUT"
  );
}

function createBoundedFetch(config, getTimeout) {
  return async (input, init = {}) => {
    const headers = new Headers(init.headers);
    const timeoutSignal = AbortSignal.timeout(getTimeout());
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal;

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

export class McpClientAdapter {
  constructor(config, { logger } = {}) {
    this.config = config;
    this.logger = logger;
    this.gate = new ConcurrencyGate(config.mcpMaxConcurrency);
  }

  async listTools() {
    return this.gate.run(() =>
      this.#withClient(async (client) => {
        const tools = [];
        let cursor;
        do {
          const page = await client.listTools(
            cursor ? { cursor } : undefined,
            { timeout: this.config.mcpRequestTimeoutMs },
          );
          tools.push(...page.tools);
          cursor = page.nextCursor;
        } while (cursor);
        return { tools };
      }),
    );
  }

  async callTool(name, args) {
    return this.gate.run(() =>
      this.#withClient((client) =>
        client.callTool({ name, arguments: args }, undefined, {
          timeout: this.config.mcpRequestTimeoutMs,
        }),
      ),
    );
  }

  async probe() {
    await this.gate.run(() => this.#withClient(async () => undefined));
  }

  async #withClient(operation) {
    let timeout = this.config.mcpConnectTimeoutMs;
    const transport = new StreamableHTTPClientTransport(
      new URL(this.config.mcpServerUrl),
      { fetch: createBoundedFetch(this.config, () => timeout) },
    );
    const client = new Client({
      name: "mcp-client-master-gateway",
      version: "1.0.0",
    });

    try {
      await client.connect(transport, {
        timeout: this.config.mcpConnectTimeoutMs,
      });
      timeout = this.config.mcpRequestTimeoutMs;
      return await operation(client);
    } catch (error) {
      this.logger?.warn({ err: error }, "MCP operation failed");
      if (isTimeoutError(error)) {
        throw new UpstreamTimeoutError({ cause: error });
      }
      throw new UpstreamUnavailableError({ cause: error });
    } finally {
      try {
        await client.close();
      } catch (closeError) {
        this.logger?.debug({ err: closeError }, "MCP client close failed");
      }
    }
  }
}
