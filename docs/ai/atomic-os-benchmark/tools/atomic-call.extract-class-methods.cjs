'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  fileHasNamedImport,
  parseToolArgs,
  classMethodSelectors,
  decodeEscapedCodeText,
  replacementText,
  explicitThisAssignmentNames,
  normalizeOptionalDepsForExplicitAssignments,
  dependencyContainerEntries,
  buildDependencyGetterReplacement,
  buildDependencyConstructorPropertyReplacements,
  resolveAnchoredTailReplacement,
  buildGeneratedPostRemovalReplacements,
  normalizeMethodBodyReplacements,
  methodExtractionAdapter,
  classMethodToExportedFunction,
  fileHasExportedFunctions,
  fileContainsNone,
  normalizeLintFixArgs,
} = require('./atomic-call.transform.cjs');
const { normalizeWorktreeSafePaths } = require('./atomic-call.cli.cjs');
const { runKloelUnifiedAgentValidation } = require('./atomic-call.validate-unified.cjs');
const { compactOperationResult, emitPayload } = require('./atomic-call.trace.cjs');

/** Handler for extract_class_methods_to_file — extracted from main(). */
async function handleExtractClassMethodsToFile(ctx) {
  const { rawArgs, callAtomicTool } = ctx;
  const tool = 'extract_class_methods_to_file';
      const args = parseToolArgs(tool, rawArgs);
      normalizeWorktreeSafePaths(args);
      const sourceFile = args.sourceFile || args.file;
      const targetFile = args.targetFile;
      const methodInputs = args.methods || args.selectors || args.symbols;
      const selectors = Array.isArray(methodInputs) ? classMethodSelectors(args.className, methodInputs) : [];
      const functionNames = args.functionNames || args.importNames || selectors.map(methodNameFromSelector);
      const sourceImportNames =
        args.sourceImportNames || args.serviceImportNames || args.callsiteImportNames || functionNames;
      const importModule = args.importModule || args.module;
      if (!sourceFile || !targetFile || !selectors.length || !Array.isArray(functionNames) || functionNames.length !== selectors.length || !importModule) {
        throw new Error('extract_class_methods_to_file requires sourceFile/file, targetFile, className+methods[] or selectors[], functionNames/importNames[] and importModule/module');
      }
      if (!Array.isArray(sourceImportNames)) {
        throw new Error('extract_class_methods_to_file sourceImportNames/serviceImportNames must be an array when provided');
      }
      const reads = [];
      const sourceReadFailures = [];
      for (const [index, selector] of selectors.entries()) {
        try {
          const read = await callAtomicTool(
            'code_read_symbol',
            { file: sourceFile, selector },
            'extract_class_methods_to_file read ' + selector,
          );
          if (!read.output || typeof read.output !== 'object' || typeof read.output.code !== 'string') {
            throw new Error('extract_class_methods_to_file could not read method ' + selector);
          }
          reads.push({ selector, name: functionNames[index], read });
        } catch (error) {
          sourceReadFailures.push({ selector, error: error.message });
        }
      }
      if (sourceReadFailures.length) {
        const oldCallTexts = functionNames.map((name) => 'this.' + name + '(');
        const targetHasAllFunctions = fileHasExportedFunctions(targetFile, functionNames);
        const sourceAlreadyImports = fileHasNamedImport(sourceFile, sourceImportNames, importModule);
        const sourceCallsitesConverted = fileContainsNone(sourceFile, oldCallTexts);
        if (sourceReadFailures.length === selectors.length && targetHasAllFunctions && sourceAlreadyImports && sourceCallsitesConverted) {
          const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
          const payload = {
            ok: !validation || validation.ok,
            operation: 'extract_class_methods_to_file',
            idempotent: true,
            sourceFile,
            targetFile,
            selectors,
            functionNames,
            sourceImportNames,
            importModule,
            validation,
            operations: [
              { tool: 'idempotent_state_check', output: { sourceReadFailures, targetHasAllFunctions, sourceAlreadyImports, sourceCallsitesConverted } },
            ],
          };
          emitPayload(payload, args);
          if (validation && !validation.ok) {
            throw new Error('extract_class_methods_to_file validation failed');
          }
          return;
        }
        throw new Error('extract_class_methods_to_file source read failed before a complete idempotent state: ' + sourceReadFailures.map((failure) => failure.selector + ': ' + failure.error).join('; '));
      }
      const postRemovalReplacements = [
        ...buildGeneratedPostRemovalReplacements(args),
        ...(Array.isArray(args.postRemovalReplacements) ? args.postRemovalReplacements : []),
      ];
      const targetHeader = typeof args.targetHeader === 'string' && args.targetHeader.trim()
        ? normalizeOptionalDepsForExplicitAssignments(args.targetHeader, postRemovalReplacements).trimEnd() + '\n\n'
        : '';
      const content = targetHeader + reads
        .map(({ selector, name, read }) => classMethodToExportedFunction(
          read.output.code,
          name,
          methodExtractionAdapter(args, name, selector),
        ))
        .join('\n\n') + '\n';
      let create = null;
      if (fs.existsSync(targetFile)) {
        if (!fileHasExportedFunctions(targetFile, functionNames)) {
          throw new Error('extract_class_methods_to_file target file exists but does not contain all requested functions');
        }
        create = { output: { skipped: true, reason: 'target already contains requested functions' } };
      } else {
        create = await callAtomicTool(
          'atomic_create_file',
          { file: targetFile, content },
          'extract_class_methods_to_file create ' + targetFile,
        );
      }
      const importOps = [];
      for (const importName of sourceImportNames) {
        importOps.push(await callAtomicTool(
          'atomic_add_import',
          { file: sourceFile, name: importName, module: importModule },
          'extract_class_methods_to_file import ' + importName,
        ));
      }
      const replacements = Array.isArray(args.callsiteReplacements) && args.callsiteReplacements.length
        ? args.callsiteReplacements
        : functionNames.map((name) => ({ oldText: 'this.' + name + '(', newText: name + '(' }));
      const replacementOps = [];
      const sourceBeforeReplacements = fs.readFileSync(sourceFile, 'utf8');
      for (const replacement of replacements) {
        const oldText = replacement.oldText;
        const newText = replacementText(args, replacement);
        if (!oldText || typeof newText !== 'string') {
          throw new Error('extract_class_methods_to_file callsite replacement requires oldText and newText');
        }
        const expectedCount = replacement.expectedCount ?? countOccurrences(sourceBeforeReplacements, oldText);
        if (expectedCount > 0) {
          for (let occurrenceIndex = 0; occurrenceIndex < expectedCount; occurrenceIndex += 1) {
            replacementOps.push(await callAtomicTool(
              'atomic_replace_text',
              { file: sourceFile, oldText, newText, occurrence: 1 },
              'extract_class_methods_to_file replace callsite ' + oldText,
            ));
          }
        } else {
          replacementOps.push({ output: { skipped: true, oldText, reason: 'already converted or absent' } });
        }
      }
      const removeOps = [];
      for (const selector of selectors) {
        removeOps.push(await callAtomicTool(
          'atomic_edit_symbol',
          { file: sourceFile, selector, op: 'remove' },
          'extract_class_methods_to_file remove ' + selector,
        ));
      }
      const postRemovalReplacementOps = [];
      if (postRemovalReplacements.length) {
        for (const replacement of postRemovalReplacements) {
          const { oldText, newText } = resolveAnchoredTailReplacement(sourceFile, replacement, args);
          if (!oldText || typeof newText !== 'string') {
            throw new Error('extract_class_methods_to_file postRemovalReplacements require oldText/newText or anchorText/newTextPrefix');
          }
          const expectedCount = replacement.expectedCount ?? countOccurrences(fs.readFileSync(sourceFile, 'utf8'), oldText);
          if (expectedCount > 0) {
            postRemovalReplacementOps.push(await callAtomicTool(
              'atomic_replace_text',
              { file: sourceFile, oldText, newText, expectedCount },
              'extract_class_methods_to_file post-removal replacement ' + oldText,
            ));
          } else {
            postRemovalReplacementOps.push({ output: { skipped: true, oldText, reason: 'already converted or absent' } });
          }
        }
      }
      const compactOps = [];
      const gapPatterns = [
        ['\n\n\n  private async ', '\n\n  private async '],
        ['\n\n\n  private ', '\n\n  private '],
        ['\n\n\n  async ', '\n\n  async '],
        ['\n\n\n\n}', '\n\n}'],
        ['\n\n\n}', '\n\n}'],
      ];
      for (const [oldText, newText] of gapPatterns) {
        const expectedCount = countOccurrences(fs.readFileSync(sourceFile, 'utf8'), oldText);
        if (expectedCount === 0) {
          compactOps.push({ output: { skipped: true, oldText, reason: 'gap absent' } });
          continue;
        }
        compactOps.push(await callAtomicTool(
          'atomic_replace_text',
          { file: sourceFile, oldText, newText, expectedCount },
          'extract_class_methods_to_file compact gap',
        ));
      }
      const lintFixArgs = normalizeLintFixArgs(args, sourceFile, targetFile);
      const lintFix = lintFixArgs
        ? await callAtomicTool(
            'atomic_apply_eslint_dry_run_fixes',
            lintFixArgs,
            'extract_class_methods_to_file lint fix',
          )
        : null;
      const postLintReplacementOps = [];
      if (Array.isArray(args.postLintReplacements)) {
        for (const replacement of args.postLintReplacements) {
          const replacementFile = replacement.file || sourceFile;
          const oldText = replacement.oldText;
          const newText = replacementText(args, replacement);
          if (!oldText || typeof newText !== 'string') {
            throw new Error('extract_class_methods_to_file postLintReplacements require oldText and newText');
          }
          const expectedCount = replacement.expectedCount ?? countOccurrences(fs.readFileSync(replacementFile, 'utf8'), oldText);
          if (expectedCount > 0) {
            postLintReplacementOps.push(await callAtomicTool(
              'atomic_replace_text',
              { file: replacementFile, oldText, newText, expectedCount },
              'extract_class_methods_to_file post-lint replacement ' + oldText,
            ));
          } else {
            postLintReplacementOps.push({ output: { skipped: true, oldText, reason: 'already converted or absent' } });
          }
        }
      }
      const postLintFix = postLintReplacementOps.length && lintFixArgs
        ? await callAtomicTool(
            'atomic_apply_eslint_dry_run_fixes',
            lintFixArgs,
            'extract_class_methods_to_file post-lint fix',
          )
        : null;
      const validation = args.validate === true || args.validationProfile ? runKloelUnifiedAgentValidation(args) : null;
      const payload = {
        ok: !validation || validation.ok,
        operation: 'extract_class_methods_to_file',
        sourceFile,
        targetFile,
        selectors,
        functionNames,
        sourceImportNames,
        importModule,
        validation,
        operations: [
          ...reads.map(({ selector, read }) => ({ tool: 'code_read_symbol', selector, output: read.output })),
          { tool: 'atomic_create_file', output: create.output },
          ...importOps.map((op, index) => ({ tool: 'atomic_add_import', importName: sourceImportNames[index], output: op.output })),
          ...replacementOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...removeOps.map((op, index) => ({ tool: 'atomic_edit_symbol', selector: selectors[index], output: op.output })),
          ...postRemovalReplacementOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...compactOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...(lintFix ? [{ tool: 'atomic_apply_eslint_dry_run_fixes', output: lintFix.output }] : []),
          ...postLintReplacementOps.map((op) => ({ tool: 'atomic_replace_text', output: op.output })),
          ...(postLintFix ? [{ tool: 'atomic_apply_eslint_dry_run_fixes', output: postLintFix.output }] : []),
        ],
      };
      emitPayload(payload, args);
      if (validation && !validation.ok) {
        throw new Error('extract_class_methods_to_file validation failed');
      }
      return;
}

module.exports = { handleExtractClassMethodsToFile };
