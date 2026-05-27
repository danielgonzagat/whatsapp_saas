import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GdprFacebookCallbackService } from './gdpr-facebook-callback.service';

jest.mock('./gdpr.helpers', () => ({
  parseFacebookSignedRequest: jest.fn(),
  generateCode: jest.fn(() => 'GEN-CODE-1'),
}));

import { parseFacebookSignedRequest } from './gdpr.helpers';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

describe('GdprFacebookCallbackService', () => {
  let service: GdprFacebookCallbackService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  const originalFrontend = process.env.FRONTEND_URL;

  beforeEach(async () => {
    prisma = createPartialPrismaMock({
      agent: ['findFirst'],
      gdprRequest: ['create'],
    });
    prisma.gdprRequest.create.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [GdprFacebookCallbackService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(GdprFacebookCallbackService);
    delete process.env.FRONTEND_URL;
  });

  afterEach(() => {
    if (originalFrontend === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = originalFrontend;
    }
  });

  it('throws BadRequestException when signed_request has no user_id', async () => {
    (parseFacebookSignedRequest as jest.Mock).mockReturnValue({ user_id: '' });
    await expect(service.handleFacebookCallback('sig')).rejects.toThrow(BadRequestException);
  });

  it('returns not_found url when agent does not exist', async () => {
    (parseFacebookSignedRequest as jest.Mock).mockReturnValue({ user_id: 'fb-1' });
    prisma.agent.findFirst.mockResolvedValue(null);
    const result = await service.handleFacebookCallback('sig');
    expect(result.confirmation_code).toBe('not_found');
    expect(result.url).toBe('https://kloel.com/data-deletion');
    expect(prisma.gdprRequest.create).not.toHaveBeenCalled();
  });

  it('creates a DELETE gdpr request scoped to the agent workspace when match found', async () => {
    (parseFacebookSignedRequest as jest.Mock).mockReturnValue({ user_id: 'fb-1' });
    prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-A' });

    const result = await service.handleFacebookCallback('sig');

    expect(prisma.gdprRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-A',
        userId: 'agent-1',
        code: 'GEN-CODE-1',
      }),
    });
    expect(result.confirmation_code).toBe('GEN-CODE-1');
    expect(result.url).toBe('https://kloel.com/data-deletion/status/GEN-CODE-1');
  });

  it('honors FRONTEND_URL and trims trailing slash', async () => {
    process.env.FRONTEND_URL = 'https://app.example.com/';
    (parseFacebookSignedRequest as jest.Mock).mockReturnValue({ user_id: 'fb-1' });
    prisma.agent.findFirst.mockResolvedValue({ id: 'agent-1', workspaceId: 'ws-A' });
    const result = await service.handleFacebookCallback('sig');
    expect(result.url.startsWith('https://app.example.com/data-deletion/status/')).toBe(true);
    expect(result.url).not.toContain('.com//');
  });
});
