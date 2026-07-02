import { parseCallToolResult } from "../domain/result-parser.js";
import {
  planExecutionRequestSchema,
  pathRequestSchema,
  promptGetRequestSchema,
  resourceReadRequestSchema,
  toolCallRequestSchema,
} from "./schemas.js";

function logRouteEvent(request, level, message, details = {}) {
  const logger = request.log;
  const method = logger?.[level];
  if (typeof method !== "function") {
    return;
  }
  method.call(logger, { requestId: request.id, ...details }, message);
}

function elapsedMs(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

export async function toolRoutes(app, options) {
  const { toolService, config, authenticate } = options;

  app.get("/mcp/discovery", { preHandler: authenticate }, async (request) => {
    const startedAt = process.hrtime.bigint();
    logRouteEvent(request, "info", "MCP discovery request started", {
      route: "/mcp/discovery",
    });
    const discovery = await toolService.discoverServer();
    logRouteEvent(request, "info", "MCP discovery request completed", {
      route: "/mcp/discovery",
      durationMs: elapsedMs(startedAt),
      transportMode: discovery.transport?.mode ?? null,
      toolCount: discovery.tools.length,
      promptCount: discovery.prompts.length,
      resourceCount: discovery.resources.length,
    });
    return {
      status: "success",
      discovery,
    };
  });

  app.get("/tools", { preHandler: authenticate }, async (request) => {
    const startedAt = process.hrtime.bigint();
    logRouteEvent(request, "info", "Tool list request started", {
      route: "/tools",
    });
    const tools = await toolService.listTools();
    logRouteEvent(request, "info", "Tool list request completed", {
      route: "/tools",
      durationMs: elapsedMs(startedAt),
      toolCount: tools.length,
    });
    return {
      status: "success",
      tools,
    };
  });

  app.get("/prompts", { preHandler: authenticate }, async (request) => {
    const startedAt = process.hrtime.bigint();
    logRouteEvent(request, "info", "Prompt list request started", {
      route: "/prompts",
    });
    const prompts = await toolService.listPrompts();
    logRouteEvent(request, "info", "Prompt list request completed", {
      route: "/prompts",
      durationMs: elapsedMs(startedAt),
      promptCount: prompts.length,
    });
    return {
      status: "success",
      prompts,
    };
  });

  app.post(
    "/prompts/get",
    {
      preHandler: authenticate,
      schema: { body: promptGetRequestSchema },
    },
    async (request) => {
      const startedAt = process.hrtime.bigint();
      const { name, arguments: args = {} } = request.body;
      logRouteEvent(request, "info", "Prompt retrieval request started", {
        route: "/prompts/get",
        promptName: name,
        argumentKeys: Object.keys(args),
      });
      const prompt = await toolService.getPrompt(name, args);
      logRouteEvent(request, "info", "Prompt retrieval request completed", {
        route: "/prompts/get",
        promptName: name,
        durationMs: elapsedMs(startedAt),
        messageCount: prompt?.messages?.length ?? 0,
      });
      return {
        status: "success",
        prompt_name: name,
        prompt,
      };
    },
  );

  app.get("/resources", { preHandler: authenticate }, async (request) => {
    const startedAt = process.hrtime.bigint();
    logRouteEvent(request, "info", "Resource list request started", {
      route: "/resources",
    });
    const resources = await toolService.listResources();
    logRouteEvent(request, "info", "Resource list request completed", {
      route: "/resources",
      durationMs: elapsedMs(startedAt),
      resourceCount: resources.length,
    });
    return {
      status: "success",
      resources,
    };
  });

  app.post(
    "/resources/read",
    {
      preHandler: authenticate,
      schema: { body: resourceReadRequestSchema },
    },
    async (request) => {
      const startedAt = process.hrtime.bigint();
      logRouteEvent(request, "info", "Resource read request started", {
        route: "/resources/read",
        uri: request.body.uri,
      });
      const resource = await toolService.readResource(request.body.uri);
      logRouteEvent(request, "info", "Resource read request completed", {
        route: "/resources/read",
        uri: request.body.uri,
        durationMs: elapsedMs(startedAt),
        hasResource: resource !== null,
      });
      return {
        status: "success",
        resource,
      };
    },
  );

  app.post(
    "/tools/call",
    {
      preHandler: authenticate,
      schema: { body: toolCallRequestSchema },
    },
    async (request) => {
      const startedAt = process.hrtime.bigint();
      const { name, arguments: args = {} } = request.body;
      logRouteEvent(request, "info", "Tool call request started", {
        route: "/tools/call",
        toolName: name,
        argumentKeys: Object.keys(args),
      });
      const result = await toolService.callTool(name, args);
      logRouteEvent(request, "info", "Tool call request completed", {
        route: "/tools/call",
        toolName: name,
        durationMs: elapsedMs(startedAt),
        isError: Boolean(result?.isError),
      });
      return {
        status: "success",
        tool_name: name,
        ok: !result?.isError,
        content: result?.content ?? null,
        structured_content: result?.structuredContent ?? null,
        parsed_result: parseCallToolResult(result),
      };
    },
  );

  app.post(
    "/plans/execute",
    {
      preHandler: authenticate,
      schema: { body: planExecutionRequestSchema },
    },
    async (request) => {
      const startedAt = process.hrtime.bigint();
      logRouteEvent(request, "info", "Plan execution request started", {
        route: "/plans/execute",
        planId: request.body.planId ?? null,
        sessionId: request.body.sessionId ?? null,
        page: request.body.page ?? null,
        stepCount: request.body.steps?.length ?? 0,
      });
      const result = await toolService.executePlan(request.body, {
        requestId: request.id,
      });
      logRouteEvent(request, "info", "Plan execution request completed", {
        route: "/plans/execute",
        planId: request.body.planId ?? null,
        durationMs: elapsedMs(startedAt),
        status: result.status,
        stepCount: result.steps.length,
      });
      return result;
    },
  );

  app.post(
    "/simulate-path",
    {
      preHandler: authenticate,
      schema: { body: pathRequestSchema },
    },
    async (request) => {
      const startedAt = process.hrtime.bigint();
      logRouteEvent(request, "info", "Path simulation request started", {
        route: "/simulate-path",
        source: request.body.source,
        destination: request.body.destination,
      });
      const result = await toolService.simulatePath(
        request.body.source,
        request.body.destination,
      );
      logRouteEvent(request, "info", "Path simulation request completed", {
        route: "/simulate-path",
        durationMs: elapsedMs(startedAt),
      });
      return {
        status: "success",
        gateway: "mcp-client-gateway",
        mcp_server_url: config.mcpServerUrl,
        result,
      };
    },
  );
}
