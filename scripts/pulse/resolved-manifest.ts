import type {
  PulseCodebaseTruth,
  PulseDiscoveredFlowCandidate,
  PulseManifest,
  PulseManifestFlowSpec,
  PulseManifestModule,
  PulseResolvedFlowGroup,
  PulseResolvedFlowKind,
  PulseResolvedManifest,
  PulseResolvedModule,
} from './types';

interface SemanticFlowDescriptor {
  id: string;
  canonicalName: string;
  flowKind: PulseResolvedFlowKind;
  aliases: string[];
}

const CRITICAL_MODULE_DEFAULTS = new Set([
  'auth',
  'autopilot',
  'billing',
  'chat',
  'checkout',
  'cia',
  'flows',
  'inbox',
  'products',
  'wallet',
  'whatsapp',
]);

const LEGACY_MODULE_CANDIDATES: Record<string, string[]> = {
  webinars: ['Webinarios'],
  tools: ['Launch'],
  settings: ['KYC'],
  products: ['Member Area'],
  analytics: ['Reports'],
  crm: ['Pipeline'],
  sites: ['Public API'],
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-');
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getActiveModules(manifest: PulseManifest | null): PulseManifestModule[] {
  return manifest?.modules || [];
}

function getLegacyModules(manifest: PulseManifest | null): PulseManifestModule[] {
  return manifest?.legacyModules || [];
}

function findManifestModule(
  entries: PulseManifestModule[],
  candidates: string[],
): PulseManifestModule | null {
  const normalizedCandidates = candidates.map(normalizeText).filter(Boolean);
  for (const entry of entries) {
    const normalizedEntry = normalizeText(entry.name);
    if (normalizedCandidates.includes(normalizedEntry)) {
      return entry;
    }
  }
  return null;
}

function matchesOverride(candidate: string, values: string[]): boolean {
  const normalized = normalizeText(candidate);
  return values.some((value) => normalizeText(value) === normalized);
}

function buildModuleCandidates(
  module: PulseCodebaseTruth['discoveredModules'][number],
  manifest: PulseManifest | null,
): string[] {
  const overrides = manifest?.overrides || {};
  const explicitAlias =
    overrides.moduleAliases?.[module.key] || overrides.moduleAliases?.[module.name] || null;

  return unique(
    [
      module.name,
      module.declaredModule || '',
      explicitAlias || '',
      titleCase(module.key),
      ...module.routeRoots.map(titleCase),
      ...(LEGACY_MODULE_CANDIDATES[module.key] || []),
    ].filter(Boolean),
  );
}

function buildModuleResolution(
  manifest: PulseManifest | null,
  module: PulseCodebaseTruth['discoveredModules'][number],
): PulseResolvedModule {
  const overrides = manifest?.overrides || {};
  const candidates = buildModuleCandidates(module, manifest);
  const manualModule = findManifestModule(getActiveModules(manifest), candidates);
  const legacyModule = findManifestModule(getLegacyModules(manifest), candidates);
  const excluded =
    matchesOverride(module.key, overrides.excludedModules || []) ||
    matchesOverride(module.name, overrides.excludedModules || []);
  const criticalOverride =
    matchesOverride(module.key, overrides.criticalModules || []) ||
    matchesOverride(module.name, overrides.criticalModules || []);
  const internalOverride =
    matchesOverride(module.key, overrides.internalModules || []) ||
    matchesOverride(module.name, overrides.internalModules || []);

  const moduleKind = internalOverride || !module.userFacing ? 'internal' : 'user_facing';
  const resolution = excluded ? 'excluded' : manualModule ? 'matched' : 'derived';
  const critical =
    !excluded &&
    (criticalOverride ||
      Boolean(manualModule?.critical) ||
      (moduleKind === 'user_facing' && CRITICAL_MODULE_DEFAULTS.has(module.key)));
  const aliases = unique(
    [
      module.name,
      manualModule?.name || '',
      legacyModule?.name || '',
      ...module.routeRoots.map(titleCase),
    ].filter(Boolean),
  );

  let notes = module.notes;
  if (manualModule) {
    notes = `${notes}; source="${manualModule.name}".`;
  } else if (legacyModule) {
    notes = `${notes}; legacy source="${legacyModule.name}".`;
  } else if (resolution === 'derived') {
    notes = `${notes}; derived directly from codebase truth.`;
  }
  if (resolution === 'excluded') {
    notes = `${notes}; excluded by manifest override.`;
  }

  return {
    key: module.key,
    name: module.name,
    canonicalName: module.name,
    aliases,
    routeRoots: module.routeRoots,
    groups: module.groups,
    moduleKind,
    userFacing: moduleKind === 'user_facing',
    shellComplexity: module.shellComplexity,
    state: moduleKind === 'internal' ? 'INTERNAL' : module.state,
    critical,
    resolution,
    sourceModule: manualModule?.name || null,
    legacySource: legacyModule?.name || null,
    pageCount: module.pageCount,
    totalInteractions: module.totalInteractions,
    backendBoundInteractions: module.backendBoundInteractions,
    persistedInteractions: module.persistedInteractions,
    backedDataSources: module.backedDataSources,
    notes,
  };
}

function getPath(flow: PulseDiscoveredFlowCandidate): string {
  return (flow.backendRoute || flow.endpoint || '').toLowerCase();
}

function getHaystack(flow: PulseDiscoveredFlowCandidate): string {
  return normalizeText(
    [
      flow.id,
      flow.moduleKey,
      flow.moduleName,
      flow.pageRoute,
      flow.elementLabel,
      flow.endpoint,
      flow.backendRoute || '',
    ].join(' '),
  );
}

function inferAction(flow: PulseDiscoveredFlowCandidate): string {
  const haystack = getHaystack(flow);
  if (haystack.includes('reply')) {
    return 'reply';
  }
  if (haystack.includes('send')) {
    return 'send';
  }
  if (haystack.includes('toggle')) {
    return 'toggle';
  }
  if (haystack.includes('connect')) {
    return 'connect';
  }
  if (haystack.includes('default')) {
    return 'default';
  }
  if (haystack.includes('approve')) {
    return 'approve';
  }
  if (haystack.includes('start')) {
    return 'start';
  }
  if (haystack.includes('sync')) {
    return 'sync';
  }
  if (haystack.includes('generate')) {
    return 'generate';
  }
  if (haystack.includes('save')) {
    return 'save';
  }

  const method = flow.httpMethod.toUpperCase();
  if (method === 'DELETE') {
    return 'delete';
  }
  if (method === 'PUT' || method === 'PATCH') {
    return 'update';
  }
  return 'create';
}

function getEndpointSegments(flow: PulseDiscoveredFlowCandidate): string[] {
  const source = getPath(flow)
    .replace(/^\/+/g, '')
    .split('/')
    .map((part) => part.replace(/^:+/, ''))
    .filter(Boolean)
    .filter((part) => !['api', 'v1', 'kloel'].includes(part));

  return source.filter(
    (part) =>
      !/^(id|workspaceid|orderid|planid|productid|campaignid|conversationid|paymentmethodid|studentid|phone|tag|slug)$/i.test(
        part,
      ),
  );
}

function inferResourceFamily(flow: PulseDiscoveredFlowCandidate): string {
  const segments = getEndpointSegments(flow)
    .filter((segment) => normalizeText(segment) !== flow.moduleKey)
    .filter(
      (segment) =>
        ![
          'send',
          'reply',
          'toggle',
          'connect',
          'default',
          'approve',
          'start',
          'sync',
          'generate',
          'save',
        ].includes(normalizeText(segment)),
    );
  const selected = segments.slice(0, 2).map((segment) => slugify(segment));
  return selected.length > 0 ? selected.join('-') : 'flow';
}

function sharedCapability(flow: PulseDiscoveredFlowCandidate): SemanticFlowDescriptor | null {
  const path = getPath(flow);
  const haystack = getHaystack(flow);

  if (path.includes('/auth/oauth/')) {
    return {
      id: 'shared-auth-oauth',
      canonicalName: 'Shared Auth OAuth',
      flowKind: 'shared_capability',
      aliases: ['auth-oauth', flow.id],
    };
  }

  if (path.includes('/auth/register')) {
    return {
      id: 'shared-auth-registration',
      canonicalName: 'Shared Auth Registration',
      flowKind: 'shared_capability',
      aliases: ['auth-register', flow.id],
    };
  }

  if (path.includes('forgot-password') || path.includes('reset-password')) {
    return {
      id: 'shared-auth-recovery',
      canonicalName: 'Shared Auth Recovery',
      flowKind: 'shared_capability',
      aliases: ['auth-recovery', flow.id],
    };
  }

  if (path.includes('/crm/deals/')) {
    return {
      id: 'shared-crm-deal-management',
      canonicalName: 'Shared CRM Deal Management',
      flowKind: 'shared_capability',
      aliases: ['crm-deals', flow.id],
    };
  }

  if (path.includes('/crm/contacts/')) {
    return {
      id: 'shared-crm-contact-management',
      canonicalName: 'Shared CRM Contact Management',
      flowKind: 'shared_capability',
      aliases: ['crm-contacts', flow.id],
    };
  }

  if (path.includes('/member-areas/') && path.includes('/students')) {
    return {
      id: 'shared-member-area-student-management',
      canonicalName: 'Shared Member Area Student Management',
      flowKind: 'shared_capability',
      aliases: ['member-area-students', flow.id],
    };
  }

  if (path.includes('/member-areas')) {
    return {
      id: 'shared-member-area-management',
      canonicalName: 'Shared Member Area Management',
      flowKind: 'shared_capability',
      aliases: ['member-area', flow.id],
    };
  }

  if (path.includes('/whatsapp-api/session/')) {
    return {
      id: 'shared-whatsapp-session-management',
      canonicalName: 'Shared WhatsApp Session Management',
      flowKind: 'shared_capability',
      aliases: ['whatsapp-session', flow.id],
    };
  }

  if (
    (path.includes('/inbox/conversations/') && path.includes('/reply')) ||
    path.includes('/meta/instagram/messages/send') ||
    path.includes('/marketing/email/send') ||
    (haystack.includes('whatsapp') &&
      /(send|reply|message)/.test(haystack) &&
      !path.includes('/crm/deals/'))
  ) {
    return {
      id: 'shared-message-send',
      canonicalName: 'Shared Message Send',
      flowKind: 'shared_capability',
      aliases: ['message-send', flow.id],
    };
  }

  if (
    (path.includes('/kloel/payment/') && path.includes('/create')) ||
    (path.includes('/external-payments/') && path.includes('/platform')) ||
    path.includes('/webhook/payment/stripe')
  ) {
    return {
      id: 'shared-payment-creation',
      canonicalName: 'Shared Payment Creation',
      flowKind: 'shared_capability',
      aliases: ['payment-create', flow.id],
    };
  }

  if (path.includes('/billing/payment-methods/')) {
    return {
      id: 'shared-billing-payment-method-management',
      canonicalName: 'Shared Billing Payment Method Management',
      flowKind: 'shared_capability',
      aliases: ['billing-payment-methods', flow.id],
    };
  }

  if (
    (path.includes('/stripe/') && path.includes('/connect')) ||
    path.includes('/meta/auth/disconnect')
  ) {
    return {
      id: 'shared-provider-connection-management',
      canonicalName: 'Shared Provider Connection Management',
      flowKind: 'shared_capability',
      aliases: ['provider-connect', flow.id],
    };
  }

  if (path.includes('/campaign/start')) {
    return {
      id: 'shared-campaign-execution',
      canonicalName: 'Shared Campaign Execution',
      flowKind: 'shared_capability',
      aliases: ['campaign-start', flow.id],
    };
  }

  if (path.includes('/kyc/') || path.includes('/api/kyc/')) {
    return {
      id: 'shared-kyc-management',
      canonicalName: 'Shared KYC Management',
      flowKind: 'shared_capability',
      aliases: ['kyc-management', flow.id],
    };
  }

  return null;
}

function isLegacyNoise(flow: PulseDiscoveredFlowCandidate): boolean {
  const haystack = getHaystack(flow);
  const path = getPath(flow);
  return (
    haystack.includes('fontfamily') ||
    haystack.includes('fontsize') ||
    haystack.includes('borderradius') ||
    path.includes('param)}') ||
    path.includes('…') ||
    path.endsWith('/flow')
  );
}

function moduleFeature(flow: PulseDiscoveredFlowCandidate): SemanticFlowDescriptor {
  const path = getPath(flow);
  const action = inferAction(flow);
  const family = inferResourceFamily(flow);

  if (flow.moduleKey === 'ads' && path.includes('/ad-rules')) {
    return {
      id: 'ads-ad-rules-management',
      canonicalName: 'Ads Ad Rules Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'canvas' && path.includes('/canvas/generate')) {
    return {
      id: 'canvas-generation',
      canonicalName: 'Canvas Generation',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'autopilot') {
    return {
      id: 'autopilot-runtime-management',
      canonicalName: 'Autopilot Runtime Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (
    flow.moduleKey === 'sites' &&
    (path.includes('/site/') || (path.includes('/workspace/') && path.includes('/jitter')))
  ) {
    return {
      id: 'sites-site-management',
      canonicalName: 'Sites Site Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'wallet' && path.includes('/bank-accounts/')) {
    return {
      id: 'wallet-bank-account-management',
      canonicalName: 'Wallet Bank Account Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'wallet' && path.includes('/withdraw')) {
    return {
      id: 'wallet-withdrawal-capability',
      canonicalName: 'Wallet Withdrawal Capability',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'tools' && path.includes('/launch/launcher')) {
    return {
      id: 'tools-launcher-management',
      canonicalName: 'Tools Launcher Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'webinars' && path.includes('/webinars')) {
    return {
      id: 'webinars-webinar-management',
      canonicalName: 'Webinars Webinar Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if ((flow.moduleKey === 'video' || flow.moduleKey === 'sales') && path.includes('/voice/')) {
    return {
      id: 'shared-voice-generation',
      canonicalName: 'Shared Voice Generation',
      flowKind: 'shared_capability',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'settings' && path.includes('/team/invite')) {
    return {
      id: 'settings-team-management',
      canonicalName: 'Settings Team Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'flows' && path.includes('/flows/') && path.includes('/executions')) {
    return {
      id: 'flows-execution-management',
      canonicalName: 'Flows Execution Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'products' && (path === '/products' || path.startsWith('/products/'))) {
    return {
      id: 'products-product-management',
      canonicalName: 'Products Product Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'partnerships' && path.includes('/affiliate/ai-search')) {
    return {
      id: 'partnerships-affiliate-discovery',
      canonicalName: 'Partnerships Affiliate Discovery',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'billing' && path.includes('/stripe/') && path.includes('/pix')) {
    return {
      id: 'billing-provider-payment-management',
      canonicalName: 'Billing Provider Payment Management',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'settings' && path.includes('/kloel/think/sync')) {
    return {
      id: 'settings-think-sync',
      canonicalName: 'Settings Think Sync',
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  if (flow.moduleKey === 'e2e') {
    return {
      id: 'ops-e2e-harness',
      canonicalName: 'Ops E2E Harness',
      flowKind: 'ops_internal',
      aliases: [flow.id],
    };
  }

  if (isLegacyNoise(flow)) {
    return {
      id: `legacy-${flow.moduleKey}-${family}-${action}`,
      canonicalName: `${titleCase(flow.moduleName)} Legacy Noise`,
      flowKind: 'legacy_noise',
      aliases: [flow.id],
    };
  }

  if (['create', 'update', 'delete'].includes(action) && family !== 'flow') {
    return {
      id: `${flow.moduleKey}-${family}-management`,
      canonicalName: `${titleCase(flow.moduleName)} ${titleCase(family)} Management`,
      flowKind: 'feature_flow',
      aliases: [flow.id],
    };
  }

  return {
    id: `${flow.moduleKey}-${family}-${action}`,
    canonicalName: `${titleCase(flow.moduleName)} ${titleCase(family)} ${titleCase(action)}`,
    flowKind: flow.connected || flow.persistent ? 'feature_flow' : 'legacy_noise',
    aliases: [flow.id],
  };
}

function describeFlow(flow: PulseDiscoveredFlowCandidate): SemanticFlowDescriptor {
  return sharedCapability(flow) || moduleFeature(flow);
}

function inferFlowSpecMatch(
  manifest: PulseManifest | null,
  group: PulseResolvedFlowGroup,
): string | null {
  if (!manifest) {
    return null;
  }

  const overrides = manifest.overrides || {};
  if (overrides.flowAliases?.[group.id]) {
    return overrides.flowAliases[group.id];
  }
  if (overrides.flowAliases?.[group.canonicalName]) {
    return overrides.flowAliases[group.canonicalName];
  }

  const haystack = normalizeText(
    [
      group.id,
      group.canonicalName,
      ...group.aliases,
      ...group.pageRoutes,
      ...group.endpoints,
      ...group.backendRoutes,
      ...group.moduleKeys,
      ...group.moduleNames,
    ].join(' '),
  );
  const groupId = group.id;

  const heuristics: Array<[string, boolean]> = [
    [
      'wallet-withdrawal',
      groupId === 'wallet-withdrawal-capability' ||
        (group.moduleKeys.includes('wallet') && /withdraw/.test(haystack)),
    ],
    [
      'whatsapp-message-send',
      groupId === 'shared-message-send' ||
        /message send|reply conversation|instagram messages send|email send/.test(haystack),
    ],
    [
      'checkout-payment',
      groupId === 'shared-payment-creation' ||
        (group.moduleKeys.includes('checkout') && /payment|order|pix|boleto|stripe/.test(haystack)),
    ],
    [
      'product-create',
      groupId === 'products-product-management' ||
        (group.moduleKeys.includes('products') && /product management/.test(haystack)),
    ],
    [
      'auth-login',
      group.moduleKeys.includes('auth') ||
        groupId === 'shared-auth-oauth' ||
        groupId === 'shared-auth-registration',
    ],
  ];

  for (const [flowSpecId, matched] of heuristics) {
    if (matched && manifest.flowSpecs.some((item) => item.id === flowSpecId)) {
      return flowSpecId;
    }
  }

  return null;
}

function matchesScenarioRoute(route: string, pattern: string): boolean {
  if (!route || !pattern) {
    return false;
  }

  if (route === pattern) {
    return true;
  }

  const dynamicIndex = pattern.indexOf('[');
  const staticPrefix = dynamicIndex >= 0 ? pattern.slice(0, dynamicIndex) : pattern;
  if (!staticPrefix || staticPrefix === '/') {
    return route === '/' || route.startsWith('/');
  }

  return route.startsWith(staticPrefix.endsWith('/') ? staticPrefix : `${staticPrefix}/`);
}

function synthesizeScenarioFlowGroups(
  manifest: PulseManifest | null,
  codebaseTruth: PulseCodebaseTruth,
  existingFlowGroups: PulseResolvedFlowGroup[],
): PulseResolvedFlowGroup[] {
  if (!manifest) {
    return [];
  }

  const existingIds = new Set(existingFlowGroups.map((group) => group.id));
  const discoveredModuleByKey = new Map(
    codebaseTruth.discoveredModules.map((module) => [module.key, module] as const),
  );
  const discoveredRoutes = codebaseTruth.pages.map((page) => page.route);
  const flowSpecIds = new Set(manifest.flowSpecs.map((spec) => spec.id));
  const synthesized: PulseResolvedFlowGroup[] = [];

  for (const scenario of manifest.scenarioSpecs) {
    const scenarioModules = scenario.moduleKeys.filter((key) => discoveredModuleByKey.has(key));
    const scenarioRoutes = discoveredRoutes.filter((route) =>
      scenario.routePatterns.some((pattern) => matchesScenarioRoute(route, pattern)),
    );

    if (scenarioModules.length === 0 && scenarioRoutes.length === 0) {
      continue;
    }

    for (const groupId of scenario.flowGroups) {
      if (existingIds.has(groupId)) {
        continue;
      }

      const matchedFlowSpec =
        (groupId === 'shared-auth-oauth' && flowSpecIds.has('auth-login') && 'auth-login') ||
        scenario.flowSpecs.find((flowSpecId) => flowSpecIds.has(flowSpecId)) ||
        null;
      const moduleNames = scenarioModules
        .map((key) => discoveredModuleByKey.get(key)?.name)
        .filter((value): value is string => Boolean(value));
      const primaryModuleKey = scenarioModules[0] || 'shared';
      const primaryModuleName = moduleNames[0] || 'Shared Capability';

      synthesized.push({
        id: groupId,
        canonicalName: titleCase(groupId.replace(/^shared-/, '').replace(/-/g, ' ')),
        aliases: unique([groupId, ...scenario.flowSpecs]).sort(),
        flowKind: 'shared_capability',
        moduleKey: primaryModuleKey,
        moduleName: primaryModuleName,
        moduleKeys: unique(scenarioModules).sort(),
        moduleNames: unique(moduleNames).sort(),
        pageRoutes: unique(
          scenarioRoutes.length > 0 ? scenarioRoutes : scenario.routePatterns,
        ).sort(),
        actions: [],
        endpoints: [],
        backendRoutes: [],
        connected: false,
        persistent: false,
        memberCount: 0,
        critical: scenario.critical || Boolean(matchedFlowSpec),
        resolution: matchedFlowSpec ? 'matched' : 'grouped',
        matchedFlowSpec,
        notes: `Synthesized from scenario "${scenario.id}" because the declared flow group "${groupId}" has matching modules/routes in codebase truth.`,
      });
      existingIds.add(groupId);
    }
  }

  return synthesized;
}

function buildFlowGroups(
  manifest: PulseManifest | null,
  flows: PulseDiscoveredFlowCandidate[],
  criticalModuleKeys: Set<string>,
): PulseResolvedFlowGroup[] {
  const byGroup = new Map<
    string,
    { descriptor: SemanticFlowDescriptor; flows: PulseDiscoveredFlowCandidate[] }
  >();

  for (const flow of flows) {
    const descriptor = describeFlow(flow);
    const current = byGroup.get(descriptor.id);
    if (current) {
      current.flows.push(flow);
      current.descriptor.aliases = unique([...current.descriptor.aliases, ...descriptor.aliases]);
    } else {
      byGroup.set(descriptor.id, {
        descriptor,
        flows: [flow],
      });
    }
  }

  const activeAcceptances = new Set(
    (manifest?.temporaryAcceptances || [])
      .filter((entry) => entry.targetType === 'flow')
      .map((entry) => entry.target),
  );
  const excludedCandidates = manifest?.overrides?.excludedFlowCandidates || [];

  return [...byGroup.entries()]
    .map(([id, group]) => {
      const moduleKeys = unique(group.flows.map((item) => item.moduleKey)).sort();
      const moduleNames = unique(group.flows.map((item) => item.moduleName)).sort();
      const primaryModuleKey =
        group.descriptor.flowKind === 'shared_capability' ? 'shared' : moduleKeys[0];
      const primaryModuleName =
        group.descriptor.flowKind === 'shared_capability' ? 'Shared Capability' : moduleNames[0];
      const matchedFlowSpec = inferFlowSpecMatch(manifest, {
        id,
        canonicalName: group.descriptor.canonicalName,
        aliases: group.descriptor.aliases,
        flowKind: group.descriptor.flowKind,
        moduleKey: primaryModuleKey,
        moduleName: primaryModuleName,
        moduleKeys,
        moduleNames,
        pageRoutes: [],
        actions: [],
        endpoints: [],
        backendRoutes: [],
        connected: false,
        persistent: false,
        memberCount: 0,
        critical: false,
        resolution: 'candidate',
        matchedFlowSpec: null,
        notes: '',
      });
      const accepted = matchedFlowSpec ? activeAcceptances.has(matchedFlowSpec) : false;
      const excluded =
        matchesOverride(id, excludedCandidates) ||
        group.descriptor.aliases.some((alias) => matchesOverride(alias, excludedCandidates));
      const connected = group.flows.some((item) => item.connected);
      const persistent = group.flows.some((item) => item.persistent);
      const critical =
        moduleKeys.some((key) => criticalModuleKeys.has(key)) ||
        persistent ||
        Boolean(matchedFlowSpec);

      let resolution: PulseResolvedFlowGroup['resolution'];
      if (excluded) {
        resolution = 'excluded';
      } else if (accepted) {
        resolution = 'accepted';
      } else if (matchedFlowSpec) {
        resolution = 'matched';
      } else {
        resolution = 'grouped';
      }

      return {
        id,
        canonicalName: group.descriptor.canonicalName,
        aliases: unique([
          ...group.descriptor.aliases,
          ...group.flows.map((item) => item.id),
        ]).sort(),
        flowKind: group.descriptor.flowKind,
        moduleKey: primaryModuleKey,
        moduleName: primaryModuleName,
        moduleKeys,
        moduleNames,
        pageRoutes: unique(group.flows.map((item) => item.pageRoute)).sort(),
        actions: unique(group.flows.map(inferAction)).sort(),
        endpoints: unique(group.flows.map((item) => item.endpoint)).sort(),
        backendRoutes: unique(
          group.flows
            .map((item) => item.backendRoute)
            .filter((value): value is string => Boolean(value)),
        ).sort(),
        connected,
        persistent,
        memberCount: group.flows.length,
        critical,
        resolution,
        matchedFlowSpec,
        notes: matchedFlowSpec
          ? `Grouped from ${group.flows.length} raw flow candidate(s); matched flow spec "${matchedFlowSpec}".`
          : excluded
            ? `Grouped from ${group.flows.length} raw flow candidate(s); excluded by override.`
            : `Grouped from ${group.flows.length} raw flow candidate(s) as ${group.descriptor.flowKind}.`,
      } satisfies PulseResolvedFlowGroup;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Build resolved manifest. */
export function buildResolvedManifest(
  manifest: PulseManifest | null,
  manifestPath: string | null,
  codebaseTruth: PulseCodebaseTruth,
): PulseResolvedManifest {
  const modules = codebaseTruth.discoveredModules.map((module) =>
    buildModuleResolution(manifest, module),
  );
  const criticalModuleKeys = new Set(
    modules.filter((module) => module.critical).map((module) => module.key),
  );
  const resolvedFlowGroups = buildFlowGroups(
    manifest,
    codebaseTruth.discoveredFlows,
    criticalModuleKeys,
  );
  const flowGroups = [
    ...resolvedFlowGroups,
    ...synthesizeScenarioFlowGroups(manifest, codebaseTruth, resolvedFlowGroups),
  ].sort((a, b) => a.id.localeCompare(b.id));

  const matchedModuleNames = new Set(
    modules.map((module) => module.sourceModule).filter((value): value is string => Boolean(value)),
  );
  const orphanManualModules = getActiveModules(manifest)
    .filter((entry) => !matchedModuleNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  const legacyManualModules = getLegacyModules(manifest)
    .map((entry) => entry.name)
    .sort();

  const matchedFlowSpecs = new Set(
    flowGroups
      .map((group) => group.matchedFlowSpec)
      .filter((value): value is string => Boolean(value)),
  );
  const orphanFlowSpecs = (manifest?.flowSpecs || [])
    .filter((spec) => !matchedFlowSpecs.has(spec.id))
    .map((spec) => spec.id)
    .sort();

  const unresolvedModules: string[] = [];

  const unresolvedFlowGroups = flowGroups
    .filter(
      (group) =>
        group.resolution === 'candidate' &&
        group.flowKind !== 'ops_internal' &&
        group.flowKind !== 'legacy_noise',
    )
    .map((group) => group.id)
    .sort();

  const excludedModules = modules
    .filter((module) => module.resolution === 'excluded')
    .map((module) => module.name)
    .sort();

  const excludedFlowGroups = flowGroups
    .filter((group) => group.resolution === 'excluded')
    .map((group) => group.id)
    .sort();

  const groupedFlowGroups = flowGroups
    .filter((group) => group.resolution === 'grouped')
    .map((group) => group.id)
    .sort();

  const sharedCapabilityGroups = flowGroups
    .filter((group) => group.flowKind === 'shared_capability')
    .map((group) => group.id)
    .sort();

  const opsInternalFlowGroups = flowGroups
    .filter((group) => group.flowKind === 'ops_internal')
    .map((group) => group.id)
    .sort();

  const legacyNoiseFlowGroups = flowGroups
    .filter((group) => group.flowKind === 'legacy_noise')
    .map((group) => group.id)
    .sort();

  const blockerCount =
    unresolvedModules.length +
    orphanManualModules.length +
    orphanFlowSpecs.length +
    unresolvedFlowGroups.length;

  const warningCount =
    excludedModules.length +
    excludedFlowGroups.length +
    legacyManualModules.length +
    opsInternalFlowGroups.length +
    legacyNoiseFlowGroups.length;

  return {
    generatedAt: new Date().toISOString(),
    sourceManifestPath: manifestPath,
    projectId: manifest?.projectId || 'unknown',
    projectName: manifest?.projectName || 'unknown',
    systemType: manifest?.systemType || 'unknown',
    supportedStacks: manifest?.supportedStacks || [],
    surfaces: manifest?.surfaces || [],
    criticalDomains: modules
      .filter((module) => module.critical && module.moduleKind === 'user_facing')
      .map((module) => module.key)
      .sort(),
    modules,
    flowGroups,
    actorProfiles: manifest?.actorProfiles || [],
    scenarioSpecs: manifest?.scenarioSpecs || [],
    flowSpecs: manifest?.flowSpecs || [],
    invariantSpecs: manifest?.invariantSpecs || [],
    temporaryAcceptances: manifest?.temporaryAcceptances || [],
    certificationTiers: manifest?.certificationTiers || [],
    finalReadinessCriteria: manifest?.finalReadinessCriteria || {
      requireAllTiersPass: true,
      requireNoAcceptedCriticalFlows: true,
      requireNoAcceptedCriticalScenarios: true,
      requireWorldStateConvergence: true,
    },
    securityRequirements: manifest?.securityRequirements || [],
    recoveryRequirements: manifest?.recoveryRequirements || [],
    slos: manifest?.slos || {},
    summary: {
      totalModules: modules.length,
      resolvedModules: modules.filter((module) => module.resolution !== 'excluded').length,
      unresolvedModules: unresolvedModules.length,
      totalFlowGroups: flowGroups.length,
      resolvedFlowGroups: flowGroups.filter((group) => group.resolution !== 'candidate').length,
      unresolvedFlowGroups: unresolvedFlowGroups.length,
      orphanManualModules: orphanManualModules.length,
      orphanFlowSpecs: orphanFlowSpecs.length,
      excludedModules: excludedModules.length,
      excludedFlowGroups: excludedFlowGroups.length,
      groupedFlowGroups: groupedFlowGroups.length,
      sharedCapabilityGroups: sharedCapabilityGroups.length,
      opsInternalFlowGroups: opsInternalFlowGroups.length,
      legacyNoiseFlowGroups: legacyNoiseFlowGroups.length,
      legacyManualModules: legacyManualModules.length,
    },
    diagnostics: {
      unresolvedModules,
      orphanManualModules,
      unresolvedFlowGroups,
      orphanFlowSpecs,
      excludedModules,
      excludedFlowGroups,
      legacyManualModules,
      groupedFlowGroups,
      sharedCapabilityGroups,
      opsInternalFlowGroups,
      legacyNoiseFlowGroups,
      blockerCount,
      warningCount,
    },
  };
}
