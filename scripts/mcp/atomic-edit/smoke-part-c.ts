import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outline, readSymbol } from './nav.js';
import { editSymbol, renameSymbolCrossFile, previewDiff } from './advanced.js';
import { check } from './smoke-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_DIR = path.basename(__dirname) === 'dist' ? path.dirname(__dirname) : __dirname;

export async function partC(): Promise<void> {
  process.stdout.write('Part C — v2 read-side + symbol edits + cross-file rename\n');

  const SRC = [
    'export class UserService {',
    '  async load(id: string) {',
    '    return this.repo.find(id);',
    '  }',
    '}',
    'export function helper(x: number) {',
    '  return x * 2;',
    '}',
    '',
  ].join('\n');

  // outline
  {
    const o = await outline('svc.ts', SRC);
    const sels = o.symbols.map((s) => s.selector);
    check(
      'outline lists scoped symbols',
      sels.includes('UserService') && sels.includes('UserService.load') && sels.includes('helper'),
      sels.join(','),
    );
    check('outline omits fullText', !('fullText' in o), JSON.stringify(o));
  }

  // read_symbol scoped
  {
    const r = await readSymbol('svc.ts', SRC, 'UserService.load');
    check('read_symbol returns the method', r.code.includes('async load(id: string)'), r.code);
    check(
      'read_symbol gives a range',
      r.startLine === 2 && r.endLine === 4,
      `${r.startLine}-${r.endLine}`,
    );
  }

  // read_symbol local fixture declaration inside callback scope
  {
    const localFixtureSrc = [
      "describe('buildHeuristicCatalogScore', () => {",
      '  const emptyDemographics = {',
      "    gender: 'UNKNOWN',",
      "    ageRange: 'UNKNOWN',",
      "    location: 'UNKNOWN',",
      '    confidence: 0,',
      '  };',
      '',
      "  it('handles empty messages', () => emptyDemographics);",
      '});',
      '',
    ].join('\n');
    const r = await readSymbol('opportunity.spec.ts', localFixtureSrc, 'emptyDemographics');
    check(
      'read_symbol resolves local fixture const',
      r.kind === 'VariableDeclaration' && r.code.includes('confidence: 0'),
      r.code,
    );
  }

  // edit_symbol replace
  {
    const r = await editSymbol(
      'svc.ts',
      SRC,
      'helper',
      'replace',
      'export function helper(x: number) {\n  return x * 3;\n}',
    );
    check(
      'edit_symbol replace ok',
      r.validation.ok && r.newText.includes('x * 3'),
      JSON.stringify(r.validation),
    );
    check('edit_symbol replace kept class', r.newText.includes('class UserService'));
  }

  // edit_symbol insert_after
  {
    const r = await editSymbol(
      'svc.ts',
      SRC,
      'helper',
      'insert_after',
      'export const VERSION = 1;',
    );
    check(
      'edit_symbol insert_after ok',
      r.validation.ok &&
        r.newText.includes('export const VERSION = 1;') &&
        r.newText.includes('function helper'),
      JSON.stringify(r.validation),
    );
  }

  // edit_symbol remove
  {
    const r = await editSymbol('svc.ts', SRC, 'helper', 'remove');
    check(
      'edit_symbol remove ok',
      r.validation.ok &&
        !r.newText.includes('function helper') &&
        r.newText.includes('class UserService'),
      r.newText,
    );
  }

  // edit_symbol remove variable declaration
  {
    const fixture = [
      'const mailEnvBackup = {',
      '  MAIL_HOST: process.env.MAIL_HOST,',
      '};',
      '',
      'function setMailEnv() {',
      "  process.env.MAIL_HOST = 'smtp.example.com';",
      '}',
      '',
    ].join('\n');
    const r = await editSymbol('fixture.spec.ts', fixture, 'mailEnvBackup', 'remove');
    check(
      'edit_symbol remove variable declaration ok',
      r.validation.ok &&
        !r.newText.includes('mailEnvBackup') &&
        !r.newText.includes('const ;') &&
        r.newText.includes('function setMailEnv'),
      r.newText,
    );
  }

  // edit_symbol rejects syntax-breaking replacement
  {
    const r = await editSymbol('svc.ts', SRC, 'helper', 'replace', 'export function helper( {');
    check(
      'edit_symbol rejects broken code',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }

  // previewDiff
  {
    const d = previewDiff('a\nb\nc\n', 'a\nB\nc\n', 'x.ts');
    check('previewDiff marks change', d.includes('- b') && d.includes('+ B'), d);
  }

  // cross-file rename via real tsconfig on disk
  {
    const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
    const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-xf.${process.pid}`);
    const tmpAbs = path.join(repoRoot, tmpRel);
    fs.mkdirSync(tmpAbs, { recursive: true });
    try {
      fs.writeFileSync(
        path.join(tmpAbs, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: false, noEmit: true }, include: ['*.ts'] }),
      );
      fs.writeFileSync(
        path.join(tmpAbs, 'a.ts'),
        'export function compute(seed: number) { return seed + 1; }\n',
      );
      fs.writeFileSync(
        path.join(tmpAbs, 'b.ts'),
        'import { compute } from "./a";\nexport const r = compute(41);\n',
      );
      const r = await renameSymbolCrossFile(
        path.join(tmpAbs, 'a.ts'),
        repoRoot,
        1,
        17, // identifier "compute"
        'calculate',
      );
      const files = [...r.changes.keys()].map((f) => path.basename(f)).sort();
      check(
        'cross-file rename touches both files',
        files.length === 2 && r.totalReferences >= 2,
        `files=${files.join(',')} refs=${r.totalReferences}`,
      );
      check(
        'cross-file rename content correct',
        [...r.changes.values()].every((c) => c.includes('calculate') && !/\bcompute\b/.test(c)),
        JSON.stringify([...r.changes.values()]),
      );
      check(
        'cross-file rename validations all ok',
        r.validations.every((v) => v.ok),
      );
    } finally {
      fs.rmSync(tmpAbs, { recursive: true, force: true });
    }
  }
}

