import type { AdminAction, AdminModule, AdminRole } from '@prisma/client';

/**
 * A tool exposed to the admin AI chat LLM. Tools are either
 * `read` (executed immediately) or `intent` (wraps a SP-8
 * DestructiveIntent create — the LLM never triggers a domain
 * side-effect directly, only proposes one).
 *
 * I-ADMIN-C1: `kind === 'read'` is the default. `intent` tools
 * must only call the DestructiveIntentService to *create* an
 * intent; they never invoke domain mutations themselves.
 */
export interface ChatTool {
  /** Name property. */
  readonly name: string;
  /** Kind property. */
  readonly kind: 'read' | 'intent';
  /** Description property. */
  readonly description: string;
  /** Permission module property. */
  readonly permissionModule: AdminModule;
  /** Permission action property. */
  readonly permissionAction: AdminAction;
  /** Input schema property. */
  readonly inputSchema: Record<string, unknown>; // JSON Schema
  /** Execute. */
  execute(
    args: Record<string, unknown>,
    context?: { adminUserId: string; adminRole: AdminRole },
  ): Promise<Record<string, unknown>>;
}

/**
 * Registry that holds every tool the admin LLM may call. Modules
 * register their tools during bootstrap. The chat service resolves
 * tools per turn and filters the exposed subset by the current
 * admin's permission matrix (I-ADMIN-C2) — the LLM never sees the
 * full catalogue.
 */
export class ChatToolRegistry {
  private readonly tools = new Map<string, ChatTool>();

  /** Register. */
  register(tool: ChatTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`ChatTool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Resolve. */
  resolve(name: string): ChatTool | null {
    return this.tools.get(name) ?? null;
  }

  /** List all. */
  listAll(): ChatTool[] {
    return Array.from(this.tools.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
}
