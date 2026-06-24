import { ToolNotAllowedError } from "../domain/errors.js";
import { parseCallToolResult } from "../domain/result-parser.js";

export class ToolService {
  constructor(mcpClient, allowedTools) {
    this.mcpClient = mcpClient;
    this.allowedTools = allowedTools;
  }

  async listTools() {
    const response = await this.mcpClient.listTools();
    return response.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? null,
      inputSchema: tool.inputSchema ?? null,
    }));
  }

  async callTool(name, args = {}) {
    this.assertAllowed(name);
    return this.mcpClient.callTool(name, args);
  }

  async simulatePath(source, destination) {
    const result = await this.callTool("simulate_router_path", {
      source,
      destination,
    });
    return parseCallToolResult(result);
  }

  assertAllowed(name) {
    if (!this.allowedTools.has(name)) {
      throw new ToolNotAllowedError(name);
    }
  }
}
