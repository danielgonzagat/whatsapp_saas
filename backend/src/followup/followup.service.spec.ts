import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FollowUpService } from './followup.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
describe('FollowUpService', () => {
  let prisma: PrismaService & ReturnType<typeof createPartialPrismaMock>;
  let service: FollowUpService;

  beforeEach(() => {
    prisma = createPartialPrismaMock({
      contact: ['findFirst'],
      followUp: ['create', 'findFirst', 'updateMany'],
    }) as PrismaService & ReturnType<typeof createPartialPrismaMock>;
    service = new FollowUpService(prisma);
  });

  it('rejects invalid scheduledFor values on create', async () => {
    await expect(
      service.create('ws-1', {
        contactId: 'contact-1',
        scheduledFor: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.followUp.create).not.toHaveBeenCalled();
  });

  it('requires the follow-up contact to belong to the workspace before create', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(
      service.create('ws-1', {
        contactId: 'contact-1',
        scheduledFor: '2026-05-01T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.followUp.create).not.toHaveBeenCalled();
  });

  it('rejects invalid scheduledFor values on update before mutating', async () => {
    prisma.followUp.findFirst.mockResolvedValue({
      id: 'followup-1',
      workspaceId: 'ws-1',
    });

    await expect(
      service.update('ws-1', 'followup-1', {
        scheduledFor: 'not-a-date',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.followUp.updateMany).not.toHaveBeenCalled();
  });
});
