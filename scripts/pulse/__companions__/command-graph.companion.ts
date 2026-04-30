function isLikelyEnvName(value: string): boolean {
  if (value.length < 3) {
    return false;
  }
  if (value[0] < 'A' || value[0] > 'Z') {
    return false;
  }
  return [...value].every(isEnvNameChar);
}

function readEnvNameAt(text: string, start: number): string {
  let cursor = start;
  let name = '';
  while (cursor < text.length && isEnvNameChar(text[cursor])) {
    name += text[cursor];
    cursor += 1;
  }
  return isLikelyEnvName(name) ? name : '';
}

function collectNamesAfterMarkers(text: string, markers: string[]): string[] {
  const names: string[] = [];
  for (const marker of markers) {
    let cursor = text.indexOf(marker);
    while (cursor !== -1) {
      const name = readEnvNameAt(text, cursor + marker.length);
      if (name) {
        names.push(name);
      }
      cursor = text.indexOf(marker, cursor + marker.length);
    }
  }
  return names;
}

function collectShellNames(text: string): string[] {
  const names: string[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '$') {
      continue;
    }
    if (text[index + 1] === '{') {
      const name = readEnvNameAt(text, index + 2);
      if (name) {
        names.push(name);
      }
      continue;
    }
    const name = readEnvNameAt(text, index + 1);
    if (name) {
      names.push(name);
    }
  }
  return names;
}

function collectUppercaseNames(text: string): string[] {
  const names: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    if (!isEnvNameChar(text[cursor])) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    let name = '';
    while (cursor < text.length && isEnvNameChar(text[cursor])) {
      name += text[cursor];
      cursor += 1;
    }
    const before = text[start - 1];
    const after = text[cursor];
    if (!isEnvNameChar(before) && !isEnvNameChar(after) && isLikelyEnvName(name)) {
      names.push(name);
    }
  }
  return names;
}

function isSecretLikeName(name: string): boolean {
  const tokens = new Set(name.toLowerCase().split('_').filter(Boolean));
  return (
    tokens.has('secret') ||
    tokens.has('token') ||
    tokens.has('password') ||
    tokens.has('private') ||
    (tokens.has('api') && tokens.has('key')) ||
    (tokens.has('access') && tokens.has('key')) ||
    tokens.has('webhook')
  );
}

function collectEnvNames(text: string): Map<string, string[]> {
  const names = new Map<string, string[]>();
  const add = (name: string, context: string): void => {
    const current = names.get(name) ?? [];
    current.push(context);
    names.set(name, current);
  };

  for (const name of collectNamesAfterMarkers(text, ['process.env.'])) {
    add(name, 'process.env');
  }
  for (const name of collectNamesAfterMarkers(text, ['secrets.', 'vars.', 'env.'])) {
    add(name, 'github-template');
  }
  for (const name of collectShellNames(text)) {
    add(name, 'shell');
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const upperTrimmed = trimmed.toUpperCase();
    if (upperTrimmed.startsWith('ARG ')) {
      const declaration = trimmed.slice(4).trim();
      const [name, defaultValue] = declaration.split('=', 2);
      if (isLikelyEnvName(name)) {
        add(name, defaultValue === undefined ? 'docker-arg-required' : 'docker-arg-default');
      }
    }
    if (upperTrimmed.startsWith('ENV ')) {
      for (const name of collectUppercaseNames(trimmed.slice(4))) {
        add(name, 'docker-env');
      }
    }
    if (!trimmed.startsWith('- ') && trimmed.includes(':')) {
      const [candidate] = trimmed.split(':', 1);
      if (isLikelyEnvName(candidate.trim())) {
        add(candidate.trim(), 'workflow-env');
      }
    }
  }
  return names;
}

function environmentVariablesForSource(
  source: CandidateSource,
  text: string,
): PulseDiscoveredEnvironmentVariable[] {
  return [...collectEnvNames(text).entries()]
    .map(([name, contexts]) => ({
      name,
      sourcePath: source.relativePath,
      sourceKind: source.sourceKind,
      contexts: [...new Set(contexts)].sort(),
      required: contexts.includes('docker-arg-required') || contexts.includes('github-template'),
      secretLike: isSecretLikeName(name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function mergeEnvironmentVariables(
  variables: PulseDiscoveredEnvironmentVariable[],
): PulseDiscoveredEnvironmentVariable[] {
  const byKey = new Map<string, PulseDiscoveredEnvironmentVariable>();
  for (const variable of variables) {
    const key = `${variable.sourcePath}:${variable.name}`;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, variable);
      continue;
    }
    byKey.set(key, {
      ...current,
      contexts: [...new Set([...current.contexts, ...variable.contexts])].sort(),
      required: current.required || variable.required,
      secretLike: current.secretLike || variable.secretLike,
    });
  }
  return [...byKey.values()].sort((left, right) => {
    const bySource = left.sourcePath.localeCompare(right.sourcePath);
    return bySource === 0 ? left.name.localeCompare(right.name) : bySource;
  });
}

function dedupeCommands(commands: PulseDiscoveredCommand[]): PulseDiscoveredCommand[] {
  const byId = new Map<string, PulseDiscoveredCommand>();
  for (const command of commands) {
    byId.set(command.id, command);
  }
  return [...byId.values()].sort((left, right) => {
    const purpose = left.purpose.localeCompare(right.purpose);
    if (purpose !== 0) {
      return purpose;
    }
    return left.id.localeCompare(right.id);
  });
}

export function buildPulseCommandGraph(rootDir = process.cwd()): PulseCommandGraph {
  const absoluteRoot = path.resolve(rootDir);
  const sources = discoverStaticSources(absoluteRoot);
  const packageJsonFiles = sources
    .filter((source) => source.sourceKind === 'package-json')
    .map((source) => source.relativePath);
  const commands: PulseDiscoveredCommand[] = [
    ...inferInstallCommands(absoluteRoot, packageJsonFiles),
    ...inferScriptCommands(absoluteRoot, packageJsonFiles),
    ...inferTsconfigCommands(absoluteRoot, sources),
  ];
  const environmentVariables: PulseDiscoveredEnvironmentVariable[] = [];

  for (const source of sources) {
    const absolutePath = safeJoin(absoluteRoot, source.relativePath);
    if (!pathExists(absolutePath) || !statPath(absolutePath).isFile()) {
      continue;
    }
    const text = readTextFile(absolutePath, 'utf8');
    environmentVariables.push(...environmentVariablesForSource(source, text));
    if (source.sourceKind === 'dockerfile') {
      commands.push(...dockerCommands(source.relativePath, text));
    }
    if (source.sourceKind === 'github-workflow') {
      commands.push(...workflowCommands(source.relativePath, text));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    commands: dedupeCommands(commands),
    environmentVariables: mergeEnvironmentVariables(environmentVariables),
    scannedSources: uniqueSorted(
      sources.map((source) =>
        toRelativePath(absoluteRoot, safeJoin(absoluteRoot, source.relativePath)),
      ),
    ),
  };
}

