import { CapabilityRouterService } from './capability-router.service';
import { CapabilityManifestBuilderService } from './capability-manifest.builder';
import { ManifestInjectionBuilderService } from './manifest-injection.builder';
import type {
  CapabilityManifest,
  CapabilityManifestEntry,
} from './capability-manifest.types';

// ── Test fixtures ──

function entry(overrides: Partial<CapabilityManifestEntry>): CapabilityManifestEntry {
  return {
    id: 'test.cap',
    internalName: 'test.cap',
    description: 'Does a thing',
    triggers: ['thing'],
    inputs: [],
    outputs: [],
    safetyProfile: {
      level: 'read_only',
      requiresConfirmation: false,
      requiredPermissions: [],
    },
    hiddenFromUser: true,
    category: 'QUERY',
    maturity: 'verified',
    surface: ['dashboard-chat'],
    ...overrides,
  };
}

function manifestWith(capabilities: CapabilityManifestEntry[]): CapabilityManifest {
  return {
    version: 1,
    capabilities,
    obligations: [
      {
        id: 'obligation.test',
        instruction: 'Sempre seja honesto.',
        rationale: 'test obligation',
      },
    ],
  };
}

/** Stub builder returning a fixed manifest so router tests are deterministic. */
function stubBuilder(manifest: CapabilityManifest): CapabilityManifestBuilderService {
  return {
    build: () => manifest,
  } as unknown as CapabilityManifestBuilderService;
}

