import type {
  BackendRoute,
  PulseCodebaseTruth,
  PulseConfig,
  PulseDiscoveredFlowCandidate,
  PulseDiscoveredModule,
  PulseManifest,
  PulseModuleState,
  PulseShellComplexity,
  PulseTruthDivergence,
  PulseTruthPageSummary,
} from './types';
import type { CoreParserData, InteractionChain, PageFunctionalMap } from './functional-map-types';
import { buildFunctionalMap } from './functional-map';

interface ModuleAlias {
  key: string;
  name: string;
  tokens: string[];
}

const MODULE_ALIASES: Record<string, ModuleAlias> = {
  public: { key: 'public', name: 'Public Web', tokens: ['public', 'landing', 'site'] },
  auth: { key: 'auth', name: 'Auth', tokens: ['auth', 'login', 'register', 'session'] },
  onboarding: { key: 'onboarding', name: 'Onboarding', tokens: ['onboarding'] },
  checkout: {
    key: 'checkout',
    name: 'Checkout',
    tokens: ['checkout', 'order', 'preview', 'pay', 'boleto', 'pix', 'upsell'],
  },
  account: { key: 'account', name: 'Account', tokens: ['account', 'conta'] },
  analytics: {
    key: 'analytics',
    name: 'Analytics',
    tokens: ['analytics', 'metricas', 'metrics', 'reports', 'dashboard'],
  },
  ads: { key: 'ads', name: 'Ads', tokens: ['ads', 'anuncios', 'rastreamento', 'regras'] },
  autopilot: { key: 'autopilot', name: 'Autopilot', tokens: ['autopilot'] },
  billing: { key: 'billing', name: 'Billing', tokens: ['billing', 'pricing', 'subscription'] },
  campaigns: { key: 'campaigns', name: 'Campaigns', tokens: ['campaigns'] },
  canvas: { key: 'canvas', name: 'Canvas', tokens: ['canvas', 'editor', 'modelos', 'projetos'] },
  wallet: {
    key: 'wallet',
    name: 'Wallet',
    tokens: ['wallet', 'carteira', 'saldo', 'movimentacoes', 'saques', 'extrato', 'antecipacoes'],
  },
  chat: { key: 'chat', name: 'Chat', tokens: ['chat'] },
  cia: { key: 'cia', name: 'CIA/Agent', tokens: ['cia', 'agent', 'assistant', 'conversation'] },
  dashboard: { key: 'dashboard', name: 'Dashboard', tokens: ['dashboard'] },
  tools: { key: 'tools', name: 'Tools', tokens: ['tools', 'ferramentas', 'launchpad'] },
  flows: { key: 'flows', name: 'Flows', tokens: ['flow', 'flows', 'funnels'] },
  followups: { key: 'followups', name: 'Followups', tokens: ['followups'] },
  inbox: { key: 'inbox', name: 'Inbox/Chat', tokens: ['inbox', 'chat', 'conversation'] },
  crm: { key: 'crm', name: 'CRM/Leads', tokens: ['crm', 'leads', 'contacts', 'pipeline'] },
  marketing: {
    key: 'marketing',
    name: 'Marketing',
    tokens: ['marketing', 'email', 'instagram', 'facebook', 'tiktok', 'whatsapp'],
  },
  partnerships: {
    key: 'partnerships',
    name: 'Partnerships',
    tokens: ['partnerships', 'parcerias', 'afiliados', 'colaboradores'],
  },
  payments: { key: 'payments', name: 'Payments', tokens: ['payments', 'payment'] },
  products: {
    key: 'products',
    name: 'Products',
    tokens: ['products', 'produtos', 'product', 'member', 'members', 'area', 'membros'],
  },
  sales: {
    key: 'sales',
    name: 'Sales',
    tokens: ['sales', 'vendas', 'gestao', 'assinaturas', 'fisicos', 'pipeline'],
  },
  scrapers: { key: 'scrapers', name: 'Scrapers', tokens: ['scrapers', 'scraper'] },
  settings: {
    key: 'settings',
    name: 'Settings',
    tokens: ['settings', 'configuracoes', 'kb', 'brain'],
  },
  sites: { key: 'sites', name: 'Sites', tokens: ['sites', 'dominios', 'hospedagem', 'protecao'] },
  video: { key: 'video', name: 'Video/Voice', tokens: ['video', 'voice', 'audio'] },
  webinars: { key: 'webinars', name: 'Webinars', tokens: ['webinars', 'webinarios'] },
  whatsapp: {
    key: 'whatsapp',
    name: 'WhatsApp Core',
    tokens: ['whatsapp', 'message', 'messages', 'catalog', 'session'],
  },
  e2e: { key: 'e2e', name: 'E2E/Internal', tokens: ['e2e', 'internal'] },
  misc: { key: 'misc', name: 'Misc', tokens: ['misc'] },
};

