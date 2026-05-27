import { CognitiveBridgeService } from './cognitive-bridge.service';
import * as fs from 'fs/promises';

describe('CognitiveBridgeService', () => {
  let service: CognitiveBridgeService;
  let readFileSpy: jest.SpyInstance;

  const mockOpenApiDoc = {
    paths: {
      '/api/products': {
        get: {
          operationId: 'products_list',
          summary: 'GET /api/products',
          tags: ['products'],
          'x-controller-file': 'backend/src/products/products.controller.ts',
          'x-method-name': 'list',
        },
        post: {
          operationId: 'products_create',
          summary: 'POST /api/products',
          tags: ['products'],
          'x-controller-file': 'backend/src/products/products.controller.ts',
          'x-method-name': 'create',
        },
      },
      '/api/orders': {
        get: {
          operationId: 'orders_list',
          summary: 'GET /api/orders',
          tags: ['orders'],
          'x-controller-file': 'backend/src/orders/orders.controller.ts',
          'x-method-name': 'list',
        },
      },
    },
  };

  const mockAsyncApiDoc = {
    channels: {
      'commerce.payment.approved': {
        description: 'commerce domain event',
        parameters: { domain: 'commerce' },
        publish: { summary: 'commerce.payment.approved' },
      },
      'commerce.cart.abandoned': {
        description: 'commerce domain event',
        parameters: { domain: 'commerce' },
        publish: { summary: 'commerce.cart.abandoned' },
      },
      'cognition.analysis_completed': {
        description: 'cognition domain event',
        parameters: { domain: 'cognition' },
        publish: { summary: 'cognition.analysis_completed' },
      },
      'auth.refresh_token_expired': {
        description: 'auth domain event',
        parameters: { domain: 'auth' },
        publish: { summary: 'auth.refresh_token_expired' },
      },
    },
  };

  const mockSarifDoc = {
    runs: [
      {
        results: [
          {
            ruleId: '@typescript-eslint/no-unsafe-assignment',
            level: 'error',
            message: { text: 'Unsafe assignment of an error typed value.' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: 'backend/src/kloel/kloel.service.ts',
                    uriBaseId: '%SRCROOT%',
                  },
                  region: { startLine: 42, startColumn: 5 },
                },
              },
            ],
          },
          {
            ruleId: 'prettier/prettier',
            level: 'warning',
            message: { text: 'Insert a line break' },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: 'backend/src/kloel/kloel.service.ts',
                    uriBaseId: '%SRCROOT%',
                  },
                  region: { startLine: 50, startColumn: 1 },
                },
              },
            ],
          },
          {
            ruleId: '@typescript-eslint/no-unused-vars',
            level: 'error',
            message: { text: "'x' is declared but never used." },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri: 'backend/src/other/file.ts',
                    uriBaseId: '%SRCROOT%',
                  },
                  region: { startLine: 10, startColumn: 7 },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const mockSarifDocEmpty = { runs: [{ results: [] }] };

  const mockManifest = {
    workspaces: [
      { workspace: 'backend', file: 'tools/sarif/backend.sarif', findings: 8651 },
      { workspace: 'frontend', file: 'tools/sarif/frontend.sarif', findings: 3 },
      { workspace: 'worker', file: 'tools/sarif/worker.sarif', findings: 0 },
    ],
  };

  function mockReadFile(pathLike: string): string {
    const p = pathLike.toString();
    if (p.includes('openapi')) return JSON.stringify(mockOpenApiDoc);
    if (p.includes('asyncapi')) return JSON.stringify(mockAsyncApiDoc);
    if (p.includes('manifest')) return JSON.stringify(mockManifest);
    if (p.includes('backend.sarif')) return JSON.stringify(mockSarifDoc);
    if (p.includes('frontend.sarif')) return JSON.stringify(mockSarifDocEmpty);
    throw new Error('ENOENT: ' + p);
  }

  beforeEach(() => {
    readFileSpy = jest.spyOn(fs, 'readFile').mockImplementation((pathLike: any) => {
      const content = mockReadFile(typeof pathLike === 'string' ? pathLike : pathLike.toString());
      return Promise.resolve(content);
    });
    service = new CognitiveBridgeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getLspDiagnostics returns issues for a known file', async () => {
    const diags = await service.getLspDiagnostics('backend/src/kloel/kloel.service.ts');
    expect(diags.length).toBe(2);
    expect(diags[0]?.ruleId).toBe('@typescript-eslint/no-unsafe-assignment');
    expect(diags[0]?.severity).toBe('error');
    expect(diags[0]?.line).toBe(42);
    expect(diags[1]?.ruleId).toBe('prettier/prettier');
    expect(diags[1]?.severity).toBe('warning');
  });

  it('getLspDiagnostics returns empty array for unknown file', async () => {
    const diags = await service.getLspDiagnostics('nonexistent/file.ts');
    expect(diags).toEqual([]);
  });

  it('getLspDiagnostics skips workspaces with zero findings', async () => {
    const diags = await service.getLspDiagnostics('worker/src/foo.ts');
    expect(diags).toEqual([]);
  });

  it('getOpenApiRoute finds routes by path segment', async () => {
    const routes = await service.getOpenApiRoute('products');
    expect(routes.length).toBe(2);
    expect(routes[0]?.route).toBe('/api/products');
    expect(routes[0]?.method).toBe('GET');
    expect(routes[1]?.route).toBe('/api/products');
    expect(routes[1]?.method).toBe('POST');
  });

  it('getOpenApiRoute finds routes by controller file name', async () => {
    const routes = await service.getOpenApiRoute('orders.controller');
    expect(routes.length).toBe(1);
    expect(routes[0]?.route).toBe('/api/orders');
    expect(routes[0]?.controller).toBe('backend/src/orders/orders.controller.ts');
  });

  it('getOpenApiRoute returns empty array for no match', async () => {
    const routes = await service.getOpenApiRoute('nonexistent');
    expect(routes).toEqual([]);
  });

  it('getAsyncApiEvents returns events for a domain', async () => {
    const events = await service.getAsyncApiEvents('commerce');
    expect(events.length).toBe(2);
    expect(events[0]?.name).toBe('commerce.payment.approved');
    expect(events[1]?.name).toBe('commerce.cart.abandoned');
  });

  it('getAsyncApiEvents is case-insensitive', async () => {
    const events = await service.getAsyncApiEvents('COGNITION');
    expect(events.length).toBe(1);
    expect(events[0]?.domain).toBe('cognition');
  });

  it('getAsyncApiEvents returns empty array for unknown domain', async () => {
    const events = await service.getAsyncApiEvents('nonexistent');
    expect(events).toEqual([]);
  });

  it('getStaticAnalysisIssues returns issues for a known file', async () => {
    const issues = await service.getStaticAnalysisIssues('backend/src/kloel/kloel.service.ts');
    expect(issues.length).toBe(2);
  });

  it('getStaticAnalysisIssues returns empty for unknown file', async () => {
    const issues = await service.getStaticAnalysisIssues('nonexistent/file.ts');
    expect(issues).toEqual([]);
  });

  it('caches OpenAPI reads within TTL', async () => {
    await service.getOpenApiRoute('products');
    await service.getOpenApiRoute('orders');
    const openApiReads = readFileSpy.mock.calls.filter(
      (c: string[]) => (c[0] as string).includes('openapi'),
    );
    expect(openApiReads.length).toBe(1);
  });
});
