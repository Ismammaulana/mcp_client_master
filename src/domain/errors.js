export class GatewayError extends Error {
  constructor(code, message, statusCode, options = {}) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class UnauthorizedError extends GatewayError {
  constructor() {
    super("UNAUTHORIZED", "A valid API key is required", 401);
  }
}

export class ToolNotAllowedError extends GatewayError {
  constructor(toolName) {
    super("TOOL_NOT_ALLOWED", `Tool '${toolName}' is not allowed`, 403);
  }
}

export class UpstreamUnavailableError extends GatewayError {
  constructor(options = {}) {
    super(
      "MCP_UPSTREAM_UNAVAILABLE",
      "MCP server is unavailable",
      502,
      options,
    );
  }
}

export class UpstreamTimeoutError extends GatewayError {
  constructor(options = {}) {
    super(
      "MCP_UPSTREAM_TIMEOUT",
      "MCP server did not respond in time",
      504,
      options,
    );
  }
}

export class ConcurrencyLimitError extends GatewayError {
  constructor() {
    super(
      "MCP_CONCURRENCY_LIMIT",
      "MCP gateway concurrency limit reached",
      503,
    );
  }
}
