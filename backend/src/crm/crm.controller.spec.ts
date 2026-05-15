import { CrmController } from './crm.controller';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';

describe('CrmController', () => {
  const createContact = jest.fn();
  const upsertContact = jest.fn();
  const listContacts = jest.fn();
  const getContact = jest.fn();
  const addTag = jest.fn();
  const removeTag = jest.fn();
  const createPipeline = jest.fn();
  const listPipelines = jest.fn();
  const createDeal = jest.fn();
  const moveDeal = jest.fn();
  const updateDeal = jest.fn();
  const deleteDeal = jest.fn();
  const listDeals = jest.fn();

  let controller: CrmController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CrmController({
      createContact,
      upsertContact,
      listContacts,
      getContact,
      addTag,
      removeTag,
      createPipeline,
      listPipelines,
      createDeal,
      moveDeal,
      updateDeal,
      deleteDeal,
      listDeals,
    } as never);
  });

  describe('listContacts', () => {
    it('calls crmService.listContacts with resolved workspaceId and parsed query params', async () => {
      const mockReq = { user: { sub: 'user-1', workspaceId: 'ws-1' } } as never;
      const mockQuery = { workspaceId: 'ws-1', page: '2', limit: '10', search: 'bob' };
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      listContacts.mockResolvedValue({ data: [], meta: { total: 0, page: 2, limit: 10, pages: 0 } });

      await controller.listContacts(mockReq, mockQuery as never);

      expect(resolveWorkspaceId).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(listContacts).toHaveBeenCalledWith('ws-1', {
        page: 2,
        limit: 10,
        search: 'bob',
      });
    });
  });

  describe('createPipeline', () => {
    it('calls crmService.createPipeline with resolved workspaceId and name', async () => {
      const mockReq = { user: { sub: 'user-1', workspaceId: 'ws-1' } } as never;
      const mockBody = { workspaceId: 'ws-1', name: 'Sales Pipeline' };
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      createPipeline.mockResolvedValue({ id: 'pipe-1', name: 'Sales Pipeline' });

      await controller.createPipeline(mockReq, mockBody);

      expect(resolveWorkspaceId).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(createPipeline).toHaveBeenCalledWith('ws-1', 'Sales Pipeline');
    });
  });

  describe('getContact', () => {
    it('propagates error when crmService.getContact rejects', async () => {
      const mockReq = { user: { sub: 'user-1', workspaceId: 'ws-1' } } as never;
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-1');
      const error = new Error('Contact not found');
      getContact.mockRejectedValue(error);

      await expect(
        controller.getContact(mockReq, '+5511999999999', 'ws-1'),
      ).rejects.toThrow('Contact not found');
    });
  });

  describe('createContact', () => {
    it('resolves workspaceId from token and passes data to crmService.createContact', async () => {
      const mockReq = {
        user: {
          sub: 'user-1',
          workspaceId: 'ws-resolved',
          role: 'admin',
          email: 'admin@test.com',
        },
      } as never;
      (resolveWorkspaceId as jest.Mock).mockReturnValue('ws-resolved');
      const body = { workspaceId: undefined, name: 'John', phone: '+5511999999999' };
      createContact.mockResolvedValue({ id: 'contact-1' });

      await controller.createContact(mockReq, body as never);

      expect(resolveWorkspaceId).toHaveBeenCalledWith(mockReq, undefined);
      expect(createContact).toHaveBeenCalledWith('ws-resolved', {
        name: 'John',
        phone: '+5511999999999',
      });
    });
  });
});
