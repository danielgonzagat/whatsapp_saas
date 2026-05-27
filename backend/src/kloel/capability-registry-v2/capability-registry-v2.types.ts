import type { UnknownRecord } from '../../common/types';

/**
 * Categories for capability classification.
 */
export type CapabilityCategory =
  | 'SELF_AWARENESS' // Auto-consciência
  | 'MUTATION_SENSITIVE' // Ações que mexem com dinheiro, documentos, etc.
  | 'MUTATION_SAFE' // Criação/edição não sensível
  | 'QUERY' // Consultas read-only
  | 'COMMUNICATION' // Envio de mensagens
  | 'CONFIGURATION' // Configurações de conta
  | 'META'; // Metacapacidades

/**
 * Maturidade da capacidade.
 *
 * 'registry' → apenas registrada
 * 'implementing' → implementação em andamento
 * 'testable' → testável via chat mas ainda não verificada
 * 'verified' → verificada conversando com Kloel real
 * 'blocked' → bloqueada por dependência externa
 * 'deprecated' → substituída
 */
export type CapabilityMaturity =
  | 'registry'
  | 'implementing'
  | 'testable'
  | 'verified'
  | 'blocked'
  | 'deprecated';

/**
 * Input schema definition for a capability.
 */
export interface CapabilityInputField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'file';
  label: string;
  required: boolean;
  description?: string;
  enum?: string[]; // For 'select' type
  prompt?: string; // Question to ask user when missing
}

/**
 * A single capability definition.
 */
export interface CapabilityDefinition {
  id: string;
  title: string;
  description: string;
  category: CapabilityCategory;
  tier: number; // Priority tier 0-15
  requiresConfirmation: boolean;
  requiredPermissions: string[];
  inputSchema: CapabilityInputField[];
  domainService: string; // Reference to domain service method
  emits: string[]; // Domain events emitted
  evidenceUrlBuilder?: string; // Template for URL
  surface: string[]; // Where this is available
  maturity?: CapabilityMaturity;
  dependsOn?: string[]; // Capability IDs this depends on
  parentCapability?: string; // For sub-capabilities
}

/**
 * Receipt returned after capability execution.
 */
export interface ExecutionReceipt {
  capabilityId: string;
  title: string;
  workspaceId: string;
  actorId: string;
  inputs: UnknownRecord;
  outputs: UnknownRecord;
  domainEvents: string[];
  auditLogId: string;
  evidenceUrl?: string;
  timestamp: string;
  durationMs: number;
  idempotencyKey: string;
  success: boolean;
  error?: string;
}

/**
 * Intent classification result.
 */
export interface IntentClassification {
  intent: string;
  capabilityId?: string;
  entities: UnknownRecord;
  confidence: number;
  missingInputs: string[];
  requiresConfirmation: boolean;
}

/**
 * User confirmation request.
 */
export interface ConfirmationRequest {
  capabilityId: string;
  title: string;
  summary: string;
  inputs: UnknownRecord;
}

/**
 * User context for capability execution.
 */
export interface CapabilityContext {
  workspaceId: string;
  actorId: string;
  phone?: string;
  source: string;
  idempotencyKey: string;
  requestId: string;
}
