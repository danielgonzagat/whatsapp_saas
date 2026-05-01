function countRoutesPerCapability(
  backendRoutes: { fullPath: string }[],
  discoveredModules: PulseDiscoveredModule[],
): string[] {
  const discoveredKeys = new Set(discoveredModules.map((item) => item.key));
  const counts = new Map<string, { name: string; count: number }>();

  for (const route of backendRoutes) {
    const segments = route.fullPath
      .replace(/^\/+/g, '')
      .split('/')
      .filter(Boolean)
      .filter((segment) => !segment.startsWith(':'))
      .filter((segment) => !['api', 'v1', 'kloel'].includes(segment.toLowerCase()));

    const root = unique(
      segments
        .flatMap((segment) => tokenize(segment))
        .flatMap((segment) => [segment, singularize(segment)])
        .filter((segment) => !shouldIgnoreSemanticToken(segment)),
    )[0];
    if (!root) {
      continue;
    }
    const key = slugify(root);
    const name = titleCase(root);
    const current = counts.get(key);
    counts.set(key, { name, count: (current?.count || 0) + 1 });
  }

  return [...counts.entries()]
    .filter(([key, value]) => key !== 'misc' && value.count >= 3 && !discoveredKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => `${value.name} (${value.count} routes)`);
}
