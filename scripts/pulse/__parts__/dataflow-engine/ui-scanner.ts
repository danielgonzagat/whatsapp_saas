import type { SourceFileSnapshot } from './constants-and-parsers';
import { sourceLooksLikeUi, routeFromSourceFile } from './usage-graph';

export function findModelInUI(sourceFiles: SourceFileSnapshot[], modelName: string): string[] {
  const routes: string[] = [];
  const lowerModel = modelName.toLowerCase();

  for (const sourceFile of sourceFiles) {
    if (!sourceLooksLikeUi(sourceFile.content)) continue;
    if (
      sourceFile.content.includes(modelName) ||
      sourceFile.content.toLowerCase().includes(lowerModel)
    ) {
      const route = routeFromSourceFile(sourceFile.relativePath);
      if (!routes.includes(route)) {
        routes.push(route);
      }
    }
  }
  return routes;
}
