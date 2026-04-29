import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildAstCallGraph } from '../ast-graph';

describe('PULSE AST call graph', () => {
  it('resolves decorator applications through imported aliases and anchors edges to declarations', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ast-graph-'));
    const backendDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(backendDir, { recursive: true });

    fs.writeFileSync(
      path.join(backendDir, 'decorators.ts'),
      [
        'export function Controller(_path?: string): ClassDecorator { return () => undefined; }',
        'export function Get(_path?: string): MethodDecorator { return () => undefined; }',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'service.ts'),
      [
        'export function audited(): void {}',
        'export class OpaqueService {',
        '  run(): void { audited(); }',
        '}',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(backendDir, 'controller.ts'),
      [
        "import { Controller, Get } from './decorators';",
        "import { OpaqueService } from './service';",
        "@Controller('/opaque')",
        'export class OpaqueController {',
        "  @Get('/run')",
        '  run(): void {',
        '    new OpaqueService().run();',
        '  }',
        '}',
      ].join('\n'),
    );

    const graph = await buildAstCallGraph(rootDir);
    const controllerMethod = graph.symbols.find((symbol) => symbol.name === 'OpaqueController.run');
    const getDecorator = graph.symbols.find((symbol) => symbol.name === 'Get');

    expect(controllerMethod).toBeDefined();
    expect(getDecorator).toBeDefined();
    expect(graph.summary.decoratorApplications).toBeGreaterThanOrEqual(2);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        from: controllerMethod?.id,
        to: getDecorator?.id,
        kind: 'decorator_application',
        resolved: true,
      }),
    );
    expect(graph.edges.some((edge) => edge.from === `${controllerMethod?.filePath}:run:7`)).toBe(
      false,
    );
  });
});
