import { parseCallToolResult } from "../domain/result-parser.js";
import { pathRequestSchema, toolCallRequestSchema } from "./schemas.js";

export async function toolRoutes(app, options) {
  const { toolService, config, authenticate } = options;

  app.get("/tools", { preHandler: authenticate }, async () => ({
    status: "success",
    tools: await toolService.listTools(),
  }));

  app.post(
    "/tools/call",
    {
      preHandler: authenticate,
      schema: { body: toolCallRequestSchema },
    },
    async (request) => {
      const { name, arguments: args = {} } = request.body;
      const result = await toolService.callTool(name, args);
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
    "/simulate-path",
    {
      preHandler: authenticate,
      schema: { body: pathRequestSchema },
    },
    async (request) => ({
      status: "success",
      gateway: "mcp-client-gateway",
      mcp_server_url: config.mcpServerUrl,
      result: await toolService.simulatePath(
        request.body.source,
        request.body.destination,
      ),
    }),
  );
}
