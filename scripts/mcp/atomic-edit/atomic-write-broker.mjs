#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const target = process.env.ATOMIC_WRITE_TARGET;
const tmp = process.env.ATOMIC_WRITE_TMP;
if (!target || !tmp) {
  process.stderr.write("ATOMIC_WRITE_TARGET and ATOMIC_WRITE_TMP are required\n");
  process.exit(2);
}
const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const content = Buffer.concat(chunks).toString("utf8");
let fd;
try {
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  fd = fs.openSync(tmp, "w");
  fs.writeSync(fd, content);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fd = undefined;
  const mode = process.env.ATOMIC_WRITE_MODE;
  if (mode) fs.chmodSync(tmp, Number(mode));
  fs.renameSync(tmp, target);
} catch (error) {
  if (fd !== undefined) {
    try { fs.closeSync(fd); } catch {}
  }
  try { fs.unlinkSync(tmp); } catch {}
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
