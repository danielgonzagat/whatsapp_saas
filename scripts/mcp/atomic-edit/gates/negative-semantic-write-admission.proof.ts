import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ToolResult {
  content: { text: string }[];
  isError?: boolean;
}

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed += 1;
    process.stdout.write('PASS ' + name + '\n');
    return;
  }
  failed += 1;
  process.stderr.write('FAIL ' + name + (detail ? ': ' + detail : '') + '\n');
}

function parse(result: ToolResult): Record<string, unknown> {
  const text = result.content.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function main(): Promise<void> {
  const sourceDir = process.cwd();
  const repoRoot = path.resolve(sourceDir, '..', '..', '..');
  const fixtureRel = path.join('scripts', 'mcp', '.negative-semantic-write-' + process.pid);
  const fixtureAbs = path.join(repoRoot, fixtureRel);
  fs.mkdirSync(fixtureAbs, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureAbs, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true } }, null, 2),
  );

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(sourceDir, 'server.ts')],
    cwd: repoRoot,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'negative-semantic-write-proof', version: '1.0.0' });

  async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    return (await client.callTool({ name, arguments: args })) as ToolResult;
  }

  try {
    await client.connect(transport);

    const propRel = path.join(fixtureRel, 'semantic-property.ts');
    const propAbs = path.join(repoRoot, propRel);
    fs.writeFileSync(propAbs, 'export const config = { stale: "ABCDE" };\n');
    const noProofProp = await call('atomic_replace_property_value', {
      file: propRel,
      property: 'stale',
      value: '"Z"',
    });
    check('direct semantic replacement without proof is refused', noProofProp.isError === true, JSON.stringify(noProofProp.content));
    check('direct semantic replacement refusal leaves bytes unchanged', fs.readFileSync(propAbs, 'utf8').includes('"ABCDE"'));
    const proofProp = await call('atomic_replace_property_value', {
      file: propRel,
      property: 'stale',
      value: '"Z"',
      proofOfIncorrectness: 'fixture stale ABCDE value is intentionally incorrect negative bytes',
    });
    const proofPropBody = parse(proofProp);
    check('direct semantic replacement with proof is accepted', proofProp.isError !== true && proofPropBody.ok === true && proofPropBody.changed === true, JSON.stringify(proofPropBody));
    check('direct semantic replacement with proof writes intended bytes', fs.readFileSync(propAbs, 'utf8').includes('stale: "Z"'));
    check('direct semantic replacement returns negative proof receipt', typeof proofPropBody.negativeActionProof === 'object', JSON.stringify(proofPropBody));

    const unifiedRel = path.join(fixtureRel, 'unified-property.ts');
    const unifiedAbs = path.join(repoRoot, unifiedRel);
    fs.writeFileSync(unifiedAbs, 'export const config = { stale: "ABCDE" };\n');
    const noProofUnified = await call('atomic_edit', {
      op: 'replace_property_value',
      file: unifiedRel,
      property: 'stale',
      value: '"Z"',
    });
    check('unified semantic replacement without proof is refused', noProofUnified.isError === true, JSON.stringify(noProofUnified.content));
    check('unified semantic replacement refusal leaves bytes unchanged', fs.readFileSync(unifiedAbs, 'utf8').includes('"ABCDE"'));

    const renameRel = path.join(fixtureRel, 'rename-symbol.ts');
    const renameAbs = path.join(repoRoot, renameRel);
    fs.writeFileSync(renameAbs, 'let longName = 1;\nlongName += 1;\n');
    const noProofRename = await call('atomic_rename_symbol', {
      file: renameRel,
      line: 1,
      column: 5,
      newName: 'x',
    });
    check('writeWithTrace rename without proof is refused', noProofRename.isError === true, JSON.stringify(noProofRename.content));
    check('writeWithTrace rename refusal leaves bytes unchanged', fs.readFileSync(renameAbs, 'utf8').includes('longName'));
    const proofRename = await call('atomic_rename_symbol', {
      file: renameRel,
      line: 1,
      column: 5,
      newName: 'x',
      proofOfIncorrectness: 'fixture longName symbol is intentionally obsolete negative bytes',
    });
    const proofRenameBody = parse(proofRename);
    check('writeWithTrace rename with proof is accepted', proofRename.isError !== true && proofRenameBody.ok === true && proofRenameBody.changed === true, JSON.stringify(proofRenameBody));
    check('writeWithTrace rename with proof writes intended bytes', fs.readFileSync(renameAbs, 'utf8').includes('let x = 1'));
    check('writeWithTrace rename returns negative proof receipt', typeof proofRenameBody.negativeActionProof === 'object', JSON.stringify(proofRenameBody));
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
    fs.rmSync(fixtureAbs, { recursive: true, force: true });
  }

  process.stdout.write('\nnegative semantic/writeWithTrace admission: ' + passed + ' passed, ' + failed + ' failed\n');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(2);
});
