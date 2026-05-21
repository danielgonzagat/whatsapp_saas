import { Injectable, Optional, Logger } from '@nestjs/common';
import type { MicroExperiment, AuthorizationRequest, AuthorizationDecision } from './types';
import type { AgentRuntimeDelegationService } from '../agent-runtime/agent-runtime.delegation';

@Injectable()
export class AuthorizationGatewayService {
  private readonly logger = new Logger(AuthorizationGatewayService.name);

  constructor(
    @Optional()
    private readonly delegationService?: AgentRuntimeDelegationService,
  ) {}

  async authorize(experiment: MicroExperiment): Promise<AuthorizationDecision> {
    const request: AuthorizationRequest = {
      experimentId: experiment.id,
      hypothesisId: experiment.hypothesisId,
      workspaceId: experiment.workspaceId,
      riskAssessment: experiment.riskAssessment,
      requestedAt: new Date().toISOString(),
      reason: experiment.description,
    };

    if (experiment.riskAssessment === 'high') {
      this.logger.warn(
        `High-risk experiment ${experiment.id} requires human approval`,
      );
      return {
        request,
        authorized: false,
        authorityLevel: 'human_required',
        reason: 'High-risk experiments require explicit human authorization.',
        decidedAt: new Date().toISOString(),
      };
    }

    if (experiment.evidenceThreshold < 1) {
      this.logger.warn(
        `Experiment ${experiment.id} has insufficient evidence threshold`,
      );
      return {
        request,
        authorized: false,
        authorityLevel: 'advisory',
        reason: 'Evidence threshold must be at least 1.',
        decidedAt: new Date().toISOString(),
      };
    }

    try {
      if (this.delegationService) {
        const existing = await this.delegationService.listByParentSession({
          workspaceId: experiment.workspaceId,
          parentSessionId: `hypproof:${experiment.workspaceId}`,
          status: 'pending',
          limit: 10,
        });

        if (existing.total > 0) {
          this.logger.debug(
            `Delegation state found for workspace ${experiment.workspaceId}, proceeding`,
          );
        }
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Delegation check failed for experiment ${experiment.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const authorityLevel = experiment.riskAssessment === 'normal' ? 'tool_limited' : 'advisory';

    return {
      request,
      authorized: true,
      authorityLevel,
      reason: `Experiment ${experiment.id} authorized at ${authorityLevel} level.`,
      decidedAt: new Date().toISOString(),
    };
  }
}
