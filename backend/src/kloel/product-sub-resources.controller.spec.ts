import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PartnershipsService } from '../partnerships/partnerships.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductCommissionController } from './product-sub-resources.controller';

describe('ProductCommissionController', () => {
  let controller: ProductCommissionController;
  let prisma: {
    product: { findFirst: jest.Mock };
    productCommission: {
      findMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };
  let partnershipsService: { createPartner: jest.Mock };

  const req = {
    user: {
      sub: 'agent-1',
      workspaceId: 'ws-1',
    },
  };

  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({ id: 'prod-1', workspaceId: 'ws-1' }),
      },
      productCommission: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'commission-1',
          ...data,
        })),
        delete: jest.fn().mockResolvedValue({ id: 'commission-1' }),
      },
    };

    partnershipsService = {
      createPartner: jest.fn().mockResolvedValue({ id: 'partner-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductCommissionController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: PartnershipsService, useValue: partnershipsService },
      ],
    }).compile();

    controller = module.get(ProductCommissionController);
  });

  it('creates a commission and triggers partner onboarding for coproducers', async () => {
    const result = await controller.create(
      'prod-1',
      {
        role: 'COPRODUCER',
        percentage: 12,
        agentName: 'Carla',
        agentEmail: 'carla@example.com',
      },
      req as never,
    );

    expect(result).toEqual(
      expect.objectContaining({
        id: 'commission-1',
        productId: 'prod-1',
        role: 'COPRODUCER',
      }),
    );
    expect(partnershipsService.createPartner).toHaveBeenCalledWith('ws-1', {
      partnerName: 'Carla',
      partnerEmail: 'carla@example.com',
      type: 'COPRODUCER',
      commissionRate: 12,
    });
  });

  it('does not trigger partner onboarding for affiliate commission records', async () => {
    await controller.create(
      'prod-1',
      {
        role: 'AFFILIATE',
        percentage: 40,
        agentName: 'Ana',
        agentEmail: 'ana@example.com',
      },
      req as never,
    );

    expect(partnershipsService.createPartner).not.toHaveBeenCalled();
  });

  it('rolls back the commission when the partner invite fails', async () => {
    partnershipsService.createPartner.mockRejectedValueOnce(
      new ServiceUnavailableException('invite failed'),
    );

    await expect(
      controller.create(
        'prod-1',
        {
          role: 'MANAGER',
          percentage: 8,
          agentName: 'Marcos',
          agentEmail: 'marcos@example.com',
        },
        req as never,
      ),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(prisma.productCommission.delete).toHaveBeenCalledWith({
      where: { id: 'commission-1' },
    });
  });
});
