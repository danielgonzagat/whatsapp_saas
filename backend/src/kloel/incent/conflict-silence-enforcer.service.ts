import { Injectable } from '@nestjs/common';
import type { ConflictDetection, SilenceRule, SilenceUnderConflict } from './types';
import { makeIncidentId } from './types';

/**
 * INCENT-003 — ConflictSilenceEnforcer.
 *
 * Silencia recomendações sob conflito estrutural, falta de disclosure,
 * alerta de viés de plataforma ou override do usuário.
 *
 * O organismo NÃO recomenda quando há conflito não resolvido.
 * Em vez de distorcer a recomendação, opta pelo silêncio honesto.
 */
@Injectable()
export class ConflictSilenceEnforcerService {
  private static readonly SILENCE_TTL_HOURS = 72;

  private seq = 0;

  public enforce(input: SilenceInput): SilenceUnderConflict {
    this.seq += 1;

    const shouldSilence = this.evaluate(input);
    const reason = shouldSilence ? this.classifyReason(input) : undefined;

    const now = new Date();
    const expirationMs = shouldSilence
      ? now.getTime() + ConflictSilenceEnforcerService.SILENCE_TTL_HOURS * 60 * 60 * 1000
      : undefined;

    return {
      id: makeIncidentId('sil', this.seq),
      workspaceId: input.workspaceId,
      recommendationId: input.recommendationId,
      silenced: shouldSilence,
      reason: reason ?? 'structural_conflict',
      conflictRef: input.conflict?.id ?? '',
      enforcement: this.determineEnforcement(input),
      silencedAt: now.toISOString(),
      ...(expirationMs ? { expirationAt: new Date(expirationMs).toISOString() } : {}),
    } as SilenceUnderConflict;
  }

  public enforceBatch(
    inputs: readonly SilenceInput[],
  ): readonly SilenceUnderConflict[] {
    return inputs.map((inp) => this.enforce(inp));
  }

  public isSilenced(
    silence: SilenceUnderConflict,
    nowMs?: number,
  ): boolean {
    if (!silence.silenced) return false;
    if (!silence.expirationAt) return true;
    const now = nowMs ?? Date.now();
    return now < Date.parse(silence.expirationAt);
  }

  public activeSilences(
    silences: readonly SilenceUnderConflict[],
    nowMs?: number,
  ): readonly SilenceUnderConflict[] {
    return silences.filter((s) => this.isSilenced(s, nowMs));
  }

  public silenceRate(
    inputs: readonly SilenceInput[],
  ): { readonly silenced: number; readonly total: number; readonly rate: number } {
    const results = this.enforceBatch(inputs);
    const silenced = results.filter((r) => r.silenced).length;
    return {
      silenced,
      total: inputs.length,
      rate: inputs.length > 0 ? silenced / inputs.length : 0,
    };
  }

  private evaluate(input: SilenceInput): boolean {
    if (input.conflict) {
      if (input.conflict.severity === 'structural') return true;
      if (
        input.conflict.severity === 'actual' &&
        !input.disclosureIssued
      ) {
        return true;
      }
    }

    if (input.biasDetected && !input.biasMitigated) return true;

    if (input.userOverridden) return true;

    return false;
  }

  private classifyReason(input: SilenceInput): SilenceRule {
    if (input.userOverridden) return 'user_override';
    if (input.biasDetected && !input.biasMitigated) return 'platform_bias_alert';
    if (input.conflict?.severity === 'structural') return 'structural_conflict';
    if (input.conflict?.severity === 'actual' && !input.disclosureIssued) {
      return 'lack_of_disclosure';
    }
    return 'structural_conflict';
  }

  private determineEnforcement(
    input: SilenceInput,
  ): 'automatic' | 'human_review_required' {
    if (input.conflict?.severity === 'structural') return 'automatic';
    if (input.biasDetected && !input.biasMitigated) return 'automatic';
    return 'human_review_required';
  }
}

export interface SilenceInput {
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly conflict?: ConflictDetection;
  readonly biasDetected?: boolean;
  readonly biasMitigated?: boolean;
  readonly disclosureIssued?: boolean;
  readonly userOverridden?: boolean;
}
