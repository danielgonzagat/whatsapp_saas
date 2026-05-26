import { Injectable, Logger } from '@nestjs/common';
import { CAPABILITY_DEFINITIONS } from '../capability-registry-v2/capability-registry-v2.const';
import { CodeAccessService } from './code-access.service';
import type { CapabilityDefinition } from '../capability-registry-v2/capability-registry-v2.types';
export interface GapResult {
  unwired: CapabilityDefinition[];
  wired: string[];
}
/**
 * SelfGapsService — diff between the capability registry and the
 * dispatcher's actual switch cases, surfaced as the self.gaps meta-cap.
 */
@Injectable()
export class SelfGapsService {
  private readonly logger = new Logger(SelfGapsService.name);

  constructor(private readonly codeAccess: CodeAccessService) {}
  /**
   * Compare CAPABILITY_DEFINITIONS against the dispatcher's switch cases
   * and return the list of capabilities that have no case handler.
   */
  async diffRegistryVsDispatcher(): Promise<GapResult> {
    const hits = this.codeAccess.search("case '", {
      glob: '*.ts',
      max: 300,
    });

    const dispatcherHits = hits.filter(
      (h) => h.file.includes('kloel-tool-dispatcher.service') && !h.file.includes('.spec.'),
    );

    const wiredSet = new Set<string>();
    for (const hit of dispatcherHits) {
      // Extract the case literal: case 'foo_bar': or case 'self.caps': etc.
      const m = hit.content.match(/^case\s+'([^']+)'/);
      if (m && m[1]) {
        wiredSet.add(m[1]);
      }
    }

    const unwired = CAPABILITY_DEFINITIONS.filter((cap) => !wiredSet.has(cap.id));

    this.logger.log(
      `Gap scan: ${CAPABILITY_DEFINITIONS.length} registry caps, ` +
        `${wiredSet.size} wired, ${unwired.length} unwired`,
    );

    return {
      unwired,
      wired: [...wiredSet].sort(),
    };
  }
}