const ROUTE_ROOT_ALIASES: Record<string, keyof typeof MODULE_ALIASES> = {
  '': 'public',
  account: 'account',
  analytics: 'analytics',
  anuncios: 'ads',
  autopilot: 'autopilot',
  billing: 'billing',
  campaigns: 'campaigns',
  canvas: 'canvas',
  carteira: 'wallet',
  chat: 'chat',
  checkout: 'checkout',
  cia: 'cia',
  dashboard: 'dashboard',
  ferramentas: 'tools',
  tools: 'tools',
  flow: 'flows',
  funnels: 'flows',
  followups: 'followups',
  inbox: 'inbox',
  leads: 'crm',
  login: 'auth',
  register: 'auth',
  onboarding: 'onboarding',
  'onboarding-chat': 'onboarding',
  marketing: 'marketing',
  metrics: 'analytics',
  parcerias: 'partnerships',
  payments: 'payments',
  pricing: 'billing',
  products: 'products',
  produtos: 'products',
  sales: 'sales',
  vendas: 'sales',
  scrapers: 'scrapers',
  settings: 'settings',
  sites: 'sites',
  terms: 'public',
  privacy: 'public',
  video: 'video',
  webinarios: 'webinars',
  whatsapp: 'whatsapp',
  pay: 'checkout',
  preview: 'checkout',
  order: 'checkout',
  r: 'checkout',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function getRouteSegments(route: string): string[] {
  return route
    .split('/')
    .filter(Boolean)
    .filter((segment) => !segment.startsWith(':'));
}

function isUserFacingGroup(group: string): boolean {
  return group === 'main' || group === 'public' || group === 'checkout';
}

function getModuleAliasForPage(route: string, group: string): ModuleAlias {
  if (group === 'e2e') {
    return MODULE_ALIASES.e2e;
  }

  const segments = getRouteSegments(route);
  const first = segments[0] || '';
  if (group === 'checkout') {
    return MODULE_ALIASES.checkout;
  }

  if (first === '' && group === 'public') {
    return MODULE_ALIASES.public;
  }
  return MODULE_ALIASES[ROUTE_ROOT_ALIASES[first] || 'misc'];
}

function getRouteRoot(route: string, group: string): string {
  const segments = getRouteSegments(route);
  if (segments.length === 0) {
    return group === 'public' ? '/' : group;
  }
  return segments[0];
}

function determineShellComplexity(page: PageFunctionalMap): PulseShellComplexity {
  if (
    page.componentFiles.length >= 8 ||
    page.totalInteractions >= 15 ||
    (page.componentFiles.length >= 5 && page.dataSources.length >= 2)
  ) {
    return 'rich';
  }
  if (
    page.componentFiles.length >= 4 ||
    page.totalInteractions >= 6 ||
    page.dataSources.length >= 1
  ) {
    return 'medium';
  }
  return 'light';
}

function buildPageSummary(page: PageFunctionalMap): PulseTruthPageSummary {
  const moduleAlias = getModuleAliasForPage(page.route, page.group);
  const apiBoundInteractions = page.interactions.filter((item) => !!item.apiCall).length;
  const backendBoundInteractions = page.interactions.filter((item) => !!item.backendRoute).length;
  const persistedInteractions = page.interactions.filter(
    (item) => item.prismaModels.length > 0,
  ).length;
  const backedDataSources = page.dataSources.filter((item) => item.hasBackendRoute).length;

  return {
    route: page.route,
    group: page.group,
    moduleKey: moduleAlias.key,
    moduleName: moduleAlias.name,
    shellComplexity: determineShellComplexity(page),
    totalInteractions: page.totalInteractions,
    functioningInteractions: page.counts.FUNCIONA || 0,
    facadeInteractions: page.counts.FACHADA || 0,
    brokenInteractions: page.counts.QUEBRADO || 0,
    incompleteInteractions: page.counts.INCOMPLETO || 0,
    absentInteractions: page.counts.AUSENTE || 0,
    apiBoundInteractions,
    backendBoundInteractions,
    persistedInteractions,
    totalDataSources: page.dataSources.length,
    backedDataSources,
  };
}

function scoreDeclaredMatch(tokensA: string[], tokensB: string[]): number {
  const setB = new Set(tokensB);
  return tokensA.filter((token) => setB.has(token)).length;
}

function matchDeclaredModule(
  module: Omit<PulseDiscoveredModule, 'declaredModule' | 'state' | 'notes'>,
  manifest: PulseManifest | null,
): string | null {
  if (!manifest) {
    return null;
  }

  const candidateTokens = unique([
    ...(MODULE_ALIASES[module.key]?.tokens || []),
    ...tokenize(module.name),
    ...module.routeRoots.flatMap(tokenize),
  ]);

  let best: { name: string; score: number } | null = null;

  for (const entry of manifest.modules) {
    if (module.userFacing && entry.state === 'INTERNAL') {
      continue;
    }
    if (!module.userFacing && entry.state !== 'INTERNAL') {
      continue;
    }

    const entryTokens = unique(tokenize(entry.name));
    const exactName = normalizeText(entry.name) === normalizeText(module.name);
    const score =
      (exactName ? 100 : 0) +
      (entryTokens.includes(module.key) ? 10 : 0) +
      scoreDeclaredMatch(candidateTokens, entryTokens);

    if (score > (best?.score || 0)) {
      best = { name: entry.name, score };
    }
  }

  return best && best.score >= 10 ? best.name : null;
}

function classifyModuleState(
  module: Omit<PulseDiscoveredModule, 'declaredModule' | 'state' | 'notes'>,
): PulseModuleState {
  if (!module.userFacing) {
    return 'INTERNAL';
  }

  const total = Math.max(1, module.totalInteractions);
  const failureLike =
    module.facadeInteractions + module.brokenInteractions + module.absentInteractions;
  const connected =
    module.backendBoundInteractions + module.backedDataSources + module.persistedInteractions;

  if (module.shellComplexity === 'rich' && connected === 0) {
    return 'SHELL_ONLY';
  }
  if (module.facadeInteractions > Math.max(module.functioningInteractions, 0) && connected === 0) {
    return 'MOCKED';
  }
  if (
    module.brokenInteractions + module.absentInteractions >
      module.functioningInteractions + module.incompleteInteractions &&
    connected <= 1
  ) {
    return 'BROKEN';
  }
  if (
    module.functioningInteractions >= Math.max(3, Math.round(total * 0.6)) &&
    failureLike <= Math.max(2, Math.round(total * 0.25)) &&
    connected > 0
  ) {
    return 'READY';
  }
  if (
    module.shellComplexity !== 'light' &&
    module.persistedInteractions === 0 &&
    module.backedDataSources === 0 &&
    module.backendBoundInteractions === 0
  ) {
    return 'SHELL_ONLY';
  }
  return 'PARTIAL';
}

function summarizeModule(
  module: Omit<PulseDiscoveredModule, 'declaredModule' | 'state' | 'notes'>,
  state: PulseModuleState,
  declaredModule: string | null,
): string {
  const pieces = [
    `${module.pageCount} page(s)`,
    `${module.totalInteractions} interaction(s)`,
    `${module.backendBoundInteractions} backend-bound`,
    `${module.persistedInteractions} persisted`,
    `${module.backedDataSources}/${module.totalDataSources} backed data source(s)`,
    `shell=${module.shellComplexity}`,
  ];
  if (declaredModule) {
    pieces.push(`declared as "${declaredModule}"`);
  }
  if (state === 'SHELL_ONLY') {
    pieces.push('rich frontend shell without persistence evidence');
  }
  if (state === 'MOCKED') {
    pieces.push('facade/local-state signals dominate');
  }
  return pieces.join(', ');
}

function isLikelyMutation(interaction: InteractionChain): boolean {
  if (!interaction.apiCall) {
    return false;
  }
  if (interaction.apiCall.method && interaction.apiCall.method.toUpperCase() !== 'GET') {
    return true;
  }
  return /\b(save|create|update|delete|remove|add|send|submit|pay|upload|sync|connect|approve|withdraw|checkout)\b/i.test(
    `${interaction.elementLabel} ${interaction.handler || ''} ${interaction.apiCall.endpoint}`,
  );
}

function matchDeclaredFlow(
  candidate: Omit<PulseDiscoveredFlowCandidate, 'declaredFlow'>,
  manifest: PulseManifest | null,
): string | null {
  if (!manifest) {
    return null;
  }

  const candidateTokens = unique([
    ...(MODULE_ALIASES[candidate.moduleKey]?.tokens || []),
    ...tokenize(candidate.moduleName),
    ...tokenize(candidate.pageRoute),
    ...tokenize(candidate.elementLabel),
    ...tokenize(candidate.endpoint),
    ...tokenize(candidate.backendRoute || ''),
  ]);

  let best: { id: string; score: number } | null = null;

  for (const spec of manifest.flowSpecs) {
    const specTokens = unique([
      ...tokenize(spec.id),
      ...tokenize(spec.notes),
      ...tokenize(spec.surface),
    ]);
    const score = scoreDeclaredMatch(candidateTokens, specTokens);
    if (score > (best?.score || 0)) {
      best = { id: spec.id, score };
    }
  }

  return best && best.score >= 2 ? best.id : null;
}

function buildDiscoveredFlows(
  pages: PageFunctionalMap[],
  manifest: PulseManifest | null,
): PulseDiscoveredFlowCandidate[] {
  const byId = new Map<string, PulseDiscoveredFlowCandidate>();

  for (const page of pages) {
    if (!isUserFacingGroup(page.group)) {
      continue;
    }
    const moduleAlias = getModuleAliasForPage(page.route, page.group);

    for (const interaction of page.interactions) {
      if (!isLikelyMutation(interaction) || !interaction.apiCall) {
        continue;
      }

      const endpoint = interaction.backendRoute?.fullPath || interaction.apiCall.endpoint;
      const flowId = slugify(`${moduleAlias.key}-${interaction.apiCall.method}-${endpoint}`);
      if (!flowId) {
        continue;
      }

      const current = byId.get(flowId);
      const base = {
        id: flowId,
        moduleKey: moduleAlias.key,
        moduleName: moduleAlias.name,
        pageRoute: page.route,
        elementLabel: interaction.elementLabel,
        httpMethod: interaction.apiCall.method,
        endpoint,
        backendRoute: interaction.backendRoute?.fullPath || null,
        connected: !!interaction.backendRoute,
        persistent: interaction.prismaModels.length > 0,
      };

      if (current) {
        current.connected = current.connected || base.connected;
        current.persistent = current.persistent || base.persistent;
        if (current.elementLabel === '(sem texto)' && base.elementLabel !== '(sem texto)') {
          current.elementLabel = base.elementLabel;
        }
        continue;
      }

      byId.set(flowId, {
        ...base,
        declaredFlow: null,
      });
    }
  }

  const flows = [...byId.values()];
  for (const candidate of flows) {
    candidate.declaredFlow = matchDeclaredFlow(candidate, manifest);
  }

  return flows.sort((a, b) => a.id.localeCompare(b.id));
}

function inferBackendCapabilityWithoutFrontendSurface(
  backendRoutes: BackendRoute[],
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

    const root = segments[0];
    if (!root) {
      continue;
    }
    const knownAliasKey = ROUTE_ROOT_ALIASES[root];
    const moduleAlias = knownAliasKey ? MODULE_ALIASES[knownAliasKey] : null;
    const key = moduleAlias?.key || root;
    const name = moduleAlias?.name || titleCase(root);
    const current = counts.get(key);
    counts.set(key, {
      name,
      count: (current?.count || 0) + 1,
    });
  }

  return [...counts.entries()]
    .filter(([key, value]) => key !== 'misc' && value.count >= 3 && !discoveredKeys.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .map(([, value]) => `${value.name} (${value.count} routes)`);
}

function buildDivergence(
  pages: PulseTruthPageSummary[],
  discoveredModules: PulseDiscoveredModule[],
  discoveredFlows: PulseDiscoveredFlowCandidate[],
  manifest: PulseManifest | null,
  coreData: CoreParserData,
): PulseTruthDivergence {
  const discoveredDeclaredModules = new Set(
    discoveredModules
      .map((item) => item.declaredModule)
      .filter((value): value is string => Boolean(value)),
  );

  const declaredNotDiscovered = manifest
    ? manifest.modules
        .filter((entry) => !discoveredDeclaredModules.has(entry.name))
        .map((entry) => entry.name)
        .sort()
    : [];

  const discoveredNotDeclared = discoveredModules
    .filter((item) => item.userFacing && !item.declaredModule)
    .map((item) => item.name)
    .sort();

  const declaredButInternal = discoveredModules
    .filter((item) => item.declaredModule && item.state === 'INTERNAL')
    .map((item) => item.declaredModule as string)
    .sort();

  const frontendSurfaceWithoutBackendSupport = pages
    .filter(
      (page) =>
        page.shellComplexity !== 'light' &&
        ((page.apiBoundInteractions > 0 && page.backendBoundInteractions === 0) ||
          (page.totalDataSources > 0 && page.backedDataSources === 0)),
    )
    .map(
      (page) =>
        `${page.route} (api=${page.apiBoundInteractions}, backedData=${page.backedDataSources}/${page.totalDataSources})`,
    )
    .sort();

  const shellWithoutPersistence = pages
    .filter(
      (page) =>
        page.shellComplexity !== 'light' &&
        page.totalInteractions >= 5 &&
        page.persistedInteractions === 0 &&
        page.backedDataSources === 0,
    )
    .map((page) => `${page.route} (${page.shellComplexity} shell)`)
    .sort();

  const flowCandidatesWithoutOracle = discoveredFlows
    .filter((item) => (item.connected || item.persistent) && !item.declaredFlow)
    .map((item) => `${item.id} -> ${item.pageRoute}`)
    .sort();

  const backendCapabilityWithoutFrontendSurface = inferBackendCapabilityWithoutFrontendSurface(
    coreData.backendRoutes,
    discoveredModules,
  );

  const blockerCount =
    declaredNotDiscovered.length +
    discoveredNotDeclared.length +
    flowCandidatesWithoutOracle.length;

  const warningCount =
    declaredButInternal.length +
    frontendSurfaceWithoutBackendSupport.length +
    backendCapabilityWithoutFrontendSurface.length +
    shellWithoutPersistence.length;

  return {
    declaredNotDiscovered,
    discoveredNotDeclared,
    declaredButInternal,
    frontendSurfaceWithoutBackendSupport,
    backendCapabilityWithoutFrontendSurface,
    shellWithoutPersistence,
    flowCandidatesWithoutOracle,
    blockerCount,
    warningCount,
  };
}

/** Extract codebase truth. */
export function extractCodebaseTruth(
  config: PulseConfig,
  coreData: CoreParserData,
  manifest: PulseManifest | null,
): PulseCodebaseTruth {
  const fmap = buildFunctionalMap(config, coreData);
  const pageSummaries = fmap.pages.map(buildPageSummary);
  const buckets = new Map<
    string,
    Omit<PulseDiscoveredModule, 'declaredModule' | 'state' | 'notes'>
  >();

  for (const page of pageSummaries) {
    const bucket = buckets.get(page.moduleKey) || {
      key: page.moduleKey,
      name: page.moduleName,
      routeRoots: [],
      groups: [],
      userFacing: false,
      shellComplexity: page.shellComplexity,
      pageCount: 0,
      totalInteractions: 0,
      functioningInteractions: 0,
      facadeInteractions: 0,
      brokenInteractions: 0,
      incompleteInteractions: 0,
      absentInteractions: 0,
      apiBoundInteractions: 0,
      backendBoundInteractions: 0,
      persistedInteractions: 0,
      totalDataSources: 0,
      backedDataSources: 0,
    };

    bucket.routeRoots = unique([...bucket.routeRoots, getRouteRoot(page.route, page.group)]);
    bucket.groups = unique([...bucket.groups, page.group]);
    bucket.userFacing = bucket.userFacing || isUserFacingGroup(page.group);
    bucket.pageCount += 1;
    bucket.totalInteractions += page.totalInteractions;
    bucket.functioningInteractions += page.functioningInteractions;
    bucket.facadeInteractions += page.facadeInteractions;
    bucket.brokenInteractions += page.brokenInteractions;
    bucket.incompleteInteractions += page.incompleteInteractions;
    bucket.absentInteractions += page.absentInteractions;
    bucket.apiBoundInteractions += page.apiBoundInteractions;
    bucket.backendBoundInteractions += page.backendBoundInteractions;
    bucket.persistedInteractions += page.persistedInteractions;
    bucket.totalDataSources += page.totalDataSources;
    bucket.backedDataSources += page.backedDataSources;
    if (
      page.shellComplexity === 'rich' ||
      (page.shellComplexity === 'medium' && bucket.shellComplexity === 'light')
    ) {
      bucket.shellComplexity = page.shellComplexity;
    }

    buckets.set(page.moduleKey, bucket);
  }

  const discoveredModules = [...buckets.values()]
    .map<PulseDiscoveredModule>((bucket) => {
      const declaredModule = matchDeclaredModule(bucket, manifest);
      const state = classifyModuleState(bucket);
      return {
        ...bucket,
        declaredModule,
        state,
        notes: summarizeModule(bucket, state, declaredModule),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const discoveredFlows = buildDiscoveredFlows(fmap.pages, manifest);
  const divergence = buildDivergence(
    pageSummaries,
    discoveredModules,
    discoveredFlows,
    manifest,
    coreData,
  );

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPages: pageSummaries.length,
      userFacingPages: pageSummaries.filter((page) => isUserFacingGroup(page.group)).length,
      discoveredModules: discoveredModules.length,
      discoveredFlows: discoveredFlows.length,
      blockerCount: divergence.blockerCount,
      warningCount: divergence.warningCount,
    },
    pages: pageSummaries,
    discoveredModules,
    discoveredFlows,
    divergence,
  };
}
