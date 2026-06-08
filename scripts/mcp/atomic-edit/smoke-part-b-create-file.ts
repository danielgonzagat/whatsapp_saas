import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { check, jsonBody, type PartBCtx } from "./smoke-state.js";


export async function partBCreateFile(ctx: PartBCtx): Promise<void> {
  const { client, fixtureAbs, fixtureRel, repoRoot } = ctx;
    const createBaseRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-create-base.${process.pid}`,
    );
    const createRel = path.join(createBaseRel, 'nested', `file.${process.pid}.ts`);
    const createAbs = path.join(repoRoot, createRel);

    try {
      // Preview of missing file — must NOT create file or parent directory
      const createPrev = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: createRel,
          content: 'export const CREATED = 1;\n',
          preview: true,
        },
      })) as { content: { text: string }[] };
      const createPrevBody = jsonBody(createPrev);
      check(
        'create_file preview does not create file',
        createPrevBody.ok === true &&
          createPrevBody.preview === true &&
          createPrevBody.changed === false &&
          !fs.existsSync(createAbs),
        createPrev.content[0]?.text ?? '',
      );
      check(
        'create_file preview does not create parent directory',
        !fs.existsSync(path.join(repoRoot, createBaseRel)),
        createBaseRel,
      );
      const createPrevTracePath =
        typeof createPrevBody.tracePath === 'string'
          ? path.join(repoRoot, createPrevBody.tracePath)
          : '';
      const createPrevTrace =
        createPrevTracePath && fs.existsSync(createPrevTracePath)
          ? JSON.parse(fs.readFileSync(createPrevTracePath, 'utf8'))
          : {};
      check(
        'create_file preview trace is honest',
        createPrevTrace.operation === 'atomic_create_file' &&
          createPrevTrace.preview === true &&
          createPrevTrace.changed === false,
        JSON.stringify(createPrevTrace),
      );

      // Commit — creates parent directories, writes file
      const createCommit = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: createRel,
          content: 'export const CREATED = 1;\n',
        },
      })) as { content: { text: string }[] };
      const createCommitBody = jsonBody(createCommit);
      check(
        'create_file commit creates file',
        createCommitBody.ok === true &&
          createCommitBody.changed === true &&
          createCommitBody.created === true &&
          String(createCommit.content[0]?.text ?? '').includes('Created') &&
          fs.existsSync(createAbs),
        createCommit.content[0]?.text ?? '',
      );
      check(
        'create_file commit created parent directories',
        fs.existsSync(path.join(repoRoot, createBaseRel)),
        createBaseRel,
      );
      check(
        'create_file commit wrote correct content',
        fs.readFileSync(createAbs, 'utf8') === 'export const CREATED = 1;\n',
        fs.readFileSync(createAbs, 'utf8'),
      );
      const createCommitTracePath =
        typeof createCommitBody.tracePath === 'string'
          ? path.join(repoRoot, createCommitBody.tracePath)
          : '';
      const createCommitTrace =
        createCommitTracePath && fs.existsSync(createCommitTracePath)
          ? JSON.parse(fs.readFileSync(createCommitTracePath, 'utf8'))
          : {};
      check(
        'create_file commit trace has complete topology',
        createCommitTrace.operation === 'atomic_create_file' &&
          Array.isArray(createCommitTrace.preservedZones) &&
          createCommitTrace.preservedZones.length > 0 &&
          Array.isArray(createCommitTrace.modifiedZones) &&
          createCommitTrace.modifiedZones.length > 0,
        JSON.stringify(createCommitTrace),
      );

      // Existing non-empty file refused
      const createNonEmpty = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: createRel,
          content: 'export const REPLACE = 2;\n',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'create_file refuses existing non-empty file',
        createNonEmpty.isError === true &&
          /already exists.*non-empty/i.test(createNonEmpty.content[0]?.text ?? ''),
        createNonEmpty.content[0]?.text ?? '',
      );
      check(
        'create_file non-empty refusal preserved original content',
        fs.readFileSync(createAbs, 'utf8') === 'export const CREATED = 1;\n',
        fs.readFileSync(createAbs, 'utf8'),
      );

      // Existing empty file — fill with content
      const emptyRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-create-empty.${process.pid}.ts`,
      );
      const emptyAbs = path.join(repoRoot, emptyRel);
      fs.writeFileSync(emptyAbs, '');
      try {
        const fillEmpty = (await client.callTool({
          name: 'atomic_create_file',
          arguments: {
            file: emptyRel,
            content: 'export const FILLED = 42;\n',
          },
        })) as { content: { text: string }[] };
        const fillEmptyBody = jsonBody(fillEmpty);
        check(
          'create_file fills existing empty file',
          fillEmptyBody.ok === true &&
            fillEmptyBody.changed === true &&
            fillEmptyBody.created === false,
          fillEmpty.content[0]?.text ?? '',
        );
        check(
          'create_file empty fill wrote content',
          fs.readFileSync(emptyAbs, 'utf8') === 'export const FILLED = 42;\n',
          fs.readFileSync(emptyAbs, 'utf8'),
        );

        // Stale sha refusal on existing empty file
        fs.writeFileSync(emptyAbs, '');
        const shaHelper = (v: string | Buffer) =>
          crypto.createHash('sha256').update(v).digest('hex');
        const staleShaEmpty = (await client.callTool({
          name: 'atomic_create_file',
          arguments: {
            file: emptyRel,
            content: 'export const Y = 1;\n',
            expectedSha256: 'deadbeef',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'create_file refuses stale sha on existing empty file',
          staleShaEmpty.isError === true &&
            /sha256 mismatch/.test(staleShaEmpty.content[0]?.text ?? ''),
          staleShaEmpty.content[0]?.text ?? '',
        );

        // Correct sha on empty file allows fill
        const correctShaEmpty = (await client.callTool({
          name: 'atomic_create_file',
          arguments: {
            file: emptyRel,
            content: 'export const OK = 99;\n',
            expectedSha256: shaHelper(''),
          },
        })) as { content: { text: string }[] };
        const correctShaBody = jsonBody(correctShaEmpty);
        check(
          'create_file correct sha on empty file succeeds',
          correctShaBody.ok === true && correctShaBody.changed === true,
          correctShaEmpty.content[0]?.text ?? '',
        );
        check(
          'create_file correct sha wrote expected content',
          fs.readFileSync(emptyAbs, 'utf8') === 'export const OK = 99;\n',
          fs.readFileSync(emptyAbs, 'utf8'),
        );
      } finally {
        if (fs.existsSync(emptyAbs)) fs.unlinkSync(emptyAbs);
      }

      // Protected path refusal
      const createProtected = (await client.callTool({
        name: 'atomic_create_file',
        arguments: { file: 'CLAUDE.md', content: 'x\n' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'create_file refuses governance-protected path',
        createProtected.isError === true &&
          /governance-protected/.test(createProtected.content[0]?.text ?? ''),
        createProtected.content[0]?.text ?? '',
      );

      // Multi-line .mjs content create (AB10 source-file creation case)
      const mjsRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-create-mjs.${process.pid}.mjs`,
      );
      const mjsAbs = path.join(repoRoot, mjsRel);
      const mjsContent = [
        '#!/usr/bin/env node',
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        '',
        'function main(args) {',
        "  const file = resolve(args[0] ?? '.');",
        '  return readFileSync(file, "utf8");',
        '}',
        '',
        'console.log(main(process.argv.slice(2)));',
        '',
      ].join('\n');
      try {
        const mjsCreate = (await client.callTool({
          name: 'atomic_create_file',
          arguments: { file: mjsRel, content: mjsContent },
        })) as { content: { text: string }[] };
        const mjsBody = jsonBody(mjsCreate);
        check(
          'create_file multi-line .mjs source file',
          mjsBody.ok === true && mjsBody.changed === true && mjsBody.created === true,
          mjsCreate.content[0]?.text ?? '',
        );
        check(
          'create_file .mjs content written correctly',
          fs.existsSync(mjsAbs) && fs.readFileSync(mjsAbs, 'utf8') === mjsContent,
          fs.existsSync(mjsAbs) ? fs.readFileSync(mjsAbs, 'utf8') : 'missing',
        );
      } finally {
        if (fs.existsSync(mjsAbs)) fs.unlinkSync(mjsAbs);
      }
    } finally {
      if (fs.existsSync(createAbs)) fs.unlinkSync(createAbs);
      const nestedDir = path.dirname(createAbs);
      if (fs.existsSync(nestedDir)) fs.rmdirSync(nestedDir);
      const baseDir = path.join(repoRoot, createBaseRel);
      if (fs.existsSync(baseDir)) {
        const nestedAtBase = path.join(baseDir, 'nested');
        if (fs.existsSync(nestedAtBase)) fs.rmdirSync(nestedAtBase);
        fs.rmdirSync(baseDir);
      }
    }
}
