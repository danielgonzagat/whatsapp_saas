import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { check, sha } from "./smoke-state.js";
interface PartBCtx { client: any; fixtureAbs: string; fixtureRel: string; repoRoot: string; }

export async function partBRenameProp(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    const rpkRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-rpk.${process.pid}.ts`);
    const rpkAbs = path.join(repoRoot, rpkRel);
    fs.writeFileSync(
      rpkAbs,
      "export const config = {\n  phone: '5511999999999',\n  timeout: 5000,\n};\n",
    );
    try {
      const rpkRes = (await client.callTool({
        name: 'atomic_rename_property_key',
        arguments: { file: rpkRel, property: 'phone', newKey: 'whatsappPhoneId' },
      })) as { content: { text: string }[]; isError?: boolean };
      const rpkBody = JSON.parse(rpkRes.content.at(-1)?.text ?? '{}');
      check(
        'live rename_property_key ok + changed',
        rpkRes.isError !== true && rpkBody.ok === true && rpkBody.changed === true,
        rpkRes.content[0]?.text ?? '',
      );
      const rpkAfter = fs.readFileSync(rpkAbs, 'utf8');
      check(
        'live rename_property_key renames key and preserves value',
        rpkAfter.includes('whatsappPhoneId') &&
          rpkAfter.includes("'5511999999999'") &&
          !rpkAfter.includes('phone:'),
        rpkAfter,
      );
    } finally {
      if (fs.existsSync(rpkAbs)) fs.unlinkSync(rpkAbs);
    }

    const rpkAmbiguousRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-rpk-ambiguous.${process.pid}.ts`,
    );
    const rpkAmbiguousAbs = path.join(repoRoot, rpkAmbiguousRel);
    fs.writeFileSync(rpkAmbiguousAbs, 'const a = { k: 1 };\nconst b = { k: 2 };\n');
    try {
      const rpkAmbiguous = (await client.callTool({
        name: 'atomic_rename_property_key',
        arguments: { file: rpkAmbiguousRel, property: 'k', newKey: 'key' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'live rename_property_key refuses ambiguity',
        rpkAmbiguous.isError === true &&
          /matched 2 assignments/.test(rpkAmbiguous.content[0]?.text ?? ''),
        rpkAmbiguous.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(rpkAmbiguousAbs)) fs.unlinkSync(rpkAmbiguousAbs);
    }

    // live add_await_to_call: wraps call in async function preserving call text
    const awaitRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-await.${process.pid}.ts`);
    const awaitAbs = path.join(repoRoot, awaitRel);
    fs.writeFileSync(
      awaitAbs,
      ['async function build() {', '  const ok = compute(1, 2);', '  return ok;', '}', ''].join(
        '\n',
      ),
    );
    try {
      const awaitRes = (await client.callTool({
        name: 'atomic_add_await_to_call',
        arguments: { file: awaitRel, callee: 'compute', selector: 'build' },
      })) as { content: { text: string }[]; isError?: boolean };
      const awaitBody = JSON.parse(awaitRes.content.at(-1)?.text ?? '{}');
      check(
        'live add_await_to_call wraps call with await',
        awaitRes.isError !== true && awaitBody.ok === true && awaitBody.changed === true,
        awaitRes.content[0]?.text ?? '',
      );
      const awaitAfter = fs.readFileSync(awaitAbs, 'utf8');
      check(
        'live add_await_to_call preserves call text',
        awaitAfter.includes('await compute(1, 2)') && awaitAfter.includes('async function build'),
        awaitAfter,
      );
    } finally {
      if (fs.existsSync(awaitAbs)) fs.unlinkSync(awaitAbs);
    }
}
