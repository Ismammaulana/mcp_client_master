export async function healthRoutes(app, options) {
  const { config, mcpClient, authenticate } = options;

  app.get("/health", async () => ({
    status: "ok",
    service: "mcp-client-gateway",
    mcp_server_url: config.mcpServerUrl,
    mcp_host_header: config.mcpHostHeader,
  }));

  app.get("/health/live", async () => ({
    status: "ok",
    service: "mcp-client-master-gateway",
  }));

  app.get(
    "/health/ready",
    { preHandler: authenticate },
    async (_request, reply) => {
      await mcpClient.probe();
      return reply.send({
        status: "ready",
        service: "mcp-client-master-gateway",
      });
    },
  );
}
