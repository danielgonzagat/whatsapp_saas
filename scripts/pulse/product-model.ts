/**
 * PULSE Product Model Layer (P1)
 *
 * Transforms code artifacts into product capabilities, flows, and surfaces.
 * This is the "reconstruction layer" that turns files into product vision.
 *
 * Key concepts:
 * - Surface: Top-level product area (Auth, Workspace, Billing, etc.)
 * - Capability: Feature that spans UI, API, and persistence
 * - Flow: User journey across capabilities
 *
 * Extended truth modes for capabilities/flows (beyond PULSE standard):
 * - real: Exists and works with evidence (observed + complete)
 * - partial: Exists but broken or incomplete (partial mode)
 * - latent: Declared/aspirational - strong signals but not implemented (aspirational mode)
 * - phantom: Parece existir but is illusion of orphaned front/back (inferred only)
 */

import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseScopeState,
  PulseResolvedManifest,
  PulseTruthMode,
  PulseProductGraph,
  PulseProductCapability,
  PulseProductFlow,
  PulseProductSurface,
} from './types';

/** Input to product model builder */
export interface BuildProductModelInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  resolvedManifest: PulseResolvedManifest;
}

/** Execution layer classification */
type ArtifactLayer =
  | 'frontend'
  | 'api_layer'
  | 'backend'
  | 'persistence'
  | 'worker'
  | 'external'
  | 'infrastructure';

/** Extended truth mode for capability/flow classification */
type CapabilityTruthMode = 'real' | 'partial' | 'latent' | 'phantom';

/**
 * Build product graph from structural graph
 * Transforms code into product surfaces, capabilities, and flows
 */
export function buildProductModel(input: BuildProductModelInput): PulseProductGraph {
  const { structuralGraph, scopeState, resolvedManifest } = input;

  const surfaces = discoverSurfaces(structuralGraph);
  const capabilities = discoverCapabilities(structuralGraph, surfaces);
  const flows = discoverFlows(capabilities);
  const orphanedArtifactIds = findOrphanedArtifactIds(structuralGraph, capabilities);

  return {
    surfaces,
    capabilities,
    flows,
    orphanedArtifactIds,
    phantomCapabilities: capabilities
      .filter((c) => mapToExtendedMode(c.truthMode) === 'phantom')
      .map((c) => c.id),
    latentCapabilities: capabilities
      .filter((c) => mapToExtendedMode(c.truthMode) === 'latent')
      .map((c) => c.id),
  };
}

// ============ Discovery Functions ============

/** Discover product surfaces from structural graph */
function discoverSurfaces(graph: PulseStructuralGraph): PulseProductSurface[] {
  // Map code areas to known surfaces
  const surfacePatterns: Record<string, { name: string; description: string }> = {
    auth: { name: 'Authentication', description: 'User signup, login, session management' },
    workspace: { name: 'Workspace', description: 'Workspace creation, settings, team management' },
    billing: { name: 'Billing', description: 'Plans, invoices, subscriptions' },
    wallet: { name: 'Wallet', description: 'Balance, transactions, withdrawals' },
    payments: { name: 'Payments', description: 'Stripe Connect, checkout, payouts' },
    whatsapp: { name: 'WhatsApp', description: 'Session management, messaging' },
    inbox: { name: 'Inbox', description: 'Message inbox, chat interface' },
    crm: { name: 'CRM', description: 'Contacts, pipeline, relationships' },
    products: { name: 'Products', description: 'Product catalog, pricing, inventory' },
    settings: { name: 'Settings', description: 'Workspace configuration, preferences' },
    admin: { name: 'Admin', description: 'Admin dashboard, monitoring' },
    analytics: { name: 'Analytics', description: 'Dashboard, reports, metrics' },
  };

  const surfaces: PulseProductSurface[] = [];

  for (const [pattern, info] of Object.entries(surfacePatterns)) {
    const artifactIds = findArtifactIdsByPattern(graph, pattern);
    if (artifactIds.length === 0) continue;

    const completeness = calculateSurfaceCompleteness(graph, artifactIds);
    const truthMode = classifyTruthModeFromScore(completeness);

    surfaces.push({
      id: pattern,
      name: info.name,
      description: info.description,
      artifactIds,
      capabilities: [],
      completeness,
      truthMode,
    });
  }

  return surfaces;
}

