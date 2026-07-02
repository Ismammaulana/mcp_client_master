import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp(config);
app.log?.info(
  {
    host: config.gatewayHost,
    port: config.gatewayPort,
    logLevel: config.logLevel,
    transportMode: config.mcpTransportMode,
    allowedToolsCount: config.allowedTools.size,
  },
  "Gateway bootstrap starting",
);

async function shutdown(signal) {
  app.log.info({ signal }, "Shutting down gateway");
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, "Graceful shutdown failed");
    process.exit(1);
  }
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

try {
  const address = await app.listen({
    host: config.gatewayHost,
    port: config.gatewayPort,
  });
  app.log?.info({ address }, "Gateway listening");
} catch (error) {
  app.log.error({ err: error }, "Gateway failed to start");
  process.exit(1);
}
