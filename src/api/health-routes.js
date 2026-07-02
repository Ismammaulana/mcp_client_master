export async function healthRoutes(app, options) {
  const { config, mcpClient, authenticate } = options;

  app.get("/health", async (request) => {
    request.log?.debug(
      {
        requestId: request.id,
        route: "/health",
      },
      "Legacy health check requested",
    );
    return {
      status: "ok",
      service: "mcp-client-gateway",
      mcp_server_url: config.mcpServerUrl,
      mcp_host_header: config.mcpHostHeader,
    };
  });

  app.get("/health/live", async () => ({
    status: "ok",
    service: "mcp-client-master-gateway",
  }));

  app.get(
    "/health/ready",
    { preHandler: authenticate },
    async (request, reply) => {
      request.log?.info(
        {
          requestId: request.id,
          route: "/health/ready",
        },
        "Readiness probe started",
      );
      await mcpClient.probe();
      request.log?.info(
        {
          requestId: request.id,
          route: "/health/ready",
        },
        "Readiness probe completed",
      );
      return reply.send({
        status: "ready",
        service: "mcp-client-master-gateway",
      });
    },
  );
}
