import { SitePublicController } from './site-public.controller';

const findFirst = jest.fn();
const updateMany = jest.fn();

jest.mock('../logging/structured-logger', () => ({
  StructuredLogger: {
    from: jest.fn().mockReturnValue({
      error: jest.fn(),
    }),
  },
}));

describe('SitePublicController', () => {
  let controller: SitePublicController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SitePublicController({
      kloelSite: { findFirst, updateMany },
    } as never);
  });

  describe('serveSite', () => {
    it('returns HTML content for a published site and increments visits', async () => {
      findFirst.mockResolvedValue({
        id: 'site-1',
        workspaceId: 'ws-1',
        slug: 'mysite',
        htmlContent: '<h1>Hello</h1>',
      });
      updateMany.mockResolvedValue({ count: 1 });

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await controller.serveSite('mysite', res as never);

      expect(findFirst).toHaveBeenCalledWith({
        where: { slug: 'mysite', workspaceId: { not: '' }, published: true },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'site-1', workspaceId: 'ws-1' },
        data: { visits: { increment: 1 } },
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith('<h1>Hello</h1>');
    });

    it('returns 404 HTML page when site is not found', async () => {
      findFirst.mockResolvedValue(null);

      const res = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await controller.serveSite('unknown', res as never);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Pagina nao encontrada'));
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('returns HTML content even when visit increment fails', async () => {
      findFirst.mockResolvedValue({
        id: 'site-1',
        workspaceId: 'ws-1',
        slug: 'mysite',
        htmlContent: '<h1>Hello</h1>',
      });
      updateMany.mockRejectedValueOnce(new Error('DB error'));

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await controller.serveSite('mysite', res as never);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(res.send).toHaveBeenCalledWith('<h1>Hello</h1>');
    });

    it('propagates found site id into the visit-increment update call', async () => {
      findFirst.mockResolvedValue({
        id: 'site-99',
        workspaceId: 'ws-99',
        slug: 'prop-test',
        htmlContent: '<p>Test</p>',
      });
      updateMany.mockResolvedValue({ count: 1 });

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
        status: jest.fn().mockReturnThis(),
      };

      await controller.serveSite('prop-test', res as never);

      expect(findFirst).toHaveBeenCalledWith({
        where: { slug: 'prop-test', workspaceId: { not: '' }, published: true },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'site-99', workspaceId: 'ws-99' },
        data: { visits: { increment: 1 } },
      });
    });
  });
});
