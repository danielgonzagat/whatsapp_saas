export type PartnershipsPrismaMock = {
  agent: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
    updateMany: jest.Mock;
  };
  collaboratorInvite: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
  affiliatePartner: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  workspace: {
    findUnique: jest.Mock;
  };
  partnerMessage: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
    updateMany: jest.Mock;
  };
  checkoutProductPlan: {
    findFirst: jest.Mock;
  };
  checkoutPlanLink: {
    findFirst: jest.Mock;
  };
  affiliateLink: {
    findFirst: jest.Mock;
  };
  checkoutOrder: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

export function createPartnershipsPrismaMock(): PartnershipsPrismaMock {
  return {
    agent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    collaboratorInvite: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
    affiliatePartner: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ name: 'Workspace Teste' }),
    },
    partnerMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      updateMany: jest.fn(),
    },
    checkoutProductPlan: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    checkoutPlanLink: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    affiliateLink: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    checkoutOrder: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}
