import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildScenarioCatalog } from '../scenario-engine';
import type {
  BehaviorGraph,
  BehaviorNode,
  DataflowState,
  EntityLifecycle,
  PulseProductGraph,
} from '../types';

const tempRoots: string[] = [];

function makeRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scenario-engine-'));
  tempRoots.push(rootDir);
  fs.mkdirSync(path.join(rootDir, '.pulse', 'current'), { recursive: true });
  return rootDir;
}

function writeJson(rootDir: string, fileName: string, value: unknown): void {
  fs.writeFileSync(
    path.join(rootDir, '.pulse', 'current', fileName),
    JSON.stringify(value, null, 2),
  );
}

function makeEntity(model: string, overrides: Partial<EntityLifecycle> = {}): EntityLifecycle {
  return {
    model,
    createdBy: [],
    readBy: [],
    updatedBy: [],
    deletedBy: [],
    shownInUI: [],
    critical: false,
    financial: false,
    hasAuditTrail: false,
    piiFields: [],
    hasWorkspaceIsolation: true,
    hasMutableState: true,
    hasVersionHistory: false,
    ...overrides,
  };
}

function makeEndpoint(
  id: string,
  filePath: string,
  inputNames: string[],
  options: { context?: boolean; writeModel?: string; externalProvider?: string } = {},
): BehaviorNode {
  return {
    id,
    kind: 'api_endpoint',
    name: id,
    filePath,
    line: 1,
    parentFunctionId: null,
    inputs: [
      ...(options.context
        ? [
            {
              kind: 'context' as const,
              name: 'workspaceId',
              type: 'string',
              required: true,
              validated: true,
              source: 'request',
            },
          ]
        : []),
      ...inputNames.map((name) => ({
        kind: 'body' as const,
        name,
        type: 'string',
        required: true,
        validated: true,
        source: 'dto',
      })),
    ],
    outputs: options.writeModel
      ? [{ kind: 'db_write', target: options.writeModel, type: 'create', conditional: false }]
      : [{ kind: 'response', target: 'HttpResponse', type: 'json', conditional: false }],
    stateAccess: options.writeModel
      ? [
          {
            model: options.writeModel,
            operation: 'create' as const,
            fieldPaths: inputNames,
            whereClause: null,
          },
        ]
      : [],
    externalCalls: options.externalProvider
      ? [
          {
            provider: options.externalProvider,
            operation: 'request',
            hasTimeout: true,
            hasRetry: true,
            hasCircuitBreaker: false,
            hasFallback: false,
          },
        ]
      : [],
    risk: options.writeModel ? 'high' : 'medium',
    executionMode: 'ai_safe',
    calledBy: [],
    calls: [],
    isAsync: true,
    hasErrorHandler: true,
    hasLogging: true,
    hasMetrics: false,
    hasTracing: false,
    decorators: [options.writeModel ? 'Post' : 'Get'],
    docComment: null,
  };
}

afterEach(() => {
  for (const rootDir of tempRoots.splice(0)) {
    if (fs.existsSync(rootDir)) {
      fs.rmSync(rootDir, { recursive: true });
    }
  }
});

