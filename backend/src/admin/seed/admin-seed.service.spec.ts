import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditService } from '../audit/admin-audit.service';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { AdminSeedService } from './admin-seed.service';

jest.mock('../auth/admin-auth.service', () => ({
  AdminAuthService: { hashPassword: jest.fn(() => Promise.resolve('hashed')) },
}));

import { AdminAuthService } from '../auth/admin-auth.service';

describe('AdminSeedService', () => {
  let service: AdminSeedService;

  const mockFindUnique = jest.fn();
  const mockCreate = jest.fn();

  const prismaMock = {
    adminUser: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  };

  const auditMock = {
    append: jest.fn(),
  };

  const configMock = {
    get: jest.fn(),
  };

  const opsAlertMock = {
    alertOnCriticalError: jest.fn(),
  };

  const buildModule = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSeedService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AdminAuditService, useValue: auditMock },
        { provide: ConfigService, useValue: configMock },
        { provide: OpsAlertService, useValue: opsAlertMock },
      ],
    }).compile();

    service = module.get(AdminSeedService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (AdminAuthService.hashPassword as jest.Mock).mockResolvedValue('hashed');
    configMock.get.mockImplementation((key: string) => {
      if (key === 'ADMIN_SEED_OWNER_ENABLED') {
        return 'true';
      }
      if (key === 'ADMIN_SEED_OWNER_INITIAL_PASSWORD') {
        return 'StrongSeedPass1!';
      }
      return undefined;
    });
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue({
      id: 'seed_1',
      name: 'Daniel Gonzaga',
      email: 'danielgonzagatj@gmail.com',
      role: AdminRole.OWNER,
      passwordHash: 'hashed',
    });
    auditMock.append.mockResolvedValue(undefined);
  });

  describe('onModuleInit', () => {
    it('creates owner when user does not exist', async () => {
      await buildModule();

      await service.onModuleInit();

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { email: 'danielgonzagatj@gmail.com' },
      });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'danielgonzagatj@gmail.com',
            role: AdminRole.OWNER,
            passwordHash: 'hashed',
          }),
        }),
      );
      expect(auditMock.append).toHaveBeenCalled();
    });

    it('skips when ADMIN_SEED_OWNER_ENABLED=false', async () => {
      configMock.get.mockImplementation((key: string) => {
        if (key === 'ADMIN_SEED_OWNER_ENABLED') {
          return 'false';
        }
        return undefined;
      });

      await buildModule();

      await service.onModuleInit();

      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('skips when owner already exists (idempotent)', async () => {
      mockFindUnique.mockResolvedValue({
        id: 'existing_1',
        email: 'danielgonzagatj@gmail.com',
      });

      await buildModule();

      await service.onModuleInit();

      expect(mockFindUnique).toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('skips when ADMIN_SEED_OWNER_INITIAL_PASSWORD is empty', async () => {
      configMock.get.mockImplementation((key: string) => {
        if (key === 'ADMIN_SEED_OWNER_ENABLED') {
          return 'true';
        }
        if (key === 'ADMIN_SEED_OWNER_INITIAL_PASSWORD') {
          return '';
        }
        return undefined;
      });

      await buildModule();

      await service.onModuleInit();

      expect(mockFindUnique).toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('catches errors and logs without crashing', async () => {
      mockFindUnique.mockRejectedValue(new Error('DB down'));

      await buildModule();

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(opsAlertMock.alertOnCriticalError).toHaveBeenCalled();
    });

    it('creates user with passwordChangeRequired=true and mfaPendingSetup=true', async () => {
      await buildModule();

      await service.onModuleInit();

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordChangeRequired: true,
            mfaPendingSetup: true,
          }),
        }),
      );
    });
  });
});
