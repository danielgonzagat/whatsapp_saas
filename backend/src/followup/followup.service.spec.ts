import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FollowUpService } from './followup.service';

describe('FollowUpService', () => {
  let prisma: {
    contact: { findFirst: jest.Mock };
    followUp: {
      create: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: FollowUpService;

  beforeEach(() => {
    prisma = {
      contact: { findFirst: jest.fn() },
      followUp: {
        create: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    service = new FollowUpService(
      prisma as unknown as ConstructorParameters<typeof FollowUpService>[0],
    );
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
