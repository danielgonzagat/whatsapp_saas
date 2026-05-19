import { CampaignsController } from './campaigns.controller';
import { resolveWorkspaceId } from '../auth/workspace-access';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

describe('CampaignsController', () => {
  const create = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const launch = jest.fn();
  const pause = jest.fn();
  const createVariants = jest.fn();
  const evaluateDarwin = jest.fn();
  const ensureCampaignLimit = jest.fn();
  const ensureSubscriptionActive = jest.fn();

  let controller: CampaignsController;

  beforeEach(() => {
    jest.clearAllMocks();
    (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
    controller = new CampaignsController(
      {
        create,
        findAll,
        findOne,
        launch,
        pause,
        createVariants,
        evaluateDarwin,
      } as never,
      {
        ensureCampaignLimit,
        ensureSubscriptionActive,
      } as never,
    );
  });

  describe('create', () => {
    it('calls campaignsService.create with resolved workspace and body fields (happy path)', async () => {
      const req = {
        user: { sub: 'user-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'OWNER' },
        headers: {},
      } as never;
      const body = { name: 'My Campaign', workspaceId: 'ws-explicit', messageTemplate: 'Hello' };
      const mockCampaign = { id: 'camp-1', name: 'My Campaign' };
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-resolved');
      create.mockResolvedValue(mockCampaign);

      const result = await controller.create(req, body);

      expect(resolveWorkspaceId).toHaveBeenCalledWith(req, 'ws-explicit');
      expect(ensureCampaignLimit).toHaveBeenCalledWith('ws-resolved');
      expect(create).toHaveBeenCalledWith('ws-resolved', {
        name: 'My Campaign',
        messageTemplate: 'Hello',
      });
      expect(result).toEqual(mockCampaign);
    });

    it('returns existing record when idempotency key matches an existing campaign', async () => {
      const req = {
        user: { sub: 'user-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'OWNER' },
        headers: { 'x-idempotency-key': 'idem-1' },
      } as never;
      const body = { name: 'My Campaign', workspaceId: 'ws-explicit' };
      const existing = { id: 'camp-existing', name: 'Already Exists' };
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-resolved');
      findOne.mockResolvedValue(existing);

      const result = await controller.create(req, body);

      expect(findOne).toHaveBeenCalledWith('ws-resolved', 'idem-1');
      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });
  });

  describe('findAll', () => {
    it('calls campaignsService.findAll with resolved workspace (alternate route happy)', async () => {
      const req = {
        user: { sub: 'user-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'OWNER' },
        headers: {},
      } as never;
      const mockCampaigns = [{ id: 'camp-1', name: 'Camp 1' }];
      findAll.mockResolvedValue(mockCampaigns);

      const result = await controller.findAll(req, 'ws-explicit');

      expect(resolveWorkspaceId).toHaveBeenCalledWith(req, 'ws-explicit');
      expect(findAll).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(mockCampaigns);
    });
  });

  describe('findOne', () => {
    it('propagates error when campaignsService.findOne rejects (error path)', async () => {
      const req = {
        user: { sub: 'user-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const error = new Error('Campaign not found');
      findOne.mockRejectedValue(error);

      await expect(controller.findOne(req, 'camp-1', 'ws-explicit')).rejects.toThrow(
        'Campaign not found',
      );
    });
  });

  describe('launch', () => {
    it('propagates user identity through resolveWorkspaceId into service call', async () => {
      const req = {
        user: { sub: 'user-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const body = { workspaceId: 'ws-explicit', smartTime: true };
      const mockResult = { message: 'Campaign launched successfully', campaignId: 'camp-1' };
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-from-token');
      launch.mockResolvedValue(mockResult);

      const result = await controller.launch(req, 'camp-1', body);

      expect(resolveWorkspaceId).toHaveBeenCalledWith(req, 'ws-explicit');
      expect(ensureSubscriptionActive).toHaveBeenCalledWith('ws-from-token');
      expect(launch).toHaveBeenCalledWith('ws-from-token', 'camp-1', true);
      expect(result).toEqual(mockResult);
    });
  });

  describe('pause', () => {
    it('calls campaignsService.pause with token workspace (happy path)', async () => {
      const req = {
        user: { sub: 'user-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'OWNER' },
      } as never;
      const mockCampaign = { id: 'camp-1', status: 'PAUSED' };
      pause.mockResolvedValue(mockCampaign);

      const result = await controller.pause(req, 'camp-1');

      expect(resolveWorkspaceId).toHaveBeenCalledWith(req);
      expect(pause).toHaveBeenCalledWith('ws-1', 'camp-1');
      expect(result).toEqual(mockCampaign);
    });
  });
});
