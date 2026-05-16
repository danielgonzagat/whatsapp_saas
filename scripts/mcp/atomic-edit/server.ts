/**
 * kloel-atomic-edit — MCP server that adds the sub-line action space the
 * built-in coarse editors lack. Transport is stdio; diagnostics go to stderr.
 */
import * as os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBasicTools } from "./server-basic-tools.js";
import { log } from "./server-core.js";
import { registerSemanticTools } from "./server-semantic-tools.js";
const server = new McpServer({ name: "kloel-atomic-edit", version: "3.0.0" });
registerBasicTools(server);
registerSemanticTools(server);
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  log(`repoRoot=${process.cwd()}`);
  log(`tmpdir=${os.tmpdir()}`);
  await server.connect(transport);
}
main().catch((e) => {
  process.stderr.write(`[atomic-edit] fatal ${e instanceof Error ? e.stack || e.message : String(e)}\n`);
  process.exit(1);
});
