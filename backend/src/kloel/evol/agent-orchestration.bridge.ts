import { Injectable } from '@nestjs/common';
import type { HumanAuthorization, AgentOrchestrationBridge as AgentOrchestrationBridgeType } from './types';

/**
 * EVOL-004 — AgentOrchestrationBridgeService.
 *
 * Proxy bridge that dispatches authorized improvement tasks to coding
 * agents. Only dispatches when authorization is approved and non-expired.
 * Tracks dispatch status and captures result hashes for audit.
 */

@Injectable()
export class AgentOrchestrationBridgeService {
  private bridges = new Map<string, AgentOrchestrationBridgeType>();
  private counter = 0;

  dispatch(
    authorization: HumanAuthorization,
    targetAgent: string,
  ): AgentOrchestrationBridgeType | null {
    if (authorization.status !== 'approved') {return null;}
    if (authorization.authorizedAt === null) {return null;}
    if (new Date(authorization.expiresAt).getTime() < Date.now()) {return null;}

    this.counter += 1;
    const now = new Date().toISOString();

    const bridge: AgentOrchestrationBridgeType = {
      id: `bridge-${authorization.workspaceId}-${this.counter}`,
      authorizationId: authorization.id,
      workspaceId: authorization.workspaceId,
      targetAgent,
      targetFiles: [...authorization.scope],
      instructions: `Execute authorized proposal ${authorization.proposalId} within scope`,
      status: 'dispatched',
      dispatchedAt: now,
      completedAt: null,
      resultHash: null,
      errorMessage: null,
    };

    this.bridges.set(bridge.id, bridge);
    return bridge;
  }

  complete(bridgeId: string, resultHash: string): AgentOrchestrationBridgeType | null {
    const bridge = this.bridges.get(bridgeId);
    if (!bridge) {return null;}
    if (bridge.status !== 'dispatched') {return bridge;}

    const completed: AgentOrchestrationBridgeType = {
      ...bridge,
      status: 'completed',
      completedAt: new Date().toISOString(),
      resultHash,
    };

    this.bridges.set(bridgeId, completed);
    return completed;
  }

  fail(bridgeId: string, errorMessage: string): AgentOrchestrationBridgeType | null {
    const bridge = this.bridges.get(bridgeId);
    if (!bridge) {return null;}

    const failed: AgentOrchestrationBridgeType = {
      ...bridge,
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage,
    };

    this.bridges.set(bridgeId, failed);
    return failed;
  }

  getStatus(bridgeId: string): AgentOrchestrationBridgeType | undefined {
    return this.bridges.get(bridgeId);
  }

  listByAuthorization(authId: string): readonly AgentOrchestrationBridgeType[] {
    return [...this.bridges.values()].filter((b) => b.authorizationId === authId);
  }
}
