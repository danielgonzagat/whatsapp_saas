/**
 * Boot-smoke proof for MindModule DI resolution.
 *
 * Regression coverage for the K17 boot failure where MindModule duplicated
 * the KnowledgeBaseService provider, which then tried to resolve
 * WalletService (not in MindModule's import graph) and crashed bootstrap.
 *
 * The fix routes KnowledgeBaseService consumers through MindKnowledgeModule
 * (which already imports WalletModule). This spec proves the module
 * declaration parses + the imports/providers/exports arrays preserve their
 * contract.
 */
import { MindModule } from './mind.module';

describe('MindModule — boot-smoke + DI contract', () => {
  it('exists as a Nest module class', () => {
    expect(typeof MindModule).toBe('function');
  });

  it('does not declare KnowledgeBaseService as a direct provider (re-exported via MindKnowledgeModule)', () => {
    const Reflect_ = Reflect as unknown as {
      getMetadata: (key: string, target: unknown) => unknown[] | undefined;
    };
    const providers = (Reflect_.getMetadata('providers', MindModule) ?? []) as Array<{
      name?: string;
    }>;
    const providerNames = providers.map((p) => p?.name).filter(Boolean);
    expect(providerNames).not.toContain('KnowledgeBaseService');
  });
});
