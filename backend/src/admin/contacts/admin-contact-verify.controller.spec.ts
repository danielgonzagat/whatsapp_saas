import { NotFoundException } from '@nestjs/common';
import { AdminContactVerifyController } from './admin-contact-verify.controller';
import { ChannelIdentifierService } from '../../contacts/channel-identifier.service';
import { PrismaService } from '../../prisma/prisma.service';
import { type FlexMock } from '../../../test/helpers/prisma.mock';


function makeIdentifierResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ci-1',
    channel: 'WHATSAPP',
    value: '5511999999999',
    contactId: 'contact-1',
    workspaceId: 'ws-1',
    isPrimary: true,
    metadata: null,
    ...overrides,
  };
}

describe('AdminContactVerifyController', () => {
  function buildController() {
    const markVerified = jest.fn() as FlexMock<ChannelIdentifierService['markVerified']>;
    const findUnique = jest.fn();
    const channelIdentifier = {
      markVerified,
    } as ChannelIdentifierService;

    const prisma = {
      contact: {
        findUnique,
      },
    } as PrismaService;

    return {
      channelIdentifier,
      markVerified,
      findUnique,
      prisma,
      controller: new AdminContactVerifyController(channelIdentifier, prisma),
    };
  }

  describe('POST :contactId/verify-channel', () => {
    it('marks a channel identifier as verified and returns success', async () => {
      const { controller, markVerified, findUnique } = buildController();

      findUnique.mockResolvedValue({
        id: 'contact-1',
        workspaceId: 'ws-1',
      });

      const identifierResult = makeIdentifierResult();
      markVerified.mockResolvedValue(identifierResult);

      const result = await controller.verifyChannel('contact-1', {
        channel: 'WHATSAPP',
        value: '5511999999999',
      });

      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        select: { id: true, workspaceId: true },
      });

      expect(markVerified).toHaveBeenCalledWith('ws-1', 'WHATSAPP', '5511999999999');

      expect(result.success).toBe(true);
      expect(result.channelIdentifier.id).toBe('ci-1');
      expect(result.message).toContain('marked as verified');
    });

    it('throws NotFoundException when contact does not exist', async () => {
      const { controller, findUnique } = buildController();

      findUnique.mockResolvedValue(null);

      await expect(
        controller.verifyChannel('nonexistent', {
          channel: 'WHATSAPP',
          value: '5511999999999',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns { success: false } when channel identifier is not found', async () => {
      const { controller, markVerified, findUnique } = buildController();

      findUnique.mockResolvedValue({
        id: 'contact-1',
        workspaceId: 'ws-1',
      });

      markVerified.mockResolvedValue(null);

      const result = await controller.verifyChannel('contact-1', {
        channel: 'WHATSAPP',
        value: 'unknown-value',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});
