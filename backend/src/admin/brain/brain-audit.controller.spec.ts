import { BrainAuditController } from './brain-audit.controller';
import { BrainSpineAuditService, SpineAuditResult } from '../../brain/brain-spine-audit.service';

describe('BrainAuditController', () => {
  function buildController() {
    const audit = {
      audit: jest.fn(),
    } as unknown as BrainSpineAuditService;

    return {
      audit,
      controller: new BrainAuditController(audit),
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

      expect(audit.audit).toHaveBeenCalledWith(expect.any(String));
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
