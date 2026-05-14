/**
 * UTP-ROLE-001..008 — Camada XXIII (Role-Aware Commercial Intelligence).
 *
 * Recognises the real economic role of the workspace owner from spine
 * usage patterns, not from declaration. Implements B0.3 (role-aware
 * intelligence): recommendations respect the real levers of each role;
 * a suggestion outside the control radius is a grave failure.
 *
 * Types: Role, RoleDetection, LeverageMap, RoleMetric,
 * RecommendationGuardResult, MultiHatProfile.
 *
 * Aligned with PCI.2 §3.14 (roleContext) and B0.3 semantics.
 */

import type { AbiTruthMode } from '../abi/abi-schema';
import type { SpineEventRef } from '../mind/mind.types';

export type Role =
  | 'produtor'
  | 'afiliado'
  | 'agencia'
  | 'gestor'
  | 'closer'
  | 'creator'
  | 'especialista';

export const ALL_ROLES: readonly Role[] = [
  'produtor',
  'afiliado',
  'agencia',
  'gestor',
  'closer',
  'creator',
  'especialista',
] as const;

export interface RoleDetection {
  readonly role: Role;
  readonly confidence: number;
  readonly detectedFromSignals: readonly string[];
  readonly workspaceId: string;
  readonly truthMode: AbiTruthMode;
  readonly detectedAt: string;
}

export interface LeverageEntry {
  readonly lever: string;
  readonly description: string;
  readonly controlRadius: 'direct' | 'influenced' | 'outside';
}

export interface LeverageMap {
  readonly role: Role;
  readonly levers: readonly LeverageEntry[];
  readonly directLevers: readonly string[];
  readonly influencedLevers: readonly string[];
}

export interface RoleMetric {
  readonly metricName: string;
  readonly label: string;
  readonly unit: string;
  readonly relevantRoles: readonly Role[];
  readonly description: string;
}

export interface RoleMetricSnapshot {
  readonly metricName: string;
  readonly currentValue: number | string;
  readonly role: Role;
  readonly updatedAt: string;
}

export interface RecommendationGuardResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly role: Role;
  readonly guardAppliedAt: string;
}

export interface MultiHatProfile {
  readonly workspaceId: string;
  readonly detections: readonly RoleDetection[];
  readonly primaryRole: Role | undefined;
  readonly secondaryRoles: readonly Role[];
  readonly combinedLevers: readonly string[];
  readonly hatStackDepth: number;
  readonly profileUpdatedAt: string;
}

export interface RoleDetectorInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs?: number;
}

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  produtor:
    'Cria e opera o produto proprio. Controla catalogo, precos, checkout e entrega.',
  afiliado:
    'Promove produtos de terceiros. Controla audiencia, criativos e canais de trafego.',
  agencia:
    'Opera multiplos clientes. Controla portfolio, margem, time e retencao.',
  gestor:
    'Gerencia a operacao de um unico negocio. Controla equipe, processos e execucao.',
  closer:
    'Fecha vendas diretamente. Controla pipeline, objecoes e taxas de conversao.',
  creator:
    'Cria conteudo e audiencia. Controla narrativa, engajamento e confianca.',
  especialista:
    'Domina um dominio especifico. Controla execucao profunda em area restrita.',
};

export function makeRoleDetectionId(): string {
  return `rd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeProfileUpdateId(): string {
  return `mp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}
