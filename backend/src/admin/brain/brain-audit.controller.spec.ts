import { BadRequestException } from '@nestjs/common';
import { BrainAuditController } from './brain-audit.controller';
import {
  BrainSpineAuditService,
  type SpineAuditResult,
} from '../../brain/brain-spine-audit.service';

describe('BrainAuditController', () => {
  function buildController() {
    const audit: Pick<BrainSpineAuditService, 'audit'> = {
      audit: jest.fn(),
    };

    return {
      audit,
      controller: new BrainAuditController(audit as BrainSpineAuditService),
    };
  }

  describe('GET spine-audit', () => {
    it('returns audit result for the given since parameter', async () => {
      const { controller, audit } = buildController();
      const expected: SpineAuditResult = {
        capabilities: [
          {
            name: 'list_products',
            invocations: 3,
            spineEvents: 3,
            missing: 0,
            samples: [{ traceId: 'evt-1', at: '2026-05-12T10:00:00.000Z' }],
          },
        ],
        totalMismatch: 0,
        windowFrom: '2026-05-11T00:00:00.000Z',
        windowTo: '2026-05-12T10:00:00.000Z',
      };
      audit.audit = jest.fn().mockResolvedValue(expected);

      const result = await controller.spineAudit('2026-05-11T00:00:00.000Z');

      expect(audit.audit).toHaveBeenCalledWith('2026-05-11T00:00:00.000Z');
      expect(result).toEqual(expected);
    });

    it('defaults to last 24 hours when no since is provided', async () => {
      const { controller, audit } = buildController();
      const expected: SpineAuditResult = {
        capabilities: [],
        totalMismatch: 0,
        windowFrom: '2026-05-12T00:00:00.000Z',
        windowTo: '2026-05-12T10:00:00.000Z',
      };
      audit.audit = jest.fn().mockResolvedValue(expected);

      await controller.spineAudit();

      const [since] = audit.audit.mock.calls[0];
      expect(typeof since).toBe('string');
      expect(Number.isNaN(Date.parse(since))).toBe(false);
    });

    it('rejects malformed since with BadRequestException', async () => {
      const { controller } = buildController();
      await expect(controller.spineAudit('not-an-iso-date')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('normalizes since to canonical ISO before delegating', async () => {
      const { controller, audit } = buildController();
      audit.audit = jest.fn().mockResolvedValue({
        capabilities: [],
        totalMismatch: 0,
        windowFrom: '2026-05-11T00:00:00.000Z',
        windowTo: '2026-05-12T00:00:00.000Z',
      });

      await controller.spineAudit('2026-05-11T00:00:00Z');

      expect(audit.audit).toHaveBeenCalledWith('2026-05-11T00:00:00.000Z');
    });

    it('passes through mismatch counts when present', async () => {
      const { controller, audit } = buildController();
      const expected: SpineAuditResult = {
        capabilities: [
          {
            name: 'search_contact',
            invocations: 5,
            spineEvents: 2,
            missing: 3,
            samples: [
              { traceId: 'evt-a', at: '2026-05-12T10:00:00.000Z' },
              { traceId: 'evt-b', at: '2026-05-12T10:01:00.000Z' },
            ],
          },
        ],
        totalMismatch: 3,
        windowFrom: '2026-05-12T00:00:00.000Z',
        windowTo: '2026-05-12T10:00:00.000Z',
      };
      audit.audit = jest.fn().mockResolvedValue(expected);

      const result = await controller.spineAudit('2026-05-12T00:00:00.000Z');

      expect(result.totalMismatch).toBe(3);
      expect(result.capabilities[0].missing).toBe(3);
    });
  });
});
