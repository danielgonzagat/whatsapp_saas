/**
 * kloel-atomic-edit — MCP server that adds the sub-line action space the
 * built-in coarse editors lack.
 *
 * Closes the "Line-Oriented Action Bottleneck" at exactly the layer the
 * thesis identifies as defective: the agent/CLI tool contract. The model is
 * unchanged; the SYSTEM's action space gains first-class atomic operators,
 * loaded in every session via .mcp.json.
 *
 * Every tool: structural validation BEFORE write, atomic write (no torn
 * files), repo-containment + governance-protection guard, and an
 * Expansion-Factor metric so the thesis becomes measurable in practice.
 *
 * Transport is stdio. NOTHING may be written to stdout except MCP protocol
 * frames; all diagnostics go to stderr.
 *
 * Implementation is split into sibling modules (server-helpers-*.ts +
 * server-tools-{a..h}.ts) so each stays below the architecture-guard line
 * budget. This file is the orchestrator: it creates the McpServer instance,
 * delegates tool registration to each `register*Tools(server)` module, and
 * wires up the stdio transport in `main()`.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as os from 'node:os';
import { log } from './server-helpers-io.js';
import { registerToolsA } from './server-tools-a.js';
import { registerToolsB } from './server-tools-b.js';
import { registerToolsC } from './server-tools-c.js';
import { registerToolsD } from './server-tools-d.js';
import { registerToolsE1 } from './server-tools-e1.js';
import { registerToolsE2 } from './server-tools-e2.js';
import { registerToolsF } from './server-tools-f.js';
import { registerToolsG } from './server-tools-g.js';
import { registerToolsH } from './server-tools-h.js';
import { registerToolsNative } from './server-tools-native.js';
import { registerToolsNativeIo } from './server-tools-native-io.js';
import { registerToolsLocate } from './server-tools-locate.js';

const server = new McpServer({ name: 'kloel-atomic-edit', version: '4.0.0' });

registerToolsA(server);
registerToolsB(server);
registerToolsC(server);
registerToolsD(server);
registerToolsE1(server);
registerToolsE2(server);
registerToolsF(server);
registerToolsG(server);
registerToolsH(server);
registerToolsNative(server);
registerToolsNativeIo(server);
registerToolsLocate(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready — repo=${process.cwd()} node=${process.version} pid=${process.pid}`);
  log(`tmpdir=${os.tmpdir()}`);
}

main().catch((e) => {
  log('FATAL', e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
