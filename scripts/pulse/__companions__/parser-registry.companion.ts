function loadParserPluginDefinitions(
  config: PulseConfig,
  options: LoadParserInventoryOptions,
): {
  contracts: ParserContractWithOperationalMetadata[];
  loadedChecks: ParserDefinitionWithOperationalMetadata[];
  unavailableChecks: PulseParserInventory['unavailableChecks'];
} {
  const contracts: ParserContractWithOperationalMetadata[] = [];
  const loadedChecks: ParserDefinitionWithOperationalMetadata[] = [];
  const unavailableChecks: PulseParserInventory['unavailableChecks'] = [];

  for (const pluginDescriptor of discoverPlugins(config.rootDir)) {
    const plugin = loadPlugin(pluginDescriptor.path);
    const file = path.relative(config.rootDir, pluginDescriptor.path);
    if (!plugin) {
      if (pluginDescriptor.kind === 'parser') {
        unavailableChecks.push({
          name: pluginDescriptor.id,
          file,
          reason:
            'Parser plugin entrypoint did not load or failed PulsePlugin contract validation.',
        });
      }
      continue;
    }

    const parserProvider = plugin as typeof plugin & PluginParserProvider;
    const surfaces = parserSurfacesForProvider(parserProvider);

    if (plugin.kind !== 'parser' && surfaces.length === 0) {
      continue;
    }

    if (plugin.kind === 'parser' && surfaces.length === 0) {
      unavailableChecks.push({
        name: plugin.id,
        file,
        reason: 'Parser plugin loaded but did not expose parsers() or sensors().',
      });
      continue;
    }

    for (const surface of surfaces) {
      let parserDefinitions: PluginParserDefinitionInput[] | null = null;
      try {
        parserDefinitions = callPluginParserSurface(parserProvider, surface);
      } catch (error) {
        unavailableChecks.push({
          name: plugin.id,
          file,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }

      if (!parserDefinitions) {
        unavailableChecks.push({
          name: plugin.id,
          file,
          reason: `Parser plugin ${surface}() did not return PulseParserDefinition[].`,
        });
        continue;
      }

      for (const parserDefinition of parserDefinitions) {
        if (options.includeParser && !options.includeParser(parserDefinition.name)) {
          continue;
        }

        if (!PARSER_NAME_RE.test(parserDefinition.name)) {
          unavailableChecks.push({
            name: parserDefinition.name,
            file,
            reason: 'Plugin parser name failed safe-identifier validation.',
          });
          continue;
        }

        const metadata = operationalMetadataFromPluginDefinition(
          plugin.id,
          surface,
          parserDefinition,
        );
        contracts.push(
          buildPluginParserContract(
            config.rootDir,
            plugin.id,
            pluginDescriptor.path,
            surface,
            parserDefinition,
          ),
        );
        loadedChecks.push({
          ...parserDefinition,
          file: stringFromUnknown(parserDefinition.file) ?? file,
          ...metadata,
        });
      }
    }
  }

  return { contracts, loadedChecks, unavailableChecks };
}

function resolveParserFunction(
  mod: Record<string, unknown>,
  contract: PulseParserContract,
): PulseParserDefinition['fn'] | null {
  for (const exportName of contract.parserExports) {
    const value = mod[exportName];
    if (typeof value === 'function') {
      return value as PulseParserDefinition['fn'];
    }
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>;
      if (typeof candidate.fn === 'function') {
        return candidate.fn as PulseParserDefinition['fn'];
      }
      if (typeof candidate.run === 'function') {
        return candidate.run as PulseParserDefinition['fn'];
      }
      if (typeof candidate.check === 'function') {
        return candidate.check as PulseParserDefinition['fn'];
      }
    }
  }

  const namedParser = Object.entries(mod).find(
    ([exportName, value]) => PARSER_EXPORT_RE.test(exportName) && typeof value === 'function',
  );
  if (namedParser) {
    return namedParser[1] as PulseParserDefinition['fn'];
  }

  return null;
}

/** Load parser inventory. */
export function loadParserInventory(
  config: PulseConfig,
  options: LoadParserInventoryOptions = {},
): PulseParserInventory {
  const generatedAt = new Date().toISOString();
  const filesystemContracts = discoverFilesystemParserContracts(config.rootDir);
  const pluginInventory = loadParserPluginDefinitions(config, options);
  const contracts = [...filesystemContracts, ...pluginInventory.contracts].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const checks = contracts
    .filter((contract) => contract.kind === 'active_parser')
    .map((contract) => contract.name);
  const helperFilesSkipped = contracts
    .filter((contract) => contract.kind === 'helper')
    .map((contract) => contract.name);
  const loadedChecks: PulseParserDefinition[] = [];
  const unavailableChecks: PulseParserInventory['unavailableChecks'] = [
    ...pluginInventory.unavailableChecks,
  ];

  for (const contract of filesystemContracts.filter((item) => item.kind === 'active_parser')) {
    const name = contract.name;
    if (options.includeParser && !options.includeParser(name)) {
      continue;
    }

    if (!PARSER_NAME_RE.test(name)) {
      unavailableChecks.push({
        name,
        file: name,
        reason: 'Parser module name failed safe-identifier validation.',
      });
      continue;
    }

    const file = safeJoin(config.rootDir, 'scripts', 'pulse', 'parsers', `${name}.ts`);

    try {
      const mod = require(file);
      const fn = resolveParserFunction(mod, contract);

      if (!fn) {
        unavailableChecks.push({
          name,
          file: path.relative(config.rootDir, file),
          reason: 'Parser module did not export a callable check function.',
        });
        continue;
      }

      loadedChecks.push({
        name,
        file: path.relative(config.rootDir, file),
        fn,
        ...getOperationalMetadata(contract),
      });
    } catch (error) {
      unavailableChecks.push({
        name,
        file: path.relative(config.rootDir, file),
        reason: (error as Error).message || 'Unknown parser load failure',
      });
    }
  }
  loadedChecks.push(...pluginInventory.loadedChecks);

  return {
    contracts,
    generatedAt,
    discoveredChecks: checks,
    loadedChecks,
    unavailableChecks,
    helperFilesSkipped,
  };
}

