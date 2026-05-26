/**
 * Live proof against REAL repo files, through the production path:
 * spawn the launcher exactly as Claude Code will, speak MCP stdio, exercise
 * read + a preview (dry-run) edit. Nothing is written. Ephemeral demo file.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const TARGET = "scripts/mcp/atomic-edit/nav.ts"; // a real, non-protected source file

function show(title: string, res: { content: { text: string }[] }) {
  const text = res.content[0]?.text ?? "(no content)";
  process.stdout.write(`\n=== ${title} ===\n${text}\n`);
}

(async () => {
  const transport = new StdioClientTransport({
    command: "bash",
    args: [path.join(repoRoot, "scripts/mcp/atomic-edit-mcp-launcher.sh")],
    cwd: process.cwd(),
    stderr: "inherit",
  });
  const client = new Client({ name: "demo", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = await client.listTools();
    process.stdout.write(`tools exposed: ${tools.tools.map((t) => t.name).join(", ")}\n`);

    show(
      "code_outline (real file, signature map — no bodies)",
      (await client.callTool({ name: "code_outline", arguments: { file: TARGET } })) as never,
    );

    show(
      "code_read_symbol readSymbol (by name, exact range)",
      (await client.callTool({
        name: "code_read_symbol",
        arguments: { file: TARGET, selector: "readSymbol" },
      })) as never,
    );

    show(
      "atomic_edit_symbol PREVIEW (dry-run — NOT written)",
      (await client.callTool({
        name: "atomic_edit_symbol",
        arguments: {
          file: TARGET,
          selector: "extOf",
          op: "replace",
          code: "function extOf(file: string): string {\n  const i = file.lastIndexOf('.');\n  return i < 0 ? '' : file.slice(i).toLowerCase();\n}",
          preview: true,
        },
      })) as never,
    );

    show(
      "governance guard on a protected file (must refuse)",
      (await client.callTool({
        name: "atomic_insert_at",
        arguments: { file: "AGENTS.md", line: 1, column: 1, text: "x" },
      })) as never,
    );
  } finally {
    await client.close().catch(() => {});
  }
})().catch((e) => {
  process.stderr.write(`DEMO CRASH: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(1);
});
