import "reflect-metadata";
import { FastMCP } from "fastmcp";
import { DatabaseService } from "./database/database.service";
import { SmartFetchTool } from "./tools/smart_fetch";

async function bootstrap() {
  // Initialize database service
  const databaseService = new DatabaseService();
  await databaseService.init();

  // Create FastMCP server instance
  const server = new FastMCP({
    name: "mcp-cursor-rules",
    version: "1.0.0",
  });

  // Register tools
  const smartFetchTool = new SmartFetchTool(databaseService);
  server.addTool({
    ...SmartFetchTool.definition,
    execute: smartFetchTool.execute.bind(smartFetchTool),
  });

  // Start the server
  await server.start();
  console.log("MCP Server is running");

  // Handle shutdown
  process.on("SIGTERM", async () => {
    console.log("Shutting down...");
    await server.stop();
    await databaseService.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
