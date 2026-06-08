import { MindCaseMemoryService } from './mind-case-memory.service';
import { MindMultiModalPerceptionService } from '../perception/mind-multimodal-perception.service';
import { MindCanonicalService } from '../mind-canonical.service';
import { castMock } from '../../../../test/helpers/cast-mock';

/**
 * P2-6 — flag-gated canonicalization of the two direct `prisma.mindCase.create`
 * writers (`MindMultiModalPerceptionService.captureToCaseMemory` and
 * `MindCanonicalService.recordCase`) onto `MindCaseMemoryService.recordCase`.
 *
 * The contract under test:
 *   - flag OFF (default) → each writer keeps its EXACT direct
 *     `prisma.mindCase.create`; `recordCase` is NEVER invoked; `tokens` stays
 *     as the writer's literal value (`[]` / caller-supplied).
 *   - flag ON + `MindCaseMemoryService` injected → each writer DELEGATES to
 *     `recordCase`, which derives `tokens` from `text` (the token-extraction
 *     invariant) and generates the row id.
 *   - flag ON but NO `MindCaseMemoryService` injected → the guard
 *     (`&& this.caseMemory`) falls back to the direct create (byte-identical to
 *     flag OFF), so a missing dep can never break the writer.
 */
describe('KLOEL_MINDCASE_VIA_RECORDCASE flag-gated mindCase.create canonicalization', () => {
  const FLAG = 'KLOEL_MINDCASE_VIA_RECORDCASE';
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env[FLAG];
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  });

  function makeCasePrisma() {
    return {
      mindCase: {
        create: jest.fn((args: { data: { id: string } }) => Promise.resolve({ id: args.data.id })),
      },
    };
  }

  // ── MindMultiModalPerceptionService.captureToCaseMemory ──────────────────

  describe('captureToCaseMemory', () => {
    it('flag OFF → direct prisma.mindCase.create with tokens:[]; recordCase never called', async () => {
      const directPrisma = makeCasePrisma();
      const caseMemoryPrisma = makeCasePrisma();
      const caseMemory = new MindCaseMemoryService(caseMemoryPrisma as never);
      const recordSpy = jest.spyOn(caseMemory, 'recordCase');

      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        undefined,
        undefined,
        directPrisma as never,
        caseMemory,
      );

      const out = await svc.captureToCaseMemory({
        workspaceId: 'ws-1',
        subject: 'contact:42',
        modality: 'image',
        sourceFingerprint: 'abc123',
        mimeType: 'image/png',
        descriptor: 'a cat',
      });

      expect(recordSpy).not.toHaveBeenCalled();
      expect(directPrisma.mindCase.create).toHaveBeenCalledTimes(1);
      const data = castMock<[{ data: Record<string, unknown> }]>(
        directPrisma.mindCase.create.mock.calls[0],
      )[0].data;
      expect(data.tokens).toEqual([]);
      expect(data.id).toBe(out.caseId);
    });

    it('flag ON + caseMemory → routes through recordCase; tokens derived from text', async () => {
      process.env[FLAG] = 'true';
      const directPrisma = makeCasePrisma();
      const caseMemoryPrisma = makeCasePrisma();
      const caseMemory = new MindCaseMemoryService(caseMemoryPrisma as never);
      const recordSpy = jest.spyOn(caseMemory, 'recordCase');

      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        undefined,
        undefined,
        directPrisma as never,
        caseMemory,
      );

      const out = await svc.captureToCaseMemory({
        workspaceId: 'ws-1',
        subject: 'contact:42',
        modality: 'image',
        sourceFingerprint: 'abc123',
        mimeType: 'image/png',
        descriptor: 'gato bonito',
      });

      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(directPrisma.mindCase.create).not.toHaveBeenCalled();
      expect(caseMemoryPrisma.mindCase.create).toHaveBeenCalledTimes(1);
      const data = castMock<[{ data: Record<string, unknown> }]>(
        caseMemoryPrisma.mindCase.create.mock.calls[0],
      )[0].data;
      // recordCase tokenizes the text — the captured descriptor becomes retrievable.
      expect(data.tokens).toEqual(expect.arrayContaining(['gato', 'bonito', 'captured']));
      expect(data.caseType).toBe('perception_captured');
      expect(data.action).toBe('perceive_image');
      expect(data.outcome).toBeNull();
      // returned caseId is the recordCase-generated row id.
      expect(out.caseId).toBe(data.id);
    });

    it('flag ON but NO caseMemory → falls back to direct create (byte-identical to OFF)', async () => {
      process.env[FLAG] = 'true';
      const directPrisma = makeCasePrisma();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        undefined,
        undefined,
        directPrisma as never,
        // no caseMemory injected
      );

      const out = await svc.captureToCaseMemory({
        workspaceId: 'ws-1',
        subject: 's',
        modality: 'structured',
        sourceFingerprint: 'x',
        mimeType: 'application/json',
      });

      expect(directPrisma.mindCase.create).toHaveBeenCalledTimes(1);
      const data = castMock<[{ data: Record<string, unknown> }]>(
        directPrisma.mindCase.create.mock.calls[0],
      )[0].data;
      expect(data.tokens).toEqual([]);
      expect(data.id).toBe(out.caseId);
    });
  });

  // ── MindCanonicalService.recordCase ──────────────────────────────────────

  describe('MindCanonicalService.recordCase', () => {
    function makeFacade(caseMemory?: MindCaseMemoryService) {
      const facadePrisma = makeCasePrisma();
      const facade = new MindCanonicalService(
        facadePrisma as never,
        undefined,
        undefined,
        caseMemory,
      );
      return { facade, facadePrisma };
    }

    const baseInput = {
      workspaceId: 'ws-2',
      subject: 's',
      caseType: 'chat',
      text: 'preco do produto premium',
      tokens: ['caller-token'],
      features: { f: 1 },
      action: 'reply',
      occurredAt: new Date('2026-05-29T00:00:00.000Z'),
      outcome: 0.5 as number | null,
    };

    it('flag OFF → direct prisma.mindCase.create, caller tokens preserved verbatim', async () => {
      const caseMemoryPrisma = makeCasePrisma();
      const caseMemory = new MindCaseMemoryService(caseMemoryPrisma as never);
      const recordSpy = jest.spyOn(caseMemory, 'recordCase');
      const { facade, facadePrisma } = makeFacade(caseMemory);

      await facade.recordCase(baseInput);

      expect(recordSpy).not.toHaveBeenCalled();
      expect(facadePrisma.mindCase.create).toHaveBeenCalledTimes(1);
      const data = castMock<[{ data: Record<string, unknown> }]>(
        facadePrisma.mindCase.create.mock.calls[0],
      )[0].data;
      expect(data.tokens).toEqual(['caller-token']);
      expect(data.outcome).toBe(0.5);
    });

    it('flag ON + caseMemory → routes through recordCase; tokens re-derived from text', async () => {
      process.env[FLAG] = 'true';
      const caseMemoryPrisma = makeCasePrisma();
      const caseMemory = new MindCaseMemoryService(caseMemoryPrisma as never);
      const recordSpy = jest.spyOn(caseMemory, 'recordCase');
      const { facade, facadePrisma } = makeFacade(caseMemory);

      await facade.recordCase(baseInput);

      expect(recordSpy).toHaveBeenCalledTimes(1);
      expect(facadePrisma.mindCase.create).not.toHaveBeenCalled();
      expect(caseMemoryPrisma.mindCase.create).toHaveBeenCalledTimes(1);
      const data = castMock<[{ data: Record<string, unknown> }]>(
        caseMemoryPrisma.mindCase.create.mock.calls[0],
      )[0].data;
      // recordCase ignores caller tokens and tokenizes the text instead.
      expect(data.tokens).not.toEqual(['caller-token']);
      expect(data.tokens).toEqual(expect.arrayContaining(['preco', 'produto', 'premium']));
      expect(data.outcome).toBe(0.5);
      expect(data.caseType).toBe('chat');
    });

    it('flag ON + outcome:null → recordCase persists null (value-equivalent to facade default)', async () => {
      process.env[FLAG] = 'true';
      const caseMemoryPrisma = makeCasePrisma();
      const caseMemory = new MindCaseMemoryService(caseMemoryPrisma as never);
      const { facade } = makeFacade(caseMemory);

      await facade.recordCase({ ...baseInput, outcome: null });

      const data = castMock<[{ data: Record<string, unknown> }]>(
        caseMemoryPrisma.mindCase.create.mock.calls[0],
      )[0].data;
      expect(data.outcome).toBeNull();
    });

    it('flag ON but NO caseMemory → falls back to direct create (byte-identical to OFF)', async () => {
      process.env[FLAG] = 'true';
      const { facade, facadePrisma } = makeFacade(undefined);

      await facade.recordCase(baseInput);

      expect(facadePrisma.mindCase.create).toHaveBeenCalledTimes(1);
      const data = castMock<[{ data: Record<string, unknown> }]>(
        facadePrisma.mindCase.create.mock.calls[0],
      )[0].data;
      expect(data.tokens).toEqual(['caller-token']);
    });
  });
});
