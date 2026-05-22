import { ChannelSetupController } from './channel-setup.controller';

jest.mock('./channel-setup.service', () => ({
  ChannelSetupService: jest.fn().mockImplementation(() => ({
    getState: jest.fn(),
    saveProducts: jest.fn(),
    addArsenal: jest.fn(),
    addArsenalUpload: jest.fn(),
    removeArsenal: jest.fn(),
    saveConfig: jest.fn(),
    complete: jest.fn(),
    reconfigure: jest.fn(),
  })),
}));

import { ChannelSetupService } from './channel-setup.service';
import { BadRequestException } from '@nestjs/common';

const serviceMock = new ChannelSetupService('fake' as never, 'fake' as never);
const getStateMock = serviceMock.getState as jest.Mock;
const saveProductsMock = serviceMock.saveProducts as jest.Mock;
const saveConfigMock = serviceMock.saveConfig as jest.Mock;

describe('ChannelSetupController', () => {
  let controller: ChannelSetupController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ChannelSetupController(serviceMock);
  });

  describe('getState', () => {
    it('calls service.getState with workspaceId from req and channel param', async () => {
      const mockResponse = { channel: 'whatsapp', completed: false };
      getStateMock.mockResolvedValue(mockResponse);

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;
      const result = await controller.getState(req, 'whatsapp');

      expect(getStateMock).toHaveBeenCalledWith('ws-1', 'whatsapp');
      expect(result).toBe(mockResponse);
    });
  });

  describe('saveProducts', () => {
    it('calls service.saveProducts with workspaceId, channel and body', async () => {
      const mockResponse = { channel: 'whatsapp', completed: false };
      saveProductsMock.mockResolvedValue(mockResponse);
      const body = { productIds: ['p-1', 'p-2'] };

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;
      const result = await controller.saveProducts(req, 'whatsapp', body);

      expect(saveProductsMock).toHaveBeenCalledWith('ws-1', 'whatsapp', body);
      expect(result).toBe(mockResponse);
    });
  });

  describe('saveConfig', () => {
    it('propagates error when service throws', async () => {
      saveConfigMock.mockRejectedValue(new BadRequestException('limite_diario_invalido'));

      const req = {
        user: { sub: 'u-1', workspaceId: 'ws-1' },
        headers: {},
      } as never;

      await expect(
        controller.saveConfig(req, 'whatsapp', { dailyMessageLimit: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('identity propagation', () => {
    it('passes workspaceId from req.user into service call args', async () => {
      getStateMock.mockResolvedValue({ channel: 'instagram', completed: true });

      const req = {
        user: { sub: 'u-2', workspaceId: 'ws-2' },
        headers: {},
      } as never;
      await controller.getState(req, 'instagram');

      expect(getStateMock).toHaveBeenCalledTimes(1);
      expect(getStateMock.mock.calls[0][0]).toBe('ws-2');
    });
  });
});
