import { Injectable } from '@nestjs/common';
import type { AgentReadinessSelfModel } from './agent-runtime.types';

@Injectable()
export class AgentRuntimeReadinessSelfModelService {
  buildSelfModel(): AgentReadinessSelfModel {
    return this.empty('runtime_readiness_artifact_unavailable');
  }

  private empty(reason: string): AgentReadinessSelfModel {
    return {
      status: 'empty',
      authorityMode: 'advisory',
      canWorkNow: false,
      canDeclareComplete: false,
      score: null,
      blockingReasons: [reason],
      nextSafeUnits: [],
      generatedAt: new Date().toISOString(),
    };
  }
}
