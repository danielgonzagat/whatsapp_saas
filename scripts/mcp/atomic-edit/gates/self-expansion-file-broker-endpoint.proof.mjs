#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-self.ts'), 'utf8');
const results = [];
function record(name, ok, detail = {}) { results.push({ name, ok: Boolean(ok), detail }); }

record('self-expansion broker endpoint parser accepts file URL endpoints', source.includes("import { fileURLToPath } from 'node:url';") && source.includes('function brokerEndpointPath(endpoint: string): string | null') && source.includes("value.startsWith('file://')") && source.includes('fileURLToPath(value)') && source.includes("path.join(dir, 'requests')") && source.includes("path.join(dir, 'responses')"), { hasUrlImport: source.includes("import { fileURLToPath } from 'node:url';"), hasParser: source.includes('function brokerEndpointPath(endpoint: string): string | null'), handlesFileUrl: source.includes("value.startsWith('file://')") });
record('self-expansion broker discovery uses the shared endpoint parser for env and state', source.includes("const explicit = brokerEndpointPath(process.env.ATOMIC_EXEC_BROKER_SOCKET ?? '')") && source.includes('brokerEndpointPath(state.socket)'), { envUsesParser: source.includes("const explicit = brokerEndpointPath(process.env.ATOMIC_EXEC_BROKER_SOCKET ?? '')"), stateUsesParser: source.includes('brokerEndpointPath(state.socket)') });
const ok = results.every((entry) => entry.ok);
if (jsonMode || !ok) console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);