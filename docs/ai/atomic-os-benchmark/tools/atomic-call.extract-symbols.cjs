'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  parseToolArgs,
  decodeEscapedCodeText,
  fileHasNamedImport,
  fileContainsNone,
  fileHasExportedFunctions,
  normalizeLintFixArgs,
} = require('./atomic-call.transform.cjs');
const { normalizeWorktreeSafePaths } = require('./atomic-call.cli.cjs');
const { runKloelUnifiedAgentValidation } = require('./atomic-call.validate-unified.cjs');
const { compactOperationResult, emitPayload } = require('./atomic-call.trace.cjs');

/** Handler for extract_symbols_to_file — extracted from main(). */
async function handleExtractSymbolsToFile(ctx) {
  const { rawArgs, callAtomicTool } = ctx;
  const tool = 'extract_symbols_to_file';
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      const sourceFile = args.sourceFile || args.file;
      const targetFile = args.targetFile;
      const selectors = args.selectors || args.symbols;
      const importNames = args.importNames || selectors;
      const importModule = args.importModule || args.module;
      if (!sourceFile || !targetFile || !Array.isArray(selectors) || !selectors.length || !Array.isArray(importNames) || importNames.length !== selectors.length || !importModule) {
        throw new Error('extract_symbols_to_file requires sourceFile/file, targetFile, selectors/symbols[], importNames[] and importModule/module');
      }
      const reads = [];
      const sourceReadFailures = [];
      for (const selector of selectors) {
        try {
          const read = await callAtomicTool(
            'code_read_symbol',
            { file: sourceFile, selector },
            `extract_symbols_to_file read ${selector}`,
          );
          if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
            throw new Error(`extract_symbols_to_file could not read symbol ${selector}`);
          }
          reads.push({ selector, read });
        } catch (error) {
          sourceReadFailures.push({ selector, error: error.message });
        }
      }
      if (sourceReadFailures.length) {
        const targetReads = [];
        let targetHasAllSymbols = fs.existsSync(targetFile);
        if (targetHasAllSymbols) {
          for (const selector of selectors) {
            try {
              const read = await callAtomicTool(
                'code_read_symbol',
                { file: targetFile, selector },
                `extract_symbols_to_file idempotent read ${selector}`,
              );
              if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
                throw new Error(`extract_symbols_to_file could not read target symbol ${selector}`);
              }
              targetReads.push({ selector, read });
            } catch (error) {
              targetHasAllSymbols = false;
              targetReads.push({ selector, error: error.message });
              break;
            }
          }
        }
        const sourceAlreadyImports = fileHasNamedImport(sourceFile, importNames, importModule);
        if (sourceReadFailures.length === selectors.length && targetHasAllSymbols && sourceAlreadyImports) {
          const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
          const payload = {
            ok: !validation || validation.ok,
            operation: 'extract_symbols_to_file',
            idempotent: true,
            sourceFile,
            targetFile,
            selectors,
            importNames,
            importModule,
            validation,
            operations: [
              ...targetReads.map(({ selector, read }) => ({ tool: 'code_read_symbol', file: targetFile, selector, output: read.output })),
              { tool: 'idempotent_state_check', output: { sourceReadFailures, sourceAlreadyImports } },
            ],
          };
          emitPayload(payload, args);
          if (validation && !validation.ok) {
            throw new Error('extract_symbols_to_file validation failed');
          }
          return;
        }
        throw new Error(`extract_symbols_to_file source read failed before a complete idempotent state: ${sourceReadFailures.map((failure) => failure.selector + ': ' + failure.error).join('; ')}`);
      }
      const existingTarget = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
      const symbolsToWrite = reads.filter((entry, index) => {
        const importName = importNames[index];
        if (!existingTarget) return true;
        return !new RegExp('export\\s+(?:async\\s+)?function\\s+' + escapeRegExp(importName) + '\\s*\\(').test(existingTarget);
      });
      const content = `${symbolsToWrite
        .map(({ read }) => {
          const symbolCode = read.output.code;
          return /^export\s/.test(symbolCode) ? symbolCode : `export ${symbolCode}`;
        })
        .join('\n\n')}\n`;
      let create = null;
      if (!existingTarget) {
        create = await callAtomicTool(
          'atomic_create_file',
          { file: targetFile, content },
          `extract_symbols_to_file create ${targetFile}`,
        );
      } else if (symbolsToWrite.length > 0) {
        const targetLines = existingTarget.split('\n');
        create = await callAtomicTool(
          'atomic_insert_at',
          {
            file: targetFile,
            line: targetLines.length,
            column: targetLines[targetLines.length - 1].length + 1,
            text: (existingTarget.endsWith('\n') ? '\n' : '\n\n') + content,
          },
          `extract_symbols_to_file append ${targetFile}`,
        );
      } else {
        create = { output: { skipped: true, reason: 'target already contains requested symbols' } };
      }
      const importOps = [];
      for (const importName of importNames) {
        importOps.push(await callAtomicTool(
          'atomic_add_import',
          { file: sourceFile, name: importName, module: importModule },
          `extract_symbols_to_file import ${importName}`,
        ));
      }
      const removeOps = [];
      for (const selector of selectors) {
        removeOps.push(await callAtomicTool(
          'atomic_edit_symbol',
          { file: sourceFile, selector, op: 'remove' },
          `extract_symbols_to_file remove ${selector}`,
        ));
      }
      let compactGap = null;
      try {
        compactGap = await callAtomicTool(
          'atomic_replace_text',
          { file: sourceFile, oldText: '\n\n\n/**', newText: '\n\n/**', expectedCount: 1 },
          'extract_symbols_to_file compact doc gap',
        );
      } catch (error) {
        compactGap = { skipped: true, reason: error.message };
      }
      let compactConstGap = null;
      try {
        compactConstGap = await callAtomicTool(
          'atomic_replace_text',
          { file: sourceFile, oldText: '\n\n\nconst ', newText: '\n\nconst ', expectedCount: 1 },
          'extract_symbols_to_file compact const gap',
        );
      } catch (error) {
        compactConstGap = { skipped: true, reason: error.message };
      }
      const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
      const payload = {
        ok: !validation || validation.ok,
        operation: 'extract_symbols_to_file',
        sourceFile,
        targetFile,
        selectors,
        importNames,
        importModule,
        validation,
        operations: [
          ...reads.map(({ selector, read }) => ({ tool: 'code_read_symbol', selector, output: read.output })),
          { tool: create.output?.skipped ? 'target_state_check' : (existingTarget ? 'atomic_insert_at' : 'atomic_create_file'), output: create.output },
          ...importOps.map((op, index) => ({ tool: 'atomic_add_import', importName: importNames[index], output: op.output })),
          ...removeOps.map((op, index) => ({ tool: 'atomic_edit_symbol', selector: selectors[index], output: op.output })),
          { tool: 'atomic_replace_text', output: compactGap.output || compactGap },
          { tool: 'atomic_replace_text', output: compactConstGap.output || compactConstGap },
        ],
      };
      emitPayload(payload, args);
      if (validation && !validation.ok) {
        throw new Error('extract_symbols_to_file validation failed');
      }
      return;
}

module.exports = { handleExtractSymbolsToFile };