describe('CapabilityRouterService', () => {
  const wallet = entry({
    id: 'wallet.get_balance',
    internalName: 'wallet.get_balance',
    description: 'Saldo da carteira',
    triggers: ['wallet', 'carteira', 'saldo', 'balance'],
  });
  const products = entry({
    id: 'products.create',
    internalName: 'products.create',
    description: 'Cria um produto',
    triggers: ['products', 'produto', 'criar'],
    category: 'MUTATION_SAFE',
    safetyProfile: {
      level: 'safe_mutation',
      requiresConfirmation: false,
      requiredPermissions: ['workspace:write'],
    },
  });
  const refund = entry({
    id: 'sales.refund',
    internalName: 'sales.refund',
    description: 'Estorna uma venda',
    triggers: ['refund', 'estorno', 'estornar'],
    category: 'MUTATION_SENSITIVE',
    safetyProfile: {
      level: 'sensitive_mutation',
      requiresConfirmation: true,
      requiredPermissions: ['billing:write'],
    },
  });
  const deprecated = entry({
    id: 'legacy.get_analytics',
    internalName: 'legacy.get_analytics',
    triggers: ['analytics', 'metricas'],
    maturity: 'deprecated',
  });
  const otherSurface = entry({
    id: 'guest.hello',
    internalName: 'guest.hello',
    triggers: ['hello'],
    surface: ['guest-chat'],
  });

  function router(...capabilities: CapabilityManifestEntry[]): CapabilityRouterService {
    return new CapabilityRouterService(stubBuilder(manifestWith(capabilities)));
  }

  it('selects only capabilities whose triggers match the message', () => {
    const result = router(wallet, products).select('qual o meu saldo na carteira?', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    expect(result.capabilities.map((c) => c.id)).toEqual(['wallet.get_balance']);
  });

  it('always carries the mandatory obligations', () => {
    const result = router(wallet).select('oi', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    expect(result.obligations.map((o) => o.id)).toEqual(['obligation.test']);
  });

  it('never returns the whole manifest — respects maxCapabilities', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      entry({
        id: `cap.${i}`,
        internalName: `cap.${i}`,
        triggers: ['common'],
      }),
    );
    const result = router(...many).select('common common common', {
      surface: 'dashboard-chat',
      permissions: ['*'],
      maxCapabilities: 5,
    });
    expect(result.capabilities).toHaveLength(5);
  });

  it('scopes out capabilities on a different surface', () => {
    const result = router(wallet, otherSurface).select('hello saldo', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    expect(result.capabilities.map((c) => c.id)).toEqual(['wallet.get_balance']);
  });

  it('scopes out capabilities the actor lacks permission for', () => {
    const result = router(products).select('criar produto', {
      surface: 'dashboard-chat',
      permissions: [], // no workspace:write
    });
    expect(result.capabilities).toHaveLength(0);
  });

  it('includes a permission-gated capability when the actor has the permission', () => {
    const result = router(products).select('criar produto', {
      surface: 'dashboard-chat',
      permissions: ['workspace:write'],
    });
    expect(result.capabilities.map((c) => c.id)).toEqual(['products.create']);
  });

  it('drops deprecated/blocked capabilities even when triggers match', () => {
    const result = router(deprecated).select('analytics', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    expect(result.capabilities).toHaveLength(0);
  });

  it('keeps a read-only fallback floor when nothing matches', () => {
    const result = router(wallet, refund).select('xyzzy nonsense', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    // Only read-only wallet survives the fallback; sensitive refund is excluded.
    expect(result.capabilities.map((c) => c.id)).toEqual(['wallet.get_balance']);
  });

  it('orders matches by trigger-overlap score then id', () => {
    const a = entry({
      id: 'a.cap',
      internalName: 'a.cap',
      triggers: ['alpha'],
    });
    const b = entry({
      id: 'b.cap',
      internalName: 'b.cap',
      triggers: ['alpha', 'beta'],
    });
    const result = router(a, b).select('alpha beta', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    // b has 2 trigger hits, a has 1 → b first.
    expect(result.capabilities.map((c) => c.id)).toEqual(['b.cap', 'a.cap']);
  });
});

describe('CapabilityManifestBuilderService (derivation)', () => {
  // Minimal fake registry exposing only list() — the builder's sole dependency.
  function builderWith(
    definitions: ReadonlyArray<Record<string, unknown>>,
  ): CapabilityManifestBuilderService {
    const registry = {
      list: () => definitions,
    } as unknown as Parameters<
      typeof CapabilityManifestBuilderService.prototype.constructor
    >[0];
    return new CapabilityManifestBuilderService(
      registry as ConstructorParameters<typeof CapabilityManifestBuilderService>[0],
    );
  }

  it('marks every entry hiddenFromUser and derives a safety level', () => {
    const builder = builderWith([
      {
        id: 'billing.change_plan',
        title: 'Mudar plano',
        description: 'DEPRECATED — use billing.change_plan',
        category: 'MUTATION_SENSITIVE',
        tier: 0,
        requiresConfirmation: true,
        requiredPermissions: ['billing:write'],
        inputSchema: [{ key: 'plan', type: 'string', label: 'Plano', required: true }],
        domainService: 'BillingService.changePlan',
        emits: ['billing.plan_changed'],
        surface: ['dashboard-chat'],
        maturity: 'deprecated',
      },
    ]);
    const manifest = builder.build();
    const entryOut = manifest.capabilities[0];
    expect(entryOut).toBeDefined();
    if (!entryOut) {
      return;
    }
    expect(entryOut.hiddenFromUser).toBe(true);
    expect(entryOut.internalName).toBe('billing.change_plan');
    expect(entryOut.safetyProfile.level).toBe('sensitive_mutation');
    expect(entryOut.safetyProfile.requiresConfirmation).toBe(true);
    // DEPRECATED marker stripped from description.
    expect(entryOut.description.toLowerCase()).not.toContain('deprecated');
    // Triggers derived from id/title/labels.
    expect(entryOut.triggers).toContain('billing');
    expect(entryOut.triggers).toContain('plano');
  });
});

describe('ManifestInjectionBuilderService (hidden-from-user enforcement)', () => {
  const wallet = entry({
    id: 'wallet.get_balance',
    internalName: 'wallet.get_balance',
    description: 'Saldo da carteira',
    triggers: ['saldo', 'carteira'],
  });

  function injection(): ManifestInjectionBuilderService {
    const router = new CapabilityRouterService(stubBuilder(manifestWith([wallet])));
    return new ManifestInjectionBuilderService(router);
  }

  it('assembles a fenced, internal manifest text carrying the internalName', () => {
    const result = injection().assemble('qual meu saldo', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    expect(result.text).toContain('wallet.get_balance');
    expect(result.internalNames).toContain('wallet.get_balance');
    expect(result.text).toContain('Sempre seja honesto.');
  });

  it('sanitizeForUser strips the fenced block and every internalName', () => {
    const builder = injection();
    const assembled = builder.assemble('qual meu saldo', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    const modelOutput = `${assembled.text}\nSeu saldo é R$ 100. (via wallet.get_balance)`;
    const clean = builder.sanitizeForUser(modelOutput, assembled.internalNames);
    expect(clean).not.toContain('wallet.get_balance');
    expect(clean).not.toContain('<<<KLOEL_CAPABILITY_MANIFEST>>>');
    expect(clean).toContain('Seu saldo é R$ 100.');
  });
});