describe('scenario-engine', () => {
  it('restores semantic core plans from discovered artifacts without fixed scenario maps', () => {
    const rootDir = makeRoot();
    const graph: PulseProductGraph = {
      surfaces: [
        {
          id: 'auth',
          name: 'Auth',
          description: 'Authentication entry',
          artifactIds: ['route:backend-src-auth-auth-controller-ts:POST:auth-login'],
          capabilities: ['cap-auth-login'],
          completeness: 70,
          truthMode: 'observed',
        },
        {
          id: 'checkout',
          name: 'Checkout',
          description: 'Payment checkout',
          artifactIds: ['route:backend-src-checkout-checkout-controller-ts:POST:checkout'],
          capabilities: ['cap-checkout-payment'],
          completeness: 70,
          truthMode: 'observed',
        },
        {
          id: 'whatsapp',
          name: 'Whatsapp',
          description: 'Provider messaging session',
          artifactIds: ['route:backend-src-whatsapp-session-controller-ts:POST:connect'],
          capabilities: ['cap-whatsapp-connect'],
          completeness: 70,
          truthMode: 'observed',
        },
        {
          id: 'workspace',
          name: 'Workspace',
          description: 'Tenant account settings',
          artifactIds: ['route:backend-src-workspace-controller-ts:POST:workspace'],
          capabilities: ['cap-workspace-create'],
          completeness: 70,
          truthMode: 'observed',
        },
        {
          id: 'product',
          name: 'Product',
          description: 'Catalog product management',
          artifactIds: ['route:backend-src-product-controller-ts:POST:product'],
          capabilities: ['cap-product-create'],
          completeness: 70,
          truthMode: 'observed',
        },
        {
          id: 'wallet',
          name: 'Wallet',
          description: 'Wallet ledger checkout balance',
          artifactIds: ['route:backend-src-wallet-controller-ts:POST:wallet'],
          capabilities: ['cap-wallet-credit'],
          completeness: 70,
          truthMode: 'observed',
        },
      ],
      capabilities: [
        ['auth', 'cap-auth-login', 'Login with credentials'],
        ['checkout', 'cap-checkout-payment', 'Process checkout payment'],
        ['whatsapp', 'cap-whatsapp-connect', 'Connect messaging provider'],
        ['workspace', 'cap-workspace-create', 'Create tenant workspace'],
        ['product', 'cap-product-create', 'Create catalog product'],
        ['wallet', 'cap-wallet-credit', 'Credit wallet ledger balance'],
      ].map(([surfaceId, id, name]) => ({
        id,
        name,
        surfaceId,
        artifactIds: [],
        flowIds: [`flow-${surfaceId}`],
        maturityScore: 0.7,
        truthMode: 'observed',
        criticality: 'must_have',
        blockers: [],
      })),
      flows: [
        ['auth', 'flow-auth', 'Auth Login'],
        ['checkout', 'flow-checkout', 'Checkout Payment'],
        ['whatsapp', 'flow-whatsapp', 'Whatsapp Connect Session'],
        ['workspace', 'flow-workspace', 'Workspace Create'],
        ['product', 'flow-product', 'Product Create'],
        ['wallet', 'flow-wallet', 'Wallet Checkout Ledger'],
      ].map(([surfaceId, id, name]) => ({
        id,
        name,
        entryCapability: `cap-${surfaceId}${surfaceId === 'auth' ? '-login' : surfaceId === 'checkout' ? '-payment' : surfaceId === 'whatsapp' ? '-connect' : surfaceId === 'workspace' ? '-create' : surfaceId === 'product' ? '-create' : '-credit'}`,
        capabilities: [],
        completeness: 0.7,
        truthMode: 'observed',
        blockers: [],
      })),
      orphanedArtifactIds: [],
      phantomCapabilities: [],
      latentCapabilities: [],
    };
    const behaviorGraph: BehaviorGraph = {
      generatedAt: '2026-04-29T00:00:00.000Z',
      summary: {
        totalNodes: 6,
        handlerNodes: 0,
        apiEndpointNodes: 6,
        queueNodes: 0,
        cronNodes: 0,
        webhookNodes: 0,
        dbNodes: 0,
        externalCallNodes: 2,
        aiSafeNodes: 6,
        humanRequiredNodes: 0,
        nodesWithErrorHandler: 6,
        nodesWithLogging: 6,
        nodesWithMetrics: 0,
        criticalRiskNodes: 0,
      },
      nodes: [
        makeEndpoint('AuthController.login', 'backend/src/auth/auth.controller.ts', [
          'email',
          'password',
        ]),
        makeEndpoint(
          'CheckoutController.create',
          'backend/src/checkout/checkout.controller.ts',
          ['amountCents', 'currency', 'productId'],
          { context: true, writeModel: 'Order', externalProvider: 'payment-provider' },
        ),
        makeEndpoint(
          'WhatsappController.connect',
          'backend/src/whatsapp/whatsapp.controller.ts',
          ['phoneNumber', 'provider'],
          { context: true, writeModel: 'WhatsappSession', externalProvider: 'messaging-provider' },
        ),
        makeEndpoint(
          'WorkspaceController.create',
          'backend/src/workspace/workspace.controller.ts',
          ['workspaceName', 'memberEmail'],
          { context: true, writeModel: 'Workspace' },
        ),
        makeEndpoint(
          'ProductController.create',
          'backend/src/product/product.controller.ts',
          ['productName', 'priceCents', 'description'],
          { context: true, writeModel: 'Product' },
        ),
        makeEndpoint(
          'WalletController.credit',
          'backend/src/wallet/wallet.controller.ts',
          ['amountCents', 'currency', 'ledgerId'],
          { context: true, writeModel: 'WalletTransaction' },
        ),
      ],
      orphanNodes: [],
      unreachableNodes: [],
    };
    const dataflowState: DataflowState = {
      generatedAt: '2026-04-29T00:00:00.000Z',
      summary: {
        totalModels: 5,
        financialModels: 2,
        modelsWithAuditTrail: 0,
        modelsWithPII: 0,
        fullyMappedModels: 5,
        partiallyMappedModels: 0,
        unmappedModels: 0,
        modelsWithWorkspaceIsolation: 5,
        modelsMissingWorkspaceIsolation: 0,
        modelsWithMutableState: 5,
        modelsMissingHistory: 5,
      },
      entities: [
        makeEntity('Order', {
          financial: true,
          createdBy: [
            {
              source: 'api',
              filePath: 'backend/src/checkout/checkout.controller.ts',
              status: 'observed',
            },
          ],
        }),
        makeEntity('WhatsappSession', { critical: true }),
        makeEntity('Workspace', { critical: true }),
        makeEntity('Product', { critical: true }),
        makeEntity('WalletTransaction', { financial: true }),
      ],
      mutations: [],
      gaps: [],
    };

    writeJson(rootDir, 'PULSE_PRODUCT_GRAPH.json', graph);
    writeJson(rootDir, 'PULSE_BEHAVIOR_GRAPH.json', behaviorGraph);
    writeJson(rootDir, 'PULSE_DATAFLOW_STATE.json', dataflowState);

    const state = buildScenarioCatalog(rootDir);
    const byId = new Map(state.scenarios.map((scenario) => [scenario.id, scenario]));

    expect(state.summary).toEqual(
      expect.objectContaining({
        passed: 0,
        failed: 0,
        notRun: state.scenarios.length,
        generated: state.scenarios.length,
        coreScenariosPassed: 0,
      }),
    );

    expect(byId.get('flow-auth')?.steps.map((step) => step.kind)).toEqual([
      'navigate',
      'type',
      'type',
      'submit',
      'api_call',
      'assert',
    ]);

    for (const id of [
      'flow-checkout',
      'flow-whatsapp',
      'flow-workspace',
      'flow-product',
      'flow-wallet',
    ]) {
      const steps = byId.get(id)?.steps.map((step) => step.kind);
      expect(steps).toContain('login');
      expect(steps).toContain('click');
      expect(steps).toContain('submit');
      expect(steps).toContain('api_call');
      expect(steps).toContain('cleanup');
    }

    for (const scenario of state.scenarios) {
      expect(scenario.status).toBe('not_run');
      expect(scenario.lastRun).toBeNull();
      expect(scenario.durationMs).toBeNull();
      expect(scenario.evidence).toEqual([]);
    }

    for (const id of ['flow-checkout', 'flow-workspace', 'flow-product', 'flow-wallet']) {
      expect(byId.get(id)?.steps.map((step) => step.kind)).toContain('seed_db');
    }

    expect(byId.get('flow-checkout')?.steps.map((step) => step.kind)).toContain('wait');
    expect(byId.get('flow-whatsapp')?.steps.map((step) => step.kind)).toContain('wait');
    expect(byId.get('flow-product')?.steps.filter((step) => step.kind === 'type')).toHaveLength(3);
    expect(byId.get('flow-wallet')?.steps.filter((step) => step.kind === 'type')).toHaveLength(3);
    expect(byId.get('flow-checkout')?.playwrightSpec).toContain('const apiRes');
    expect(byId.get('flow-checkout')?.playwrightSpec).not.toContain("request.post('POST ");
  });
});
