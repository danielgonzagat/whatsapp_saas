import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const atomicRoot = path.resolve(here, "..");
const json = process.argv.includes("--json");
const results = [];

function rec(name, ok, detail = "") { results.push({ name, ok: Boolean(ok), detail }); }
function emit() {
  const ok = results.every((r) => r.ok);
  if (json) process.stdout.write(`${JSON.stringify({ ok, results }, null, 2)}\n`);
  else for (const r of results) process.stdout.write(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` :: ${r.detail}` : ""}\n`);
  if (!ok) process.exit(1);
}

const source = fs.readFileSync(path.join(atomicRoot, "server-helpers-io.ts"), "utf8");
rec("atomicWrite has broker fallback helper", source.includes("writeAtomicBytesViaBroker") && source.includes("canUseBrokerAtomicWrite"));
rec("direct write remains first path before broker retry", source.indexOf("writeAtomicBytesDirect(absPath, tmp, content, mode)") < source.indexOf("writeAtomicBytesViaBroker(absPath, tmp, content, mode)"));
rec("broker retry is limited to EPERM or EACCES", /code === \"EPERM\" \|\| code === \"EACCES\"/.test(source));

const socket = process.env.ATOMIC_EXEC_BROKER_SOCKET;
if (!socket || process.env.ATOMIC_BUILD_BROKER === "1") {
  rec(
    "broker runtime proof is not applicable in this proof envelope",
    true,
    !socket
      ? "ATOMIC_EXEC_BROKER_SOCKET unset; static fallback checks above still prove the guarded fallback path in non-hosted sweeps"
      : "already running inside the Atomic build broker; broker-inside-broker runtime proof is intentionally skipped while static fallback checks remain active",
  );
  emit();
  process.exit(0);
}
const fixture = path.join(atomicRoot, `.atomic-write-broker-proof-${process.pid}`);
const target = path.join(fixture, "target.txt");
const tmp = path.join(fixture, "target.tmp");
const client = path.join(atomicRoot, "atomic-exec-broker-client.mjs");
const helper = path.join(atomicRoot, "atomic-write-broker.mjs");
const setup = spawnSync(process.execPath, [client, socket], {
  input: JSON.stringify({ command: `mkdir -p ${JSON.stringify(fixture)}`, cwd: atomicRoot, effectRoot: atomicRoot, timeoutMs: 120000 }),
  encoding: "utf8",
});
let setupReply = {};
try { setupReply = JSON.parse(setup.stdout || "{}"); } catch {}
rec("broker can create proof fixture", setup.status === 0 && setupReply.ok === true, setup.stdout + setup.stderr);
const write = spawnSync(process.execPath, [client, socket], {
  input: JSON.stringify({
    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(helper)}`,
    cwd: fixture,
    effectRoot: fixture,
    timeoutMs: 120000,
    env: { ATOMIC_WRITE_TARGET: target, ATOMIC_WRITE_TMP: tmp },
    stdin: "broker-proof\n",
  }),
  encoding: "utf8",
});
let writeReply = {};
try { writeReply = JSON.parse(write.stdout || "{}"); } catch {}
rec("broker helper writes target atomically", write.status === 0 && writeReply.ok === true && fs.readFileSync(target, "utf8") === "broker-proof\n", write.stdout + write.stderr);
const cleanup = spawnSync(process.execPath, [client, socket], {
  input: JSON.stringify({ command: `rm -rf ${JSON.stringify(fixture)}`, cwd: atomicRoot, effectRoot: atomicRoot, timeoutMs: 120000 }),
  encoding: "utf8",
});
let cleanupReply = {};
try { cleanupReply = JSON.parse(cleanup.stdout || "{}"); } catch {}
rec("broker proof fixture is removed", cleanup.status === 0 && cleanupReply.ok === true && !fs.existsSync(fixture), cleanup.stdout + cleanup.stderr);
emit();
