import * as path from 'path';
import * as ts from 'typescript';
import type { UIElement } from '../../../types.core';
import type { PulseConfig } from '../../../types.manifest';
import type { HookRegistry } from '../../hook-registry';
import { buildApiModuleMap } from '../../api-parser';
import { extractSaveHandlerApiCalls } from '../../../ui-api-calls';
import { componentHasSaveHandler, resolveHandler } from '../../ui-handler-resolver';
import { extractHookDestructures } from '../../hook-registry';
import { walkFiles } from '../../utils';
import { readTextFile } from '../../../safe-fs';
import { getFrontendSourceDirs } from '../../../frontend-roots';
import {
  deriveUnitValue,
  deriveZeroValue,
} from '../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';
import { discoverSourceExtensionsFromObservedTypescript } from '../../../dynamic-reality-kernel/__parts__/token-evidence';
import { extractLabel, extractComponent, isTestOrSpecFile } from './text-and-string-utils';
import { extractJSXHandler, expandInlineHandler, DOM_HANDLER_PROPS } from './handler-utils';
import {
  extractApiImports,
  extractActionPropNames,
  hasButtonSemantics,
  hasToggleSemantics,
  resolveToggleHandler,
  buildElement,
} from './semantic-and-api-utils';

export function parseUIElements(config: PulseConfig, hookRegistry?: HookRegistry): UIElement[] {
  const elements: UIElement[] = [];
  const files = getFrontendSourceDirs(config).flatMap((frontendDir) =>
    walkFiles(
      frontendDir,
      [...discoverSourceExtensionsFromObservedTypescript()].filter(
        (e) => e !== ts.Extension.Ts && e !== ts.Extension.Js,
      ),
    ),
  );
  const registry = hookRegistry || new Map();
  const apiModuleMap = buildApiModuleMap(config);

  for (const file of files) {
    if (isTestOrSpecFile(file)) {
      continue;
    }

    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      const hookDestructures = extractHookDestructures(content);

      const apiImportsInFile = extractApiImports(content);
      const saveHandlerApiCalls = extractSaveHandlerApiCalls(
        content,
        apiModuleMap,
        apiImportsInFile,
      );
      const hasSaveHandler =
        saveHandlerApiCalls.length > deriveZeroValue() || componentHasSaveHandler(content);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const onClickHandler = extractJSXHandler(line, 'onClick');
        if (onClickHandler) {
          const handler = expandInlineHandler(onClickHandler.trim(), lines, i);
          const resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });
          const label = extractLabel(line, lines, i);
          const component = extractComponent(lines, i);

          elements.push(
            buildElement(
              relFile,
              i + deriveUnitValue(),
              hasButtonSemantics(line) ? 'button' : 'clickable',
              label,
              handler,
              resolved,
              component,
            ),
          );
        }

        const onSubmitHandler = extractJSXHandler(line, 'onSubmit');
        if (onSubmitHandler) {
          const handler = expandInlineHandler(onSubmitHandler.trim(), lines, i);
          const resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });

          elements.push(
            buildElement(
              relFile,
              i + deriveUnitValue(),
              'form',
              'form',
              handler,
              resolved,
              extractComponent(lines, i),
            ),
          );
        }

        for (const propName of extractActionPropNames(line)) {
          if (DOM_HANDLER_PROPS.has(propName)) {
            continue;
          }

          const actionHandler = extractJSXHandler(line, propName);
          if (!actionHandler) {
            continue;
          }

          const handler = expandInlineHandler(actionHandler.trim(), lines, i);
          const resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });

          elements.push(
            buildElement(
              relFile,
              i + deriveUnitValue(),
              'clickable',
              propName,
              handler,
              resolved,
              extractComponent(lines, i),
            ),
          );
        }

        if (hasToggleSemantics(line)) {
          const handlerExpr = resolveToggleHandler(line);
          if (handlerExpr) {
            const handler = expandInlineHandler(handlerExpr.trim(), lines, i);
            const resolved = resolveHandler({
              handlerExpr: handler,
              lines,
              fileContent: content,
              hookDestructures,
              hookRegistry: registry,
              hasSaveHandler,
              apiImportsInFile,
              apiModuleMap,
            });

            elements.push(
              buildElement(
                relFile,
                i + deriveUnitValue(),
                'toggle',
                extractLabel(line, lines, i),
                handler,
                resolved,
                extractComponent(lines, i),
              ),
            );
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [warn] Could not parse UI in ${file}: ${(e as Error).message}\n`);
    }
  }

  return elements;
}
