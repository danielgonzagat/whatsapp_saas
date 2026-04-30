import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildAstCallGraph } from '../ast-graph';
import { buildBehaviorGraph } from '../behavior-graph';
import { detectSourceRoots } from '../source-root-detector';

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

  it('derives source roots from package and tsconfig metadata instead of Kloel-only defaults', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-source-roots-'));
    const appDir = path.join(rootDir, 'apps/control-panel/src');
    const serviceDir = path.join(rootDir, 'services/api/src');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(serviceDir, { recursive: true });

    fs.writeFileSync(
      path.join(rootDir, 'package.json'),
      JSON.stringify({ workspaces: ['apps/*', 'services/*'] }),
    );
    fs.writeFileSync(
      path.join(rootDir, 'apps/control-panel/package.json'),
      JSON.stringify({ name: '@opaque/control-panel' }),
    );
    fs.writeFileSync(
      path.join(rootDir, 'apps/control-panel/tsconfig.json'),
      JSON.stringify({ include: ['src/**/*.tsx'] }),
    );
    fs.writeFileSync(
      path.join(rootDir, 'services/api/package.json'),
      JSON.stringify({ name: '@opaque/api' }),
    );
    fs.writeFileSync(
      path.join(rootDir, 'services/api/tsconfig.json'),
      JSON.stringify({ include: ['src/**/*.ts'] }),
    );
    fs.writeFileSync(
      path.join(appDir, 'Widget.tsx'),
      ['export function Widget(): JSX.Element {', '  return <main />;', '}'].join('\n'),
    );
    fs.writeFileSync(
      path.join(serviceDir, 'endpoint.ts'),
      ['export function handler(): string {', "  return 'ok';", '}'].join('\n'),
    );

    const roots = detectSourceRoots(rootDir).map((root) => root.relativePath);
    expect(roots).toEqual(['apps/control-panel/src', 'services/api/src']);

    const graph = await buildAstCallGraph(rootDir);
    expect(graph.symbols.some((symbol) => symbol.name === 'Widget')).toBe(true);
    expect(graph.symbols.some((symbol) => symbol.name === 'handler')).toBe(true);

    const behaviorGraph = buildBehaviorGraph(rootDir);
    expect(behaviorGraph.nodes.map((node) => node.filePath).sort()).toEqual([
      'apps/control-panel/src/Widget.tsx',
      'services/api/src/endpoint.ts',
    ]);
  });

  it('keeps TypeScript framework decorators as weak hints instead of universal route authority', async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-weak-decorator-hints-'));
    const srcDir = path.join(rootDir, 'backend/src/opaque');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'decorators.ts'),
      [
        'export function Command(_path?: string): MethodDecorator { return () => undefined; }',
        'export function Workflow(): ClassDecorator { return () => undefined; }',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(srcDir, 'workflow.ts'),
      [
        "import { Command, Workflow } from './decorators';",
        '@Workflow()',
        'export class OpaqueWorkflow {',
        "  @Command('/run')",
        '  run(): string {',
        "    return 'ok';",
        '  }',
        '}',
      ].join('\n'),
    );

    const graph = await buildAstCallGraph(rootDir);
    const workflowMethod = graph.symbols.find((symbol) => symbol.name === 'OpaqueWorkflow.run');

    expect(workflowMethod).toEqual(
      expect.objectContaining({
        decorators: ['Command'],
        httpMethod: null,
        kind: 'class_method',
        routePath: null,
      }),
    );
    expect(graph.summary.apiRoutesFound).toBe(0);

    const behaviorGraph = buildBehaviorGraph(rootDir);
    const behaviorNode = behaviorGraph.nodes.find((node) => node.name === 'run');
    expect(behaviorNode).toEqual(
      expect.objectContaining({
        decorators: expect.arrayContaining(['Command']),
        kind: 'function_definition',
      }),
    );
    expect(behaviorGraph.summary.apiEndpointNodes).toBe(0);
  });
});
