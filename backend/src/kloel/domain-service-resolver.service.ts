import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { StructuredLogger } from '../logging/structured-logger';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { UnknownRecord } from '../common/types';
import {
  executeCompound,
  invokeService,
  type ResolverContext,
  type ToolResult,
} from './domain-service-resolver.helpers';

/** Maps capability domainService strings to NestJS service instances via ModuleRef DI. */
@Injectable()
export class KloelDomainServiceResolver {
  private readonly logger = StructuredLogger.from(KloelDomainServiceResolver.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly capRegistryV2: CapabilityRegistryV2Service,
  ) {}

  /** Dispatch context handed to the extracted resolver helpers. */
  private get ctx(): ResolverContext {
    return { moduleRef: this.moduleRef, logger: this.logger };
  }

  /**
   * Try to execute a tool via the domain service resolver.
   *
   * @returns ToolResult on successful resolve+call, or null if the capability
   *          is not found OR has no parsable domainService (so the dispatcher
   *          continues with old behavior).
   */
  async tryExecute(
    toolName: string,
    workspaceId: string,
    args: UnknownRecord,
  ): Promise<ToolResult | null> {
    const cap = this.capRegistryV2.get(toolName);
    if (!cap) {
      return null;
    }

    const domainService = cap.domainService;
    // No domainService or placeholder alias — skip, let old dispatcher handle
    if (!domainService || domainService.startsWith('Alias for')) {
      return null;
    }

    // Compound references like "MediaService.attach + ProductService.setImage"
    // describe a two-step pipeline: upload the chat image first, then hand the
    // resulting URL to the entity setter. Detected by the ' + ' join token.
    if (domainService.includes(' + ')) {
      return executeCompound(this.ctx, domainService, workspaceId, args, toolName);
    }

    // Parse "ServiceName.methodName" — dot is the separator
    const dotIdx = domainService.indexOf('.');
    if (dotIdx === -1) {
      this.logger.warn('domainService sem ponto', { domainService, toolName });
      return null;
    }

    const serviceName = domainService.slice(0, dotIdx);
    const methodName = domainService.slice(dotIdx + 1);

    return invokeService(this.ctx, serviceName, methodName, workspaceId, args, toolName);
  }
}
