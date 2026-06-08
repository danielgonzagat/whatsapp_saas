import {
  appendWireContext,
  buildWireContextBlock,
  captureTurnMemory,
  type WireContextServices,
} from './kloel-thinker.wire-context.helpers';
import type { StructuredLogger } from '../logging/structured-logger';
import type { MemoryService } from './mind/memory/memory.service';
import type { ManifestInjectionBuilderService } from './manifest/manifest-injection.builder';
import type { MemoryContextForModel } from './mind/memory/memory-graph.types';
import type { ManifestInjection } from './manifest/manifest-injection.builder';

function makeLogger(): StructuredLogger {
  return {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as StructuredLogger;
}

const MEMORY_TEXT =
  'MEMÓRIA DO USUÁRIO (aprendida em conversas anteriores):\n\nPERFIL DO USUÁRIO (estável):\n- O usuário se chama Daniel';
const MANIFEST_TEXT =
  '<<<KLOEL_CAPABILITY_MANIFEST>>>\nCAPACIDADES DISPONÍVEIS (opcionais, selecionadas para este turno):\n- products.create: Cria um produto\n<<<END_KLOEL_CAPABILITY_MANIFEST>>>';

function memoryContext(text: string): MemoryContextForModel {
  return {
    userProfileStatic: ['O usuário se chama Daniel'],
    userProfileDynamic: [],
    relevantMemories: [],
    preferences: ['Prefere respostas diretas'],
    constraints: [],
    text,
  };
}

function manifestInjection(text: string, internalNames: string[]): ManifestInjection {
  return { text, internalNames };
}

describe('wire-context helpers', () => {
  describe('buildWireContextBlock', () => {
    it('injects both the memory block and the manifest block when available', async () => {
      const buildMemoryContextForModel = jest.fn().mockResolvedValue(memoryContext(MEMORY_TEXT));
      const assemble = jest
        .fn()
        .mockReturnValue(manifestInjection(MANIFEST_TEXT, ['products.create']));
      const memoryService = { buildMemoryContextForModel } as unknown as MemoryService;
      const manifestInjectionBuilder = { assemble } as unknown as ManifestInjectionBuilderService;
      const services: WireContextServices = {
        memoryService,
        manifestInjection: manifestInjectionBuilder,
      };

      const block = await buildWireContextBlock(services, makeLogger(), {
        workspaceId: 'ws-1',
        userId: 'user-1',
        message: 'criar um produto',
        surface: 'chat',
        permissions: ['*'],
      });

      expect(block.text).toContain('MEMÓRIA DO USUÁRIO');
      expect(block.text).toContain('O usuário se chama Daniel');
      expect(block.text).toContain('CAPACIDADES DISPONÍVEIS');
      expect(block.internalNames).toEqual(['products.create']);
      expect(block.memoryChecked).toBe(true);
      expect(block.memorySignalCount).toBe(2);
      expect(block.capabilitySignalCount).toBe(1);
      expect(buildMemoryContextForModel).toHaveBeenCalledWith('ws-1', 'user-1', 'criar um produto');
      expect(assemble).toHaveBeenCalledWith('criar um produto', {
        surface: 'dashboard-chat',
        permissions: ['*'],
      });
    });

    it('still injects the manifest when the memory service throws (independent guards)', async () => {
      const warn = jest.fn();
      const logger = { ...makeLogger(), warn } as unknown as StructuredLogger;
      const buildMemoryContextForModel = jest.fn().mockRejectedValue(new Error('db down'));
      const assemble = jest
        .fn()
        .mockReturnValue(manifestInjection(MANIFEST_TEXT, ['products.create']));
      const memoryService = { buildMemoryContextForModel } as unknown as MemoryService;
      const manifestInjectionBuilder = { assemble } as unknown as ManifestInjectionBuilderService;

      const block = await buildWireContextBlock(
        { memoryService, manifestInjection: manifestInjectionBuilder },
        logger,
        {
          workspaceId: 'ws-1',
          userId: 'user-1',
          message: 'oi',
          surface: 'chat',
          permissions: undefined,
        },
      );

      expect(block.text).toContain('CAPACIDADES DISPONÍVEIS');
      expect(block.text).not.toContain('MEMÓRIA DO USUÁRIO');
      expect(warn).toHaveBeenCalledWith(
        'wire-context memory injection failed',
        expect.objectContaining({ error: 'db down' }),
      );
      // permissions undefined -> normalized to an empty array for the router.
      expect(assemble).toHaveBeenCalledWith('oi', {
        surface: 'dashboard-chat',
        permissions: [],
      });
    });

    it('returns an empty block when the manifest assembler throws and there is no memory', async () => {
      const warn = jest.fn();
      const logger = { ...makeLogger(), warn } as unknown as StructuredLogger;
      const assemble = jest.fn().mockImplementation(() => {
        throw new Error('router boom');
      });
      const manifestInjectionBuilder = { assemble } as unknown as ManifestInjectionBuilderService;

      const block = await buildWireContextBlock(
        { manifestInjection: manifestInjectionBuilder },
        logger,
        {
          workspaceId: 'ws-1',
          userId: 'user-1',
          message: 'oi',
          surface: 'chat',
          permissions: [],
        },
      );

      expect(block.text).toBe('');
      expect(block.internalNames).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        'wire-context manifest injection failed',
        expect.objectContaining({ error: 'router boom' }),
      );
    });

    it('returns an empty block when no services are provided', async () => {
      const block = await buildWireContextBlock({}, makeLogger(), {
        workspaceId: 'ws-1',
        userId: 'user-1',
        message: 'oi',
        surface: 'chat',
        permissions: [],
      });
      expect(block.text).toBe('');
      expect(block.internalNames).toEqual([]);
    });

    it('skips memory recall when workspace/user are missing', async () => {
      const buildMemoryContextForModel = jest.fn();
      const memoryService = { buildMemoryContextForModel } as unknown as MemoryService;
      const block = await buildWireContextBlock({ memoryService }, makeLogger(), {
        workspaceId: undefined,
        userId: undefined,
        message: 'oi',
        surface: 'chat',
        permissions: [],
      });
      expect(buildMemoryContextForModel).not.toHaveBeenCalled();
      expect(block.text).toBe('');
    });
  });

  describe('appendWireContext', () => {
    it('appends the block after existing dynamic context', () => {
      const result = appendWireContext('RUNTIME', {
        text: 'MEMORY',
        internalNames: [],
        memoryChecked: true,
        memorySignalCount: 1,
        capabilitySignalCount: 0,
      });
      expect(result).toBe('RUNTIME\n\nMEMORY');
    });

    it('returns the block alone when there is no existing dynamic context', () => {
      const result = appendWireContext('', {
        text: 'MEMORY',
        internalNames: [],
        memoryChecked: true,
        memorySignalCount: 1,
        capabilitySignalCount: 0,
      });
      expect(result).toBe('MEMORY');
    });

    it('is a no-op (byte-identical) when the block is empty', () => {
      const result = appendWireContext('RUNTIME', {
        text: '',
        internalNames: [],
        memoryChecked: false,
        memorySignalCount: 0,
        capabilitySignalCount: 0,
      });
      expect(result).toBe('RUNTIME');
    });
  });

  describe('captureTurnMemory', () => {
    it('extracts memories from the turn fire-and-forget when available', () => {
      const extractFromTurn = jest.fn().mockResolvedValue({
        created: 1,
        updated: 0,
        contradictions: 0,
        forgotten: 0,
        nodeIds: [],
      });
      const memoryService = { extractFromTurn } as unknown as MemoryService;

      captureTurnMemory({ memoryService }, makeLogger(), {
        workspaceId: 'ws-1',
        userId: 'user-1',
        message: 'meu nome é Daniel',
        reply: 'Prazer, Daniel!',
      });

      expect(extractFromTurn).toHaveBeenCalledWith(
        'ws-1',
        'user-1',
        'Usuário: meu nome é Daniel\n\nKloel: Prazer, Daniel!',
      );
    });

    it('swallows a rejected extraction so the turn is never broken', async () => {
      const warn = jest.fn();
      const logger = { ...makeLogger(), warn } as unknown as StructuredLogger;
      const extractFromTurn = jest.fn().mockRejectedValue(new Error('extract failed'));
      const memoryService = { extractFromTurn } as unknown as MemoryService;

      expect(() =>
        captureTurnMemory({ memoryService }, logger, {
          workspaceId: 'ws-1',
          userId: 'user-1',
          message: 'oi',
          reply: 'olá',
        }),
      ).not.toThrow();

      // Let the swallowed rejection settle.
      await Promise.resolve();
      await Promise.resolve();
      expect(warn).toHaveBeenCalledWith(
        'wire-context memory capture failed',
        expect.objectContaining({ error: 'extract failed' }),
      );
    });

    it('is a no-op when no memory service or no workspace/user', () => {
      const extractFromTurn = jest.fn();
      const memoryService = { extractFromTurn } as unknown as MemoryService;
      captureTurnMemory({}, makeLogger(), {
        workspaceId: 'ws-1',
        userId: 'user-1',
        message: 'oi',
        reply: 'olá',
      });
      captureTurnMemory({ memoryService }, makeLogger(), {
        workspaceId: undefined,
        userId: 'user-1',
        message: 'oi',
        reply: 'olá',
      });
      expect(extractFromTurn).not.toHaveBeenCalled();
    });
  });
});
