export type KloelPrismaMock = {
  chatThread: {
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    count: jest.Mock;
  };
  chatMessage: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  kloelMessage: {
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
  kloelMemory: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  persona: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  integration: {
    findMany: jest.Mock;
    create: jest.Mock;
  };
  product: {
    create: jest.Mock;
    count: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  workspace: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  agent: {
    findFirst: jest.Mock;
  };
  flow: {
    create: jest.Mock;
    findMany: jest.Mock;
  };
  contact: {
    findFirst: jest.Mock;
    create: jest.Mock;
  };
  message: {
    create: jest.Mock;
    update: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};
