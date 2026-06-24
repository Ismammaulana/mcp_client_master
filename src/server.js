import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp(config);

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
  await app.listen({ host: config.gatewayHost, port: config.gatewayPort });
} catch (error) {
  app.log.error({ err: error }, "Gateway failed to start");
  process.exit(1);
}
