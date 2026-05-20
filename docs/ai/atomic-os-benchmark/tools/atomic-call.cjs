#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('could not find atomic-edit repo root from ' + start);
    dir = parent;
  }
}

const REPO_ROOT = process.env.ATOMIC_OS_REPO_ROOT || findRepoRoot(__dirname);
const requireFromRepo = createRequire(path.join(REPO_ROOT, 'package.json'));
const { Client } = requireFromRepo('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireFromRepo('@modelcontextprotocol/sdk/client/stdio.js');
const {
  usage, parseCliJson, normalizePathValue, normalizeToolAliases,
  normalizeWorktreeSafePaths, trimCommandOutput, optionalPositiveNumber,
} = require('./atomic-call.cli.cjs');
const {
  runValidationStep, syntheticValidationStep, isAdvisoryCheck,
  budgetValidationStep, countFileLines, runLineBudgetChecks,
  sourceChurnForPathspecs, runSourceChurnBudgetChecks, gitOutputLines,
  deriveValidationScanFiles,
} = require('./atomic-call.budget.cjs');
const { runKloelUnifiedAgentValidation } = require('./atomic-call.validate-unified.cjs');
const {
  compactOperationResult, tracePathFromOutput, worktreeRelativePath,
  safeTraceAbsPath, readTraceSummary, updateMacroTraceManifest,
  recordMacroTraceFromOutput, compactPayload, emitPayload,
} = require('./atomic-call.trace.cjs');
const {
  fileHasNamedImport, escapeRegExp, parseToolArgs, methodNameFromSelector,
  classMethodSelectors, decodeEscapedCodeText, replacementEscapesEnabled,
  dependencyInlineObjectText, replacementText, explicitThisAssignmentNames,
  normalizeOptionalDepsForExplicitAssignments, dependencyContainerEntries,
  buildDependencyGetterReplacement, dependencyContainerPropertyAnchors,
  buildDependencyConstructorPropertyReplacements, resolveAnchoredTailReplacement,
  buildGeneratedPostRemovalReplacements, normalizeMethodBodyReplacements,
  methodExtractionAdapter, classMethodToExportedFunction, fileHasExportedFunctions,
  fileContainsNone, repoRelativeFromCwd, normalizeLintFixArgs, countOccurrences,
} = require('./atomic-call.transform.cjs');
const { handleExtractClassMethodsToFile } = require('./atomic-call.extract-class-methods.cjs');
const { handleExtractSymbolsToFile } = require('./atomic-call.extract-symbols.cjs');

const PATH_KEYS = new Set(['file', 'dir', 'cwd', 'sourceFile', 'targetFile']);
const PATH_ARRAY_KEYS = new Set(['allowedPaths']);
const ARG_ALIASES = new Map([
  ['filePath', 'file'],
  ['action', 'op'],
]);




async function main() {
  const tool = process.argv[2];
  const rawArgs = process.argv[3];
  if (tool === '--help' || tool === '-h') usage(0);
  if (!tool || !rawArgs) usage();

  const client = new Client({ name: 'codex-atomic-worktree-safe-call', version: '1.1.0' });
  const transport = new StdioClientTransport({
    command: 'bash',
    args: [path.join(REPO_ROOT, 'scripts', 'mcp', 'atomic-edit-mcp-launcher.sh')],
  });

  await client.connect(transport);
  try {
    const callAtomicToolOnce = async (operationTool, operationArgs, label = operationTool) => {
      const result = await client.callTool({ name: operationTool, arguments: operationArgs });
      const rawOutput = result.content?.map((part) => part.text || '').join('\n') || '';
      if (result.isError || /\bMCP error\b/i.test(rawOutput)) {
        if (rawOutput) console.error(rawOutput);
        throw new Error(`${label} failed`);
      }
      let output = rawOutput;
      try {
        output = JSON.parse(rawOutput);
      } catch {
        // Keep non-JSON tool output intact.
      }
      const macroTracePath = recordMacroTraceFromOutput(rawOutput, output);
      return { rawOutput, output, macroTracePath };
    };
    const callAtomicTool = async (operationTool, operationArgs, label = operationTool) => {
      if (operationTool !== 'atomic_replace_text' || !Object.prototype.hasOwnProperty.call(operationArgs || {}, 'expectedCount')) {
        return callAtomicToolOnce(operationTool, operationArgs, label);
      }
      const { expectedCount, ...singleArgs } = operationArgs;
      const count = Number(expectedCount);
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`${label} expectedCount must be a non-negative integer`);
      }
      if (Object.prototype.hasOwnProperty.call(singleArgs, 'occurrence') && count !== 1) {
        throw new Error(`${label} cannot combine occurrence with expectedCount ${count}`);
      }
      if (count === 0) {
        return {
          rawOutput: JSON.stringify({ ok: true, skipped: true, reason: 'expectedCount 0' }),
          output: { ok: true, skipped: true, reason: 'expectedCount 0' },
          macroTracePath: null,
        };
      }
      if (typeof singleArgs.file !== 'string' || typeof singleArgs.oldText !== 'string') {
        throw new Error(`${label} expectedCount requires file and oldText`);
      }
      const observed = countOccurrences(fs.readFileSync(singleArgs.file, 'utf8'), singleArgs.oldText);
      if (observed !== count) {
        throw new Error(`${label} expected ${count} occurrence(s), observed ${observed}`);
      }
      if (count === 1) {
        return callAtomicToolOnce(operationTool, singleArgs, label);
      }
      if (Object.prototype.hasOwnProperty.call(singleArgs, 'expectedSha256')) {
        throw new Error(`${label} cannot use expectedSha256 with expectedCount > 1; use one guarded operation per occurrence`);
      }
      const operations = [];
      for (let index = 0; index < count; index += 1) {
        const step = await callAtomicToolOnce(
          operationTool,
          { ...singleArgs, occurrence: 1 },
          `${label} occurrence ${index + 1}/${count}`,
        );
        operations.push({
          index,
          output: step.output,
          macroTracePath: step.macroTracePath,
        });
      }
      const output = {
        ok: operations.every((operation) => operation.output?.ok !== false),
        operation: operationTool,
        expectedCount: count,
        operations,
      };
      return { rawOutput: JSON.stringify(output, null, 2), output, macroTracePath: null };
    };

    if (tool === 'validate_kloel_unified_agent') {
      const args = parseToolArgs(tool, rawArgs);
      const validation = runKloelUnifiedAgentValidation(args);
      emitPayload({
        ok: validation.ok,
        operation: 'validate_kloel_unified_agent',
        validation,
      }, args);
      if (!validation.ok) {
        throw new Error('validate_kloel_unified_agent failed');
      }
      return;
    }

    if (tool === 'extract_class_methods_to_file') {
      await handleExtractClassMethodsToFile({ rawArgs, callAtomicTool });
      return;
    }

    if (tool === 'extract_symbols_to_file') {
      await handleExtractSymbolsToFile({ rawArgs, callAtomicTool });
      return;
    }

    if (tool === 'extract_symbol_to_file') {
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      const sourceFile = args.sourceFile || args.file;
      const targetFile = args.targetFile;
      const selector = args.selector;
      const importName = args.importName || selector;
      const importModule = args.importModule || args.module;
      if (!sourceFile || !targetFile || !selector || !importName || !importModule) {
        throw new Error('extract_symbol_to_file requires sourceFile/file, targetFile, selector, importName, and importModule/module');
      }
      const read = await callAtomicTool(
        'code_read_symbol',
        { file: sourceFile, selector },
        `extract_symbol_to_file read ${selector}`,
      );
      if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
        throw new Error(`extract_symbol_to_file could not read symbol ${selector}`);
      }
      const symbolCode = read.output.code;
      const exportedCode = /^export\s/.test(symbolCode) ? symbolCode : `export ${symbolCode}`;
      const content = exportedCode.endsWith('\n') ? exportedCode : `${exportedCode}\n`;
      const create = await callAtomicTool(
        'atomic_create_file',
        { file: targetFile, content },
        `extract_symbol_to_file create ${targetFile}`,
      );
      const addImport = await callAtomicTool(
        'atomic_add_import',
        { file: sourceFile, name: importName, module: importModule },
        `extract_symbol_to_file import ${importName}`,
      );
      const remove = await callAtomicTool(
        'atomic_edit_symbol',
        { file: sourceFile, selector, op: 'remove' },
        `extract_symbol_to_file remove ${selector}`,
      );
      const compactGap = await callAtomicTool(
        'atomic_replace_text',
        { file: sourceFile, oldText: '\n\n\n/**', newText: '\n\n/**', expectedCount: 1 },
        `extract_symbol_to_file compact gap after ${selector}`,
      );
      const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
      const payload = {
        ok: !validation || validation.ok,
        operation: 'extract_symbol_to_file',
        sourceFile,
        targetFile,
        selector,
        importName,
        importModule,
        validation,
        operations: [
          { tool: 'code_read_symbol', output: read.output },
          { tool: 'atomic_create_file', output: create.output },
          { tool: 'atomic_add_import', output: addImport.output },
          { tool: 'atomic_edit_symbol', output: remove.output },
          { tool: 'atomic_replace_text', output: compactGap.output },
        ],
      };
      emitPayload(payload, args);
      if (validation && !validation.ok) {
        throw new Error('extract_symbol_to_file validation failed');
      }
      return;
    }

    if (tool === 'batch') {
      const operations = parseToolArgs(tool, rawArgs);
      if (!Array.isArray(operations)) throw new Error('batch expects a JSON array');
      const outputs = [];
      for (const [index, operation] of operations.entries()) {
        const operationTool = operation?.tool;
        const operationArgs = operation?.args ?? {};
        if (!operationTool || typeof operationTool !== 'string') throw new Error(`batch operation ${index} is missing tool`);
        if (!operationArgs || typeof operationArgs !== 'object' || Array.isArray(operationArgs)) throw new Error(`batch operation ${index} args must be an object`);
        normalizeToolAliases(operationTool, operationArgs);
        normalizeWorktreeSafePaths(operationArgs);
        const result = await callAtomicTool(operationTool, operationArgs, `atomic batch operation ${index} (${operationTool})`);
        const parsedOutput = result.output;
        const macroTracePath = result.macroTracePath;
        outputs.push({ index, tool: operationTool, output: parsedOutput, macroTracePath });
      }
      console.log(JSON.stringify({ ok: true, operations: outputs }, null, 2));
      return;
    }

    if (tool === 'replace_file_with_current_anchor') {
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      if (typeof args.file !== 'string') throw new Error('replace_file_with_current_anchor requires file');
      if (typeof args.newText !== 'string') throw new Error('replace_file_with_current_anchor requires newText');
      const oldText = fs.readFileSync(args.file, 'utf8');
      if (oldText === args.newText) {
        console.log(JSON.stringify({
          ok: true,
          operation: 'replace_file_with_current_anchor',
          changed: false,
          skipped: true,
          reason: 'already matches target text',
          file: args.file,
        }, null, 2));
        return;
      }
      const result = await callAtomicTool(
        'atomic_replace_text',
        {
          file: args.file,
          oldText,
          newText: args.newText,
          expectedCount: 1,
        },
        'replace_file_with_current_anchor',
      );
      console.log(JSON.stringify({
        ok: result.output?.ok !== false,
        operation: 'replace_file_with_current_anchor',
        file: args.file,
        output: result.output,
        macroTracePath: result.macroTracePath,
      }, null, 2));
      return;
    }

    const args = parseToolArgs(tool, rawArgs);
    normalizeToolAliases(tool, args);
    normalizeWorktreeSafePaths(args);
    const primary = await callAtomicTool(tool, args, tool);
    let layoutFix = null;
    if (tool === 'atomic_remove_import' && typeof args.file === 'string') {
      layoutFix = await callAtomicTool(
        'atomic_apply_eslint_dry_run_fixes',
        {
          cwd: 'backend',
          args: [
            repoRelativeFromCwd(args.file, 'backend'),
            '--fix-dry-run',
            '--fix-type',
            'layout',
            '--format',
            'json',
          ],
          allowedPaths: [args.file],
          applyKnownResidueFixes: false,
        },
        'atomic_remove_import layout fix',
      );
    }
    if (layoutFix) {
      console.log(JSON.stringify({ ok: true, operation: tool, output: primary.output, layoutFix: layoutFix.output }, null, 2));
    } else if (primary.rawOutput) {
      console.log(primary.rawOutput);
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