/** Discover capabilities from structural graph */
function discoverCapabilities(
  graph: PulseStructuralGraph,
  surfaces: PulseProductSurface[],
): PulseProductCapability[] {
  const capabilities: PulseProductCapability[] = [];

  for (const surface of surfaces) {
    for (const artifactId of surface.artifactIds) {
      const node = graph.nodes.find((n) => n.id === artifactId);
      if (!node) continue;

      const relatedIds = findRelatedNodeIds(graph, artifactId);
      if (relatedIds.length < 2) continue;

      const relatedNodes = relatedIds
        .map((id) => graph.nodes.find((n) => n.id === id))
        .filter((n) => n !== undefined) as PulseStructuralNode[];

      const hasUI = relatedNodes.some((n) => classifyLayer(n.file) === 'frontend');
      const hasAPI = relatedNodes.some((n) => classifyLayer(n.file) === 'backend');
      const hasStorage = relatedNodes.some((n) => classifyLayer(n.file) === 'persistence');
      const hasRuntime = relatedNodes.some((n) => classifyLayer(n.file) === 'worker');
      const hasValidation = relatedNodes.some(
        (n) => n.file.includes('validator') || n.file.includes('dto'),
      );
      const hasObservability = relatedNodes.some(
        (n) => n.file.includes('logger') || n.file.includes('monitor'),
      );

      const layersPresent = [
        hasUI,
        hasAPI,
        hasStorage,
        hasRuntime,
        hasValidation,
        hasObservability,
      ].filter(Boolean).length;
      const maturityScore = Math.round((layersPresent / 6) * 100);

      capabilities.push({
        id: `cap-${surface.id}-${node.id}`,
        name: `${surface.name} - ${node.label}`,
        surfaceId: surface.id,
        artifactIds: relatedIds,
        flowIds: [],
        maturityScore,
        truthMode: classifyCapabilityTruthMode(maturityScore),
        criticality: inferCriticality(surface.id),
        blockers: computeCapabilityBlockers(hasUI, hasAPI, hasStorage),
      });
    }
  }

  return capabilities;
}

/** Discover user flows from capabilities */
function discoverFlows(capabilities: PulseProductCapability[]): PulseProductFlow[] {
  // Well-known flows in KLOEL product
  const flowPatterns = [
    { id: 'signup', name: 'User Signup', requiredSurfaces: ['auth'] },
    { id: 'connect-whatsapp', name: 'Connect WhatsApp', requiredSurfaces: ['whatsapp', 'auth'] },
    { id: 'create-product', name: 'Create Product', requiredSurfaces: ['products', 'workspace'] },
    { id: 'checkout', name: 'Checkout Flow', requiredSurfaces: ['products', 'payments', 'wallet'] },
    { id: 'receive-lead', name: 'Receive Lead', requiredSurfaces: ['whatsapp', 'crm', 'inbox'] },
    { id: 'send-message', name: 'Send Message', requiredSurfaces: ['whatsapp', 'inbox'] },
  ];

  const flows: PulseProductFlow[] = flowPatterns
    .filter((pattern) =>
      pattern.requiredSurfaces.some((rs) => capabilities.some((c) => c.surfaceId === rs)),
    )
    .map((pattern) => {
      const relatedCaps = capabilities.filter((c) =>
        pattern.requiredSurfaces.includes(c.surfaceId),
      );
      const avgCompleteness =
        relatedCaps.length > 0
          ? relatedCaps.reduce((acc, c) => acc + c.maturityScore, 0) / (relatedCaps.length * 100)
          : 0;

      return {
        id: pattern.id,
        name: pattern.name,
        description: '',
        entryCapability: relatedCaps[0]?.id || '',
        capabilities: relatedCaps.map((c) => c.id),
        completeness: avgCompleteness,
        truthMode: determineTruthModeFromCapabilities(relatedCaps),
        blockers: relatedCaps
          .flatMap((c) =>
            c.blockers.map((b) => ({
              type: 'missing_component' as const,
              component: c.id,
              reason: b,
              severity: 'blocker' as const,
            })),
          )
          .slice(0, 3),
      };
    });

  return flows;
}

/** Find orphaned artifact IDs */
function findOrphanedArtifactIds(
  graph: PulseStructuralGraph,
  capabilities: PulseProductCapability[],
): string[] {
  const connectedIds = new Set<string>();
  for (const cap of capabilities) {
    cap.artifactIds.forEach((id) => connectedIds.add(id));
  }

  return graph.nodes
    .filter((n) => !connectedIds.has(n.id) && !isExcludedArtifact(n.file))
    .map((n) => n.id);
}

