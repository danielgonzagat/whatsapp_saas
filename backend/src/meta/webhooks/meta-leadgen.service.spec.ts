import { MetaLeadgenService } from './meta-leadgen.service';

type PrismaMock = {
  metaConnection: {
    findUnique: jest.Mock;
  };
  contact: {
    upsert: jest.Mock;
  };
  metaLeadCapture: {
    upsert: jest.Mock;
  };
};

describe('MetaLeadgenService', () => {
  let prisma: PrismaMock;
  let metaSdk: { graphApiGet: jest.Mock };
  let service: MetaLeadgenService;

  beforeEach(() => {
    prisma = {
      metaConnection: {
        findUnique: jest.fn(),
      },
      contact: {
        upsert: jest.fn(),
      },
      metaLeadCapture: {
        upsert: jest.fn().mockResolvedValue({ id: 'capture-1' }),
      },
    };

    metaSdk = {
      graphApiGet: jest.fn(),
    };

    service = new MetaLeadgenService(
      prisma as unknown as ConstructorParameters<typeof MetaLeadgenService>[0],
      metaSdk as unknown as ConstructorParameters<typeof MetaLeadgenService>[1],
    );
  });

  it('captures page leadgen details and syncs CRM only when a real phone exists', async () => {
    prisma.metaConnection.findUnique.mockResolvedValue({
      accessToken: 'user-token',
      pageAccessToken: 'page-token',
      pageId: 'page-1',
      pageName: 'Pagina Oficial',
    });
    prisma.contact.upsert.mockResolvedValue({ id: 'contact-1' });
    metaSdk.graphApiGet.mockResolvedValue({
      id: 'lead-1',
      form_id: 'form-1',
      page_id: 'page-1',
      created_time: '2026-04-21T18:00:00+0000',
      field_data: [
        { name: 'full_name', values: ['Maria Silva'] },
        { name: 'email', values: ['maria@exemplo.com'] },
        { name: 'phone_number', values: ['+55 (11) 99999-9999'] },
      ],
    });

    await service.captureRealtimePageLeadgen(
      {
        id: 'page-1',
        time: 1713722400,
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: 'lead-1',
              form_id: 'form-1',
              page_id: 'page-1',
            },
          },
        ],
      },
      'ws-1',
    );

    expect(metaSdk.graphApiGet).toHaveBeenCalledWith(
      'lead-1',
      {
        fields: 'id,created_time,field_data,form_id,page_id,ad_id,campaign_id',
      },
      'page-token',
    );
    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_phone: {
            workspaceId: 'ws-1',
            phone: '5511999999999',
          },
        },
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          phone: '5511999999999',
          name: 'Maria Silva',
          email: 'maria@exemplo.com',
        }),
      }),
    );
    expect(prisma.metaLeadCapture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_leadgenId: {
            workspaceId: 'ws-1',
            leadgenId: 'lead-1',
          },
        },
        create: expect.objectContaining({
          contactId: 'contact-1',
          workspaceId: 'ws-1',
          leadgenId: 'lead-1',
          formId: 'form-1',
          pageId: 'page-1',
          pageName: 'Pagina Oficial',
          phone: '5511999999999',
          email: 'maria@exemplo.com',
          syncStatus: 'crm_synced',
          failureReason: null,
        }),
      }),
    );
  });

  it('preserves email-only leads without inventing a CRM phone contact', async () => {
    prisma.metaConnection.findUnique.mockResolvedValue({
      accessToken: 'user-token',
      pageAccessToken: 'page-token',
      pageId: 'page-1',
      pageName: 'Pagina Oficial',
    });
    metaSdk.graphApiGet.mockResolvedValue({
      id: 'lead-2',
      form_id: 'form-2',
      page_id: 'page-1',
      created_time: '2026-04-21T18:05:00+0000',
      field_data: [
        { name: 'full_name', values: ['Lead Sem Telefone'] },
        { name: 'email', values: ['sem-telefone@exemplo.com'] },
      ],
    });

    await service.captureRealtimePageLeadgen(
      {
        id: 'page-1',
        time: 1713722700,
        changes: [
          {
            field: 'leadgen',
            value: {
              leadgen_id: 'lead-2',
              form_id: 'form-2',
              page_id: 'page-1',
            },
          },
        ],
      },
      'ws-1',
    );

    expect(prisma.contact.upsert).not.toHaveBeenCalled();
    expect(prisma.metaLeadCapture.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          leadgenId: 'lead-2',
          phone: null,
          email: 'sem-telefone@exemplo.com',
          syncStatus: 'missing_phone',
          syncNotes: 'lead_without_phone_preserved_without_crm_contact',
        }),
      }),
    );
  });
});
