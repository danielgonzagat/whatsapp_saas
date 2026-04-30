/** Parse ui elements. */
export function parseUIElements(config: PulseConfig, hookRegistry?: HookRegistry): UIElement[] {
  const elements: UIElement[] = [];
  const files = getFrontendSourceDirs(config).flatMap((frontendDir) =>
    walkFiles(frontendDir, ['.tsx', '.jsx']),
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

      // Build hook destructure map for this file (cross-file resolution)
      const hookDestructures = extractHookDestructures(content);

      // Extract imported API functions
      const apiImportsInFile = extractApiImports(content);
      // Check if component has a save handler with API call
      const saveHandlerApiCalls = extractSaveHandlerApiCalls(
        content,
        apiModuleMap,
        apiImportsInFile,
      );
      const hasSaveHandler = saveHandlerApiCalls.length > 0 || componentHasSaveHandler(content);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Detect onClick handlers using brace-counting (not regex)
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
              i + 1,
              hasButtonSemantics(line) ? 'button' : 'clickable',
              label,
              handler,
              resolved,
              component,
            ),
          );
        }

        // Detect onSubmit handlers
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
              i + 1,
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
              i + 1,
              'clickable',
              propName,
              handler,
              resolved,
              extractComponent(lines, i),
            ),
          );
        }

        // Detect Toggle/Switch
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
                i + 1,
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

