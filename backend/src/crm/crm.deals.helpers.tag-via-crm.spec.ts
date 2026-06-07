/**
 * Census P2-13: flag-gated canonicalization of the deal-won tag write.
 *
 * `moveDeal` tags the contact 'cliente' when a deal lands in the "fechado"
 * stage. Historically this went through a local `addTagInline` helper that
 * DUPLICATES `CrmService.addTag`'s Tag-upsert + Contact-connect persistence.
 *
 * The `KLOEL_TAG_VIA_CRM` flag routes that write through an injected canonical
 * `addTagCanonical` callback (CrmService.addTag) when ON. These tests pin BOTH
 * states:
 *   - flag OFF (default) → legacy inline `$transaction` path runs, the canonical
 *     callback is NEVER invoked (byte-identical to pre-census behavior).
 *   - flag ON  → the canonical callback is invoked with (workspaceId, phone,
 *     'cliente') and the legacy inline `$transaction` is NOT run.
 */
import { moveDeal } from './crm.deals.helpers';
import { createPartialPrismaMock, type PrismaMockRecord } from '../../test/helpers/prisma.mock';
import type { PrismaService } from '../prisma/prisma.service';

const WS = 'ws-1';
const DEAL_ID = 'deal-1';
const NEW_STAGE_ID = 'stage-closed';
const PHONE = '+5511999999999';

/** Wire a mock so moveDeal lands the deal in the "fechado" (won) stage. */
function primeWonMove(prisma: PrismaMockRecord): void {
  prisma.deal.findUnique.mockResolvedValue({
    id: DEAL_ID,
    contact: { id: 'c1', workspaceId: WS, customFields: {}, phone: PHONE },
    stage: { name: 'Em Negociação', pipeline: { workspaceId: WS } },
  });
  prisma.stage.findUnique.mockResolvedValue({
    id: NEW_STAGE_ID,
    pipeline: { workspaceId: WS },
  });
  prisma.deal.update.mockResolvedValue({
    id: DEAL_ID,
    value: 100,
    contact: { id: 'c1', workspaceId: WS, phone: PHONE },
    stage: { name: 'Fechado' },
  });
}

describe('moveDeal — KLOEL_TAG_VIA_CRM deal-won tag routing (census P2-13)', () => {
  let prisma: PrismaMockRecord;
  const prev = process.env.KLOEL_TAG_VIA_CRM;

  beforeEach(() => {
    prisma = createPartialPrismaMock({
      deal: ['findUnique', 'update'],
      stage: ['findUnique'],
      tag: ['upsert'],
      contact: ['update'],
      autopilotEvent: ['create'],
    });
    // $transaction interactive mode is provided by the mock factory: it calls
    // the callback with the mock itself as `tx`, so addTagInline's tag.upsert +
    // contact.update run against these mocks.
    prisma.tag.upsert.mockResolvedValue({ id: 'tag-cliente' });
    prisma.contact.update.mockResolvedValue({ id: 'c1' });
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.KLOEL_TAG_VIA_CRM;
    } else {
      process.env.KLOEL_TAG_VIA_CRM = prev;
    }
    jest.restoreAllMocks();
  });

  it('flag OFF (default): runs legacy inline tag $transaction, never calls the canonical callback', async () => {
    delete process.env.KLOEL_TAG_VIA_CRM;
    primeWonMove(prisma);
    const addTagCanonical = jest.fn().mockResolvedValue(undefined);

    await moveDeal(
      prisma as unknown as PrismaService,
      WS,
      DEAL_ID,
      NEW_STAGE_ID,
      undefined,
      addTagCanonical,
    );

    expect(addTagCanonical).not.toHaveBeenCalled();
    // legacy inline path: tag upsert + contact connect inside the transaction
    expect(prisma.tag.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_name: { workspaceId: WS, name: 'cliente' } },
      }),
    );
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId_phone: { workspaceId: WS, phone: PHONE } },
        data: { tags: { connect: { id: 'tag-cliente' } } },
      }),
    );
  });

  it('flag ON: routes through the canonical callback and skips the legacy inline $transaction', async () => {
    process.env.KLOEL_TAG_VIA_CRM = 'true';
    primeWonMove(prisma);
    const addTagCanonical = jest.fn().mockResolvedValue(undefined);

    await moveDeal(
      prisma as unknown as PrismaService,
      WS,
      DEAL_ID,
      NEW_STAGE_ID,
      undefined,
      addTagCanonical,
    );

    expect(addTagCanonical).toHaveBeenCalledTimes(1);
    expect(addTagCanonical).toHaveBeenCalledWith(WS, PHONE, 'cliente');
    // canonical path replaces the inline transaction
    expect(prisma.tag.upsert).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });

  it('flag ON but no canonical callback threaded: falls back to legacy inline path (byte-identical)', async () => {
    process.env.KLOEL_TAG_VIA_CRM = 'true';
    primeWonMove(prisma);

    await moveDeal(prisma as unknown as PrismaService, WS, DEAL_ID, NEW_STAGE_ID, undefined);

    // no callback available → guard short-circuits to addTagInline
    expect(prisma.tag.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.contact.update).toHaveBeenCalledTimes(1);
  });

  it('non-won stage: neither tag path runs regardless of flag', async () => {
    process.env.KLOEL_TAG_VIA_CRM = 'true';
    prisma.deal.findUnique.mockResolvedValue({
      id: DEAL_ID,
      contact: { id: 'c1', workspaceId: WS, customFields: {}, phone: PHONE },
      stage: { name: 'Lead', pipeline: { workspaceId: WS } },
    });
    prisma.stage.findUnique.mockResolvedValue({
      id: 'stage-open',
      pipeline: { workspaceId: WS },
    });
    prisma.deal.update.mockResolvedValue({
      id: DEAL_ID,
      value: 0,
      contact: { id: 'c1', workspaceId: WS, phone: PHONE },
      stage: { name: 'Em Negociação' },
    });
    const addTagCanonical = jest.fn().mockResolvedValue(undefined);

    await moveDeal(
      prisma as unknown as PrismaService,
      WS,
      DEAL_ID,
      'stage-open',
      undefined,
      addTagCanonical,
    );

    expect(addTagCanonical).not.toHaveBeenCalled();
    expect(prisma.tag.upsert).not.toHaveBeenCalled();
    expect(prisma.contact.update).not.toHaveBeenCalled();
  });
});
