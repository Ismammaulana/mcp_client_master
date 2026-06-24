import { afterEach, describe, expect, it } from "vitest";
import { Agent, request as httpRequest } from "node:http";
import { createApp } from "../../src/app.js";
import { testConfig } from "../helpers.js";

const describeNetworkContract =
  process.env.RUN_MCP_CONTRACT === "1" ? describe : describe.skip;

describeNetworkContract("gateway network lifecycle", () => {
  let app;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("waits for an active network request during graceful close", async () => {
    let release;
    let markStarted;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    const blockedResult = new Promise((resolve) => {
      release = resolve;
    });
    const mcpClient = {
      probe: async () => undefined,
      listTools: async () => ({ tools: [] }),
      callTool: async () => {
        markStarted();
        return blockedResult;
      },
    };
    app = await createApp(testConfig(), { mcpClient, logger: false });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const body = JSON.stringify({ name: "echo", arguments: {} });
    const request = new Promise((resolve, reject) => {
      const outgoing = httpRequest({
        hostname: "127.0.0.1",
        port: address.port,
        path: "/tools/call",
        method: "POST",
        agent: false,
        headers: {
          connection: "close",
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          "x-api-key": "test-api-key",
        },
      });
      outgoing.on("response", (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      });
      outgoing.on("error", reject);
      outgoing.end(body);
    });
    await started;

    let closeFinished = false;
    const closing = app.close().then(() => {
      closeFinished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closeFinished).toBe(false);

    release({ content: [{ type: "text", text: "done" }] });
    expect(await request).toBe(200);
    await closing;
    expect(closeFinished).toBe(true);
    app = null;
  });

  it("serves 100 concurrent liveness requests without failures", async () => {
    const mcpClient = {
      probe: async () => undefined,
      listTools: async () => ({ tools: [] }),
      callTool: async () => ({ content: [] }),
    };
    app = await createApp(
      testConfig({ RATE_LIMIT_MAX: "1000" }),
      { mcpClient, logger: false },
    );
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const agent = new Agent({ keepAlive: true, maxSockets: 20 });
    const callHealth = () =>
      new Promise((resolve, reject) => {
        const outgoing = httpRequest(
          {
            hostname: "127.0.0.1",
            port: address.port,
            path: "/health/live",
            method: "GET",
            agent,
          },
          (response) => {
            response.resume();
            response.on("end", () => resolve(response.statusCode));
          },
        );
        outgoing.on("error", reject);
        outgoing.end();
      });

    const statuses = await Promise.all(
      Array.from({ length: 100 }, () => callHealth()),
    );
    agent.destroy();
    expect(new Set(statuses)).toEqual(new Set([200]));
  });
});
