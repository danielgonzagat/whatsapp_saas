/**
 * Operational use + validation: drive the atomic-edit server through the
 * EXACT production path (launcher → MCP stdio) to perform a real, correct
 * edit on a real repo file — temporarily bump McpServer version '4.0.0' ->
 * '4.0.1-test', verify the guard, then restore the original literal.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const TARGET = "scripts/mcp/atomic-edit/server.ts";
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const j = (r: { content: { text: string }[] }) => {
  const text = r.content[0]?.text;
  if (!text) throw new Error("Empty tool response");
  return JSON.parse(text);
};

(async () => {
  const transport = new StdioClientTransport({
    command: "bash",
    args: [path.join(repoRoot, "scripts/mcp/atomic-edit-mcp-launcher.sh")],
    cwd: process.cwd(),
    stderr: "inherit",
  });
  const client = new Client({ name: "operational-use", version: "1.0.0" });
  await client.connect(transport);
  try {
    const before = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
    const hash = sha(before);
    process.stdout.write(`target sha256 = ${hash.slice(0, 16)}…\n`);

    // 1) Apply real edit; atomic_replace_literal writes immediately.
    const prev = j(
      await client.callTool({
        name: "atomic_replace_literal",
        arguments: { file: TARGET, currentText: "'4.0.0'", newText: "'4.0.1-test'" },
      }) as never,
    );
    process.stdout.write(`\n[1] replace_literal result:\n${JSON.stringify(prev, null, 2)}\n`);

    const after = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
    const okEdit =
      prev.ok === true &&
      after.includes("version: '4.0.1-test'") &&
      !after.includes("version: '4.0.0'");
    process.stdout.write(`\n[2] file temporarily has version '4.0.1-test': ${okEdit}\n`);

    // 3) sha256 guard must now refuse the OLD hash (proves concurrency guard live)
    const stale = (await client.callTool({
      name: "atomic_add_import",
      arguments: { file: TARGET, module: "node:util", name: "inspect", expectedSha256: hash },
    })) as { content: { text: string }[]; isError?: boolean };
    const guardWorks = stale.isError === true && /sha256 mismatch/.test(stale.content[0]?.text ?? "");
    process.stdout.write(`[3] stale-hash write refused by guard: ${guardWorks}\n`);

    // 4) read-side on a real product file (the CodeStruct accuracy lever)
    const out = j(
      await client.callTool({
        name: "code_outline",
        arguments: { file: "scripts/mcp/atomic-edit/guard.ts" },
      }) as never,
    );
    const readWorks = out.ok === true && out.symbols.some((s: { selector: string }) => s.selector === "resolveSafeTarget");
    process.stdout.write(`[4] code_outline on real file resolves symbols: ${readWorks}\n`);

    const revert = j(
      await client.callTool({
        name: "atomic_replace_literal",
        arguments: { file: TARGET, currentText: "'4.0.1-test'", newText: "'4.0.0'" },
      }) as never,
    );
    const restoredText = fs.readFileSync(path.join(repoRoot, TARGET), "utf8");
    const restored =
      revert.ok === true &&
      restoredText.includes("version: '4.0.0'") &&
      !restoredText.includes("version: '4.0.1-test'");
    process.stdout.write(`[5] restored original version literal: ${restored}\n`);

    const allOk = okEdit && guardWorks && readWorks && restored;
    process.stdout.write(`\nRESULT: ${allOk ? "ALL OPERATIONAL CHECKS PASSED" : "FAILED"}\n`);
    process.exit(allOk ? 0 : 1);
  } finally {
    await client.close().catch(() => {});
  }
})().catch((e) => {
  process.stderr.write(`CRASH: ${e instanceof Error ? e.stack : String(e)}\n`);
  process.exit(2);
});
