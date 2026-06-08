import { TIER_0C_MUTATIONS_CAPABILITIES } from '../capability-registry-v2/partitions/tier-0c-mutations';
import { TIER_0D_FACTORY_HARVEST_CAPABILITIES } from '../capability-registry-v2/partitions/tier-0-self-awareness';
import { CapabilityRouterService } from './capability-router.service';
import { CapabilityManifestBuilderService } from './capability-manifest.builder';
import { ManifestInjectionBuilderService } from './manifest-injection.builder';
import type { CapabilityManifest, CapabilityManifestEntry } from './capability-manifest.types';

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
    dependsOn: [],
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
    } as unknown as Parameters<typeof CapabilityManifestBuilderService.prototype.constructor>[0];
    return new CapabilityManifestBuilderService(registry);
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

  it('derives hidden artifact triggers from the registered renderable artifact capability', () => {
    const artifactDefinition = TIER_0C_MUTATIONS_CAPABILITIES.find(
      (cap) => cap.id === 'artifacts.create_renderable',
    );
    expect(artifactDefinition).toBeDefined();
    if (!artifactDefinition) {
      return;
    }

    const manifest = builderWith([
      artifactDefinition as unknown as Record<string, unknown>,
    ]).build();
    const entryOut = manifest.capabilities[0];
    expect(entryOut).toBeDefined();
    if (!entryOut) {
      return;
    }

    expect(entryOut.hiddenFromUser).toBe(true);
    expect(entryOut.internalName).toBe('artifacts.create_renderable');
    expect(entryOut.safetyProfile.level).toBe('safe_mutation');
    expect(entryOut.safetyProfile.requiresConfirmation).toBe(false);
    expect(entryOut.triggers).toEqual(
      expect.arrayContaining([
        'artifacts',
        'create',
        'renderable',
        'pdf',
        'html',
        'svg',
        'mermaid',
      ]),
    );

    const selected = new CapabilityRouterService(stubBuilder(manifest)).select(
      'crie um PDF e um HTML interativo',
      {
        surface: 'dashboard-chat',
        permissions: [],
      },
    );
    expect(selected.capabilities.map((cap) => cap.id)).toEqual(['artifacts.create_renderable']);
  });

  it('routes harvested factory capabilities from the ECC corpus without exposing skill names', () => {
    const manifest = builderWith(
      TIER_0D_FACTORY_HARVEST_CAPABILITIES as unknown as Record<string, unknown>[],
    ).build();

    expect(manifest.capabilities).toHaveLength(17);
    expect(manifest.capabilities.every((capability) => capability.hiddenFromUser)).toBe(true);
    expect(manifest.capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining([
        'factory.web_research_extraction',
        'factory.browser_qa_click_path',
        'factory.codebase_navigation',
        'factory.validation_loop',
        'factory.security_privacy_review',
        'factory.document_coauthoring',
        'factory.visual_artifact_generation',
        'factory.algorithmic_art_p5',
        'factory.brand_guidelines_visual_identity',
        'factory.canvas_design_poster',
        'factory.workflow_orchestration',
        'factory.data_dashboard_builder',
        'factory.accessibility_performance_review',
        'factory.code_execution_codemod_terminal',
        'factory.localized_external_data',
        'factory.media_animation_builder',
        'factory.api_connector_builder',
      ]),
    );

    const router = new CapabilityRouterService(stubBuilder(manifest));
    const selected = router.select(
      'pesquise na web, extraia dados da pagina, crie um dashboard com charts e valide no browser',
      {
        surface: 'dashboard-chat',
        permissions: [],
        maxCapabilities: 6,
      },
    );

    expect(selected.capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining([
        'factory.web_research_extraction',
        'factory.data_dashboard_builder',
        'factory.browser_qa_click_path',
      ]),
    );

    const creativeSelected = router.select(
      'crie arte generativa em p5.js com seed, aplique guideline de marca e entregue poster PNG/PDF de museum quality',
      {
        surface: 'dashboard-chat',
        permissions: [],
        maxCapabilities: 8,
      },
    );
    expect(creativeSelected.capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining([
        'factory.algorithmic_art_p5',
        'factory.brand_guidelines_visual_identity',
        'factory.canvas_design_poster',
        'factory.visual_artifact_generation',
      ]),
    );

    const fullManifest = builderWith([
      ...(TIER_0C_MUTATIONS_CAPABILITIES as unknown as Record<string, unknown>[]),
      ...(TIER_0D_FACTORY_HARVEST_CAPABILITIES as unknown as Record<string, unknown>[]),
    ]).build();
    const fullRouter = new CapabilityRouterService(stubBuilder(fullManifest));
    const p5Selected = fullRouter.select(
      'crie arte generativa em p5.js com seed e fluxo de particulas',
      {
        surface: 'dashboard-chat',
        permissions: [],
        maxCapabilities: 8,
      },
    );
    expect(p5Selected.capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining(['factory.algorithmic_art_p5', 'artifacts.create_renderable']),
    );

    const p5Injection = new ManifestInjectionBuilderService(fullRouter).assemble(
      'crie arte generativa em p5.js com seed e fluxo de particulas',
      {
        surface: 'dashboard-chat',
        permissions: [],
        maxCapabilities: 8,
      },
    );
    expect(p5Injection.text).toContain('FORMATO DE ENTREGA PARA ARQUIVOS BAIXÁVEIS');

    const toolGatewaySelected = router.select(
      'execute um script no terminal, aplique codemod, monte mapa com clima e placar e gere GIF animado',
      {
        surface: 'dashboard-chat',
        permissions: [],
        maxCapabilities: 8,
      },
    );
    expect(toolGatewaySelected.capabilities.map((capability) => capability.id)).toEqual(
      expect.arrayContaining([
        'factory.code_execution_codemod_terminal',
        'factory.localized_external_data',
        'factory.media_animation_builder',
      ]),
    );

    const injectionBuilder = new ManifestInjectionBuilderService(router);
    const injection = injectionBuilder.assemble(
      'audite acessibilidade performance e gere um relatorio PDF',
      {
        surface: 'dashboard-chat',
        permissions: [],
        maxCapabilities: 6,
      },
    );
    const leaked = `${injection.text}\nResposta publica via factory.accessibility_performance_review`;
    const clean = injectionBuilder.sanitizeForUser(leaked, injection.internalNames);

    expect(injection.internalNames).toEqual(
      expect.arrayContaining([
        'factory.accessibility_performance_review',
        'factory.document_coauthoring',
      ]),
    );
    expect(clean).not.toContain('factory.');
    expect(clean).not.toContain('<<<KLOEL_CAPABILITY_MANIFEST>>>');
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

  it('adds a materializable file format rule only when renderable artifacts are selected', () => {
    const artifact = entry({
      id: 'artifacts.create_renderable',
      internalName: 'artifacts.create_renderable',
      description: 'Cria entregáveis reais no chat',
      triggers: ['crie', 'arquivo', 'baixável', 'tabela.md', 'contador.html'],
      category: 'MUTATION_SAFE',
      safetyProfile: {
        level: 'safe_mutation',
        requiresConfirmation: false,
        requiredPermissions: [],
      },
    });
    const artifactBuilder = new ManifestInjectionBuilderService(
      new CapabilityRouterService(stubBuilder(manifestWith([artifact]))),
    );

    const artifactInjection = artifactBuilder.assemble('crie tabela.md e contador.html baixáveis', {
      surface: 'dashboard-chat',
      permissions: [],
    });
    expect(artifactInjection.text).toContain('FORMATO DE ENTREGA PARA ARQUIVOS BAIXÁVEIS');
    expect(artifactInjection.text).toContain('Arquivo: nome.ext');
    expect(artifactInjection.text).toContain('blocos nomeados');

    const walletInjection = injection().assemble('qual meu saldo', {
      surface: 'dashboard-chat',
      permissions: ['*'],
    });
    expect(walletInjection.text).not.toContain('FORMATO DE ENTREGA PARA ARQUIVOS BAIXÁVEIS');
  });
});
