/**
 * UTP-LEGIT-010 — Policy Update Watcher.
 *
 * Watches for policy changes from external providers (Meta, Google,
 * WhatsApp, Stripe) and generates compliance checklists.
 * Detects version changes, calculates action deadlines, and
 * flags changes requiring immediate action.
 *
 * Pure function — stateless policy change detection.
 */

import type { PolicyUpdateInput, PolicyUpdateResult } from './types';
import { daysUntil, generateId } from './types';

const IMMEDIATE_ACTION_WINDOW_DAYS = 7;

export function watchPolicyUpdate(input: PolicyUpdateInput): PolicyUpdateResult {
  const nowMs = input.nowMs ?? Date.now();

  const daysToEffective = daysUntil(input.effectiveAt, nowMs);
  const requiresImmediateAction = daysToEffective <= IMMEDIATE_ACTION_WINDOW_DAYS;

  const complianceChecklist: string[] = [];

  if (input.provider === 'whatsapp') {
    complianceChecklist.push(
      'Revisar templates de mensagem.',
      'Verificar opt-in de contatos ativos.',
      'Atualizar politica de privacidade se necessario.',
    );
  } else if (input.provider === 'meta') {
    complianceChecklist.push(
      'Revisar pixel e eventos de conversao.',
      'Atualizar termos de anuncios.',
      'Verificar targeting de audiencia.',
    );
  } else {
    complianceChecklist.push(
      'Revisar documentacao interna.',
      'Comunicar mudancas aos stakeholders.',
      'Agendar revisao juridica se necessario.',
    );
  }

  if (requiresImmediateAction) {
    complianceChecklist.push(`ACAO IMEDIATA: mudanca efetiva em ${daysToEffective} dias.`);
  }

  const impactedPolicies: string[] = [input.policyName];

  if (input.policyName.includes('privacy')) {
    impactedPolicies.push('lgpd_compliance', 'gdpr_compliance');
  }
  if (input.policyName.includes('commerce') || input.policyName.includes('business')) {
    impactedPolicies.push('commercial_promise', 'regulated_content');
  }

  const actionDeadline = daysToEffective > 0 ? input.effectiveAt : null;

  return {
    change: {
      changeId: generateId('pol_change'),
      policyName: input.policyName,
      provider: input.provider,
      previousVersion: input.previousVersion,
      newVersion: input.newVersion,
      summary: input.summary,
      effectiveAt: input.effectiveAt,
      requiresAction: true,
      actionDeadline,
      complianceChecklist,
      detectedAt: new Date(nowMs).toISOString(),
      acknowledgedAt: null,
    },
    requiresImmediateAction,
    impactedPolicies,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
