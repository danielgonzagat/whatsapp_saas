import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import type { ChatCompletionFunctionTool, ChatCompletionTool } from 'openai/resources/chat';
import { UNIFIED_AGENT_TOOLS_CONTROL } from './unified-agent-tools-control';
import { UNIFIED_AGENT_TOOLS_MESSAGING } from './unified-agent-tools-messaging';
import { UNIFIED_AGENT_TOOLS_PRODUCT } from './unified-agent-tools-product';
import { UNIFIED_AGENT_TOOLS_SALES } from './unified-agent-tools-sales';
import { getBrainCapabilityRisk, isBrainCapabilityAllowed } from './brain-capability-policy';
import type { BrainSource } from './brain-runtime.dto';

export interface BrainCapabilityDefinition {
  description: string;
  domain: BrainCapabilityDomain;
  name: string;
  parameters: unknown;
  risk: ReturnType<typeof getBrainCapabilityRisk>;
}

export type BrainCapabilityDomain = 'control' | 'messaging' | 'product' | 'sales';

const TOOL_GROUPS: Array<{
  domain: BrainCapabilityDomain;
  tools: ChatCompletionTool[];
}> = [
  { domain: 'sales', tools: UNIFIED_AGENT_TOOLS_SALES },
  { domain: 'messaging', tools: UNIFIED_AGENT_TOOLS_MESSAGING },
  { domain: 'product', tools: UNIFIED_AGENT_TOOLS_PRODUCT },
  { domain: 'control', tools: UNIFIED_AGENT_TOOLS_CONTROL },
];

@Injectable()
export class BrainCapabilityRegistryService {
  private readonly logger = StructuredLogger.from(BrainCapabilityRegistryService.name);

  constructor() {
    this.logger.debug?.(`BrainCapabilityRegistryService initialized`);
  }

  list(): BrainCapabilityDefinition[] {
    return TOOL_GROUPS.flatMap((group) =>
      group.tools
        .filter((tool): tool is ChatCompletionFunctionTool => tool.type === 'function')
        .map((tool) => ({
          domain: group.domain,
          name: tool.function.name,
          description: tool.function.description ?? '',
          parameters: tool.function.parameters,
          risk: getBrainCapabilityRisk(tool.function.name),
        })),
    ).sort((left, right) => left.name.localeCompare(right.name));
  }

  allowedFor(source: BrainSource): string[] {
    return this.list()
      .filter((capability) => isBrainCapabilityAllowed(source, capability.name))
      .map((capability) => capability.name);
  }

  grouped(): Record<BrainCapabilityDomain, BrainCapabilityDefinition[]> {
    return this.list().reduce<Record<BrainCapabilityDomain, BrainCapabilityDefinition[]>>(
      (groups, capability) => {
        groups[capability.domain].push(capability);
        return groups;
      },
      {
        control: [],
        messaging: [],
        product: [],
        sales: [],
      },
    );
  }
}
