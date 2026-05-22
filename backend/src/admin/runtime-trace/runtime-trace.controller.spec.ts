import { BadRequestException } from '@nestjs/common';
import { RuntimeTraceController } from './runtime-trace.controller';

describe('RuntimeTraceController', () => {
  const getTrace = jest.fn();

  let controller: RuntimeTraceController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RuntimeTraceController({
      getTrace,
    } as never);
  });

  describe('getTrace', () => {
    it('calls service with correct identity args and returns formatted response', () => {
      getTrace.mockReturnValue([
        { kind: 'step1_inbox_recorded', timestamp: 1715700000000, detail: { msg: 'hello' } },
        { kind: 'step2_contact_resolved', timestamp: 1715700001000, detail: { name: 'John' } },
      ]);

      const result = controller.getTrace('ws-1', 'ct-1', 'corr-1');

      expect(getTrace).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        contactId: 'ct-1',
        correlationId: 'corr-1',
      });
      expect(result).toMatchObject({
        workspaceId: 'ws-1',
        contactId: 'ct-1',
        correlationId: 'corr-1',
        events: [
          {
            kind: 'step1_inbox_recorded',
            timestamp: new Date(1715700000000).toISOString(),
            detail: { msg: 'hello' },
          },
          {
            kind: 'step2_contact_resolved',
            timestamp: new Date(1715700001000).toISOString(),
            detail: { name: 'John' },
          },
        ],
      });
    });

    it('returns empty events when service returns no trace', () => {
      getTrace.mockReturnValue([]);

      const result = controller.getTrace('ws-1', 'ct-1', 'corr-1');

      expect(result.events).toEqual([]);
      expect(result.workspaceId).toBe('ws-1');
    });

    it('throws BadRequestException when workspaceId is missing', () => {
      expect(() => controller.getTrace('', 'ct-1', 'corr-1')).toThrow(BadRequestException);
      expect(getTrace).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when contactId is missing', () => {
      expect(() => controller.getTrace('ws-1', '', 'corr-1')).toThrow(BadRequestException);
      expect(getTrace).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when correlationId is missing', () => {
      expect(() => controller.getTrace('ws-1', 'ct-1', '')).toThrow(BadRequestException);
      expect(getTrace).not.toHaveBeenCalled();
    });

    it('maps trace event timestamps to ISO strings', () => {
      const timestamp = 1715700000000;
      getTrace.mockReturnValue([
        { kind: 'step1_inbox_recorded', timestamp, detail: {} },
      ]);

      const result = controller.getTrace('ws-1', 'ct-1', 'corr-1');

      expect(result.events[0].timestamp).toBe(new Date(timestamp).toISOString());
    });
  });
});