// ============ Helper Functions ============

function findArtifactIdsByPattern(graph: PulseStructuralGraph, pattern: string): string[] {
  return graph.nodes
    .filter(
      (n) => n.file.toLowerCase().includes(pattern) || n.label.toLowerCase().includes(pattern),
    )
    .map((n) => n.id);
}

function findRelatedNodeIds(graph: PulseStructuralGraph, nodeId: string): string[] {
  const visited = new Set<string>();
  const queue: string[] = [nodeId];
  visited.add(nodeId);

  // BFS to depth 3 to find related artifacts via edges
  for (let depth = 0; depth < 3 && queue.length > 0; depth++) {
    const nextQueue: string[] = [];
    for (const currentId of queue) {
      // Find all edges going from or to this node
      const relatedEdges = graph.edges.filter((e) => e.from === currentId || e.to === currentId);
      for (const edge of relatedEdges) {
        const nextId = edge.from === currentId ? edge.to : edge.from;
        if (!visited.has(nextId)) {
          visited.add(nextId);
          nextQueue.push(nextId);
        }
      }
    }
    queue.splice(0, queue.length, ...nextQueue);
  }

  return Array.from(visited);
}

function classifyLayer(file: string): ArtifactLayer {
  const lower = file.toLowerCase();
  if (lower.includes('frontend/') || lower.includes('frontend-admin/')) return 'frontend';
  if (lower.includes('backend/')) return 'backend';
  if (lower.includes('worker/')) return 'worker';
  if (lower.includes('prisma/') || lower.includes('schema.prisma')) return 'persistence';
  if (lower.includes('webhook') || lower.includes('provider')) return 'external';
  return 'infrastructure';
}

function calculateSurfaceCompleteness(graph: PulseStructuralGraph, artifactIds: string[]): number {
  const nodes = artifactIds
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter((n) => n !== undefined) as PulseStructuralNode[];
  if (nodes.length === 0) return 0;

  const hasUI = nodes.some((n) => classifyLayer(n.file) === 'frontend');
  const hasAPI = nodes.some((n) => classifyLayer(n.file) === 'backend');
  const hasStorage = nodes.some((n) => classifyLayer(n.file) === 'persistence');

  let score = 0;
  if (hasUI) score += 33;
  if (hasAPI) score += 33;
  if (hasStorage) score += 34;
  return score;
}

function classifyTruthModeFromScore(score: number): PulseTruthMode {
  if (score < 50) return 'inferred';
  if (score < 80) return 'aspirational';
  return 'observed';
}

function classifyCapabilityTruthMode(maturityScore: number): PulseTruthMode {
  if (maturityScore < 50) return 'inferred';
  if (maturityScore < 85) return 'aspirational';
  return 'observed';
}

/** Map PULSE truth mode to extended capability classification */
function mapToExtendedMode(tm: PulseTruthMode): CapabilityTruthMode {
  if (tm === 'observed') return 'real';
  if (tm === 'aspirational') return 'latent';
  // 'inferred' maps to phantom (no layer evidence, just structure)
  return 'phantom';
}

function inferCriticality(surface: string): 'must_have' | 'should_have' | 'nice_to_have' {
  if (['auth', 'payments', 'whatsapp', 'workspace'].includes(surface)) return 'must_have';
  if (['crm', 'analytics', 'products'].includes(surface)) return 'should_have';
  return 'nice_to_have';
}

function computeCapabilityBlockers(hasUI: boolean, hasAPI: boolean, hasStorage: boolean): string[] {
  const blockers: string[] = [];
  if (!hasUI) blockers.push('Missing UI layer');
  if (!hasAPI) blockers.push('Missing API layer');
  if (!hasStorage) blockers.push('Missing storage layer');
  return blockers;
}

function determineTruthModeFromCapabilities(caps: PulseProductCapability[]): PulseTruthMode {
  if (caps.length === 0) return 'inferred';
  if (caps.some((c) => c.truthMode === 'inferred')) return 'inferred';
  if (caps.some((c) => c.truthMode === 'aspirational')) return 'aspirational';
  return 'observed';
}

function isExcludedArtifact(file: string): boolean {
  const excluded = ['test', 'spec', 'config', 'types', 'constants'];
  return excluded.some((e) => file.toLowerCase().includes(e));
}
