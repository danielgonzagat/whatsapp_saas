#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dir, "..", "..", "..");

function runNode(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.signal) {
    process.stderr.write(`atomic-edit smoke interrupted by signal ${result.signal}\n`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runNode(path.join(dir, "build.mjs"));
runNode(path.join(dir, "dist", "smoke.js"));
