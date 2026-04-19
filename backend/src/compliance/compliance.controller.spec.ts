import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { AuthenticatedRequest, RawBodyRequest } from '../common/interfaces';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import * as request from 'supertest';

describe('ComplianceController', () => {
  let app: INestApplication;
  let controller: ComplianceController;
  let complianceService: {
    createFacebookDeletionRequest: jest.Mock;
    handleFacebookDeauthorize: jest.Mock;
    handleGoogleRiscEvent: jest.Mock;
    getDeletionStatus: jest.Mock;
    exportAgentData: jest.Mock;
    requestSelfDeletion: jest.Mock;
  };

  beforeEach(async () => {
    complianceService = {
      createFacebookDeletionRequest: jest.fn(),
      handleFacebookDeauthorize: jest.fn(),
      handleGoogleRiscEvent: jest.fn(),
      getDeletionStatus: jest.fn(),
      exportAgentData: jest.fn(),
      requestSelfDeletion: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        {
          provide: ComplianceService,
          useValue: complianceService,
        },
      ],
    }).compile();

    controller = moduleRef.get(ComplianceController);
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps the public callback routes marked as public and throttled', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ComplianceController.prototype.facebookDataDeletion)).toBe(
      true,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ComplianceController.prototype.facebookDeauthorize)).toBe(
      true,
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, ComplianceController.prototype.googleRiscEvents)).toBe(
      true,
    );
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', ComplianceController.prototype.googleRiscEvents)).toBe(
      100,
    );
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', ComplianceController.prototype.googleRiscEvents)).toBe(
      60000,
    );
  });

  it('accepts Facebook data deletion callbacks over form-urlencoded HTTP', async () => {
    complianceService.createFacebookDeletionRequest.mockResolvedValue({
      url: 'https://kloel.com/data-deletion/status/CONFIRM123456789',
      confirmation_code: 'CONFIRM123456789',
    });

    const response = await request(app.getHttpServer())
      .post('/auth/facebook/data-deletion')
      .type('form')
      .send({ signed_request: 'signed-request-payload' })
      .expect(201);

    expect(complianceService.createFacebookDeletionRequest).toHaveBeenCalledWith(
      'signed-request-payload',
    );
    expect(response.body).toEqual({
      url: 'https://kloel.com/data-deletion/status/CONFIRM123456789',
      confirmation_code: 'CONFIRM123456789',
    });
  });

  it('uses the raw JWT body for Google RISC events when available', async () => {
    complianceService.handleGoogleRiscEvent.mockResolvedValue({
      accepted: true,
      subject: 'google-subject',
      eventTypes: ['sessions-revoked'],
    });

    const req = {
      rawBody: Buffer.from('raw-jwt-body'),
    } as RawBodyRequest;

    await controller.googleRiscEvents(req, 'ignored-body');

    expect(complianceService.handleGoogleRiscEvent).toHaveBeenCalledWith('raw-jwt-body');
  });

  it('delegates authenticated data export with the logged-in agent identity', async () => {
    const req = {
      user: {
        sub: 'agent-1',
        workspaceId: 'ws-1',
      },
    } as AuthenticatedRequest;

    await controller.userDataExport(req);

    expect(complianceService.exportAgentData).toHaveBeenCalledWith('agent-1', 'ws-1');
  });

  it('delegates authenticated self-deletion with the logged-in agent identity', async () => {
    const req = {
      user: {
        sub: 'agent-1',
        workspaceId: 'ws-1',
      },
    } as AuthenticatedRequest;

    await controller.userDataDeletion(req);

    expect(complianceService.requestSelfDeletion).toHaveBeenCalledWith('agent-1', 'ws-1');
  });
});
