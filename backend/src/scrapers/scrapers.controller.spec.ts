import { ScrapersController } from './scrapers.controller';

jest.mock('./scrapers.service', () => ({
  ScrapersService: jest.fn(),
}));

jest.mock('@sentry/node', () => ({}), { virtual: true });


describe('ScrapersController', () => {
  const createJob = jest.fn();
  const findAll = jest.fn();
  const findOne = jest.fn();
  const importLeads = jest.fn();

  let controller: ScrapersController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ScrapersController({
      createJob,
      findAll,
      findOne,
      importLeads,
    } as never);
  });

  describe('create', () => {
    it('calls scrapersService.createJob with resolved workspaceId and payload', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { workspaceId: 'ws-1', type: 'MAPS', query: 'restaurants' };
      const expectedJob = { id: 'job-1', workspaceId: 'ws-1', type: 'MAPS', query: 'restaurants' };
      createJob.mockResolvedValueOnce(expectedJob);

      const result = await controller.create(req, body as never);

      expect(createJob).toHaveBeenCalledWith('ws-1', { type: 'MAPS', query: 'restaurants' });
      expect(result).toBe(expectedJob);
    });
  });

  describe('findAll', () => {
    it('calls scrapersService.findAll with workspaceId resolved from token', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const expectedJobs = [{ id: 'job-1' }, { id: 'job-2' }];
      findAll.mockResolvedValueOnce(expectedJobs);

      const result = await controller.findAll(req, 'ws-1');

      expect(findAll).toHaveBeenCalledWith('ws-1');
      expect(result).toBe(expectedJobs);
    });
  });

  describe('findOne', () => {
    it('calls scrapersService.findOne with resolved workspaceId and job id', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const expectedJob = { id: 'job-1', workspaceId: 'ws-1', leads: [] };
      findOne.mockResolvedValueOnce(expectedJob);

      const result = await controller.findOne(req, 'job-1', 'ws-1');

      expect(findOne).toHaveBeenCalledWith('ws-1', 'job-1');
      expect(result).toBe(expectedJob);
    });
  });

  describe('importLeads', () => {
    it('calls scrapersService.importLeads with resolved workspaceId and job id', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { workspaceId: 'ws-1' };
      const expected = { message: 'Leads imported successfully', count: 5 };
      importLeads.mockResolvedValueOnce(expected);

      const result = await controller.importLeads(req, 'job-1', body as never);

      expect(importLeads).toHaveBeenCalledWith('ws-1', 'job-1');
      expect(result).toBe(expected);
    });
  });

  describe('error propagation', () => {
    it('propagates errors from scrapersService.createJob', async () => {
      const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { workspaceId: 'ws-1', type: 'MAPS', query: 'restaurants' };
      const error = new Error('Queue not available');
      createJob.mockRejectedValueOnce(error);

      await expect(controller.create(req, body as never)).rejects.toThrow('Queue not available');
      expect(createJob).toHaveBeenCalledTimes(1);
    });
  });
});
