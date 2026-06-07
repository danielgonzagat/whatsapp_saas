import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  emitMoneyCampaignGeneratedPercept,
  emitMoneyLeadScanPercept,
  MONEY_CAMPAIGN_GENERATED_EVENT_TYPE,
  MONEY_LEAD_SCAN_EVENT_TYPE,
} from './money-percept-emit.helper';

const FLAG = 'KLOEL_MONEY_PERCEPT_ENABLED';

function makeDeps() {
  const upsert = jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const prisma = { mindOutboxEvent: { upsert } } as never;
  const logger = { warn: jest.fn() };
  return { upsert, prisma, logger };
}

describe('money percept emit helpers', () => {
  const prev = process.env[FLAG];

  beforeEach(() => {
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
    jest.clearAllMocks();
  });

  describe('emitMoneyLeadScanPercept', () => {
    it('flag OFF (default): no outbox write fires and returns false', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyLeadScanPercept(prisma, logger, {
        workspaceId: 'ws_1',
        inactiveLeads: 42,
        scanId: 'scan_1',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag set to a non-"true" value stays inert', async () => {
      process.env[FLAG] = 'false';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyLeadScanPercept(prisma, logger, {
        workspaceId: 'ws_1',
        inactiveLeads: 42,
        scanId: 'scan_1',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical lead-scan percept into the outbox', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyLeadScanPercept(prisma, logger, {
        workspaceId: 'ws_1',
        inactiveLeads: 42,
        scanId: 'scan_1',
      });

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.money.lead_scan:scan_1',
      });
      expect(arg.create.eventType).toBe(MONEY_LEAD_SCAN_EVENT_TYPE);
      expect(arg.create.subject).toBe('money:scan:scan_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      expect(arg.create.payload).toMatchObject({
        scanId: 'scan_1',
        inactiveLeads: 42,
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyLeadScanPercept(prisma, logger, {
        workspaceId: '',
        inactiveLeads: 42,
        scanId: 'scan_1',
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON + outbox throws: swallows the error and warn-logs (never breaks the caller)', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();
      upsert.mockRejectedValueOnce(new Error('db down'));

      const attempted = await emitMoneyLeadScanPercept(prisma, logger, {
        workspaceId: 'ws_1',
        inactiveLeads: 42,
        scanId: 'scan_1',
      });

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('emitMoneyCampaignGeneratedPercept', () => {
    it('flag OFF (default): no outbox write fires and returns false', async () => {
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyCampaignGeneratedPercept(prisma, logger, {
        workspaceId: 'ws_1',
        campaignId: 'camp_1',
        flowId: 'flow_1',
        inactiveLeads: 42,
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON: upserts ONE canonical campaign-generated decision percept into the outbox', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyCampaignGeneratedPercept(prisma, logger, {
        workspaceId: 'ws_1',
        campaignId: 'camp_1',
        flowId: 'flow_1',
        inactiveLeads: 42,
      });

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);

      const arg = (upsert.mock.calls[0] as unknown[])[0] as {
        where: { workspaceId_idempotencyKey: { workspaceId: string; idempotencyKey: string } };
        create: { eventType: string; subject: string; workspaceId: string; payload: unknown };
      };
      expect(arg.where.workspaceId_idempotencyKey).toEqual({
        workspaceId: 'ws_1',
        idempotencyKey: 'cognition.money.campaign_generated:camp_1',
      });
      expect(arg.create.eventType).toBe(MONEY_CAMPAIGN_GENERATED_EVENT_TYPE);
      expect(arg.create.subject).toBe('money:campaign:camp_1');
      expect(arg.create.workspaceId).toBe('ws_1');
      // The percept IS the decision record the Mind perceives — it carries the
      // decisionType / chosenAction the MindEventSpine maps into a commercial row.
      expect(arg.create.payload).toMatchObject({
        campaignId: 'camp_1',
        flowId: 'flow_1',
        inactiveLeads: 42,
        decisionType: 'money_machine.reactivation',
        chosenAction: 'generate_campaign',
      });
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('flag ON but no workspaceId: stays inert', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();

      const attempted = await emitMoneyCampaignGeneratedPercept(prisma, logger, {
        workspaceId: '',
        campaignId: 'camp_1',
        flowId: 'flow_1',
        inactiveLeads: 42,
      });

      expect(attempted).toBe(false);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('flag ON + outbox throws: swallows the error and warn-logs (never breaks the caller)', async () => {
      process.env[FLAG] = 'true';
      const { upsert, prisma, logger } = makeDeps();
      upsert.mockRejectedValueOnce(new Error('db down'));

      const attempted = await emitMoneyCampaignGeneratedPercept(prisma, logger, {
        workspaceId: 'ws_1',
        campaignId: 'camp_1',
        flowId: 'flow_1',
        inactiveLeads: 42,
      });

      expect(attempted).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
