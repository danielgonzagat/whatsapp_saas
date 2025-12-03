import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { WebhooksService } from '../webhooks/webhooks.service';

describe('WhatsappController', () => {
  let controller: WhatsappController;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [WhatsappController],
      providers: [
        { provide: WhatsappService, useValue: {} },
        { provide: WorkspaceService, useValue: {} },
        { provide: WebhooksService, useValue: { updateMessageStatus: jest.fn() } },
      ],
    }).compile();

    controller = module.get<WhatsappController>(WhatsappController);
  });

  afterAll(async () => {
    await module?.close();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
