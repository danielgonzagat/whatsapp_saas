interface MemoryRecord {
  id?: string;
  workspaceId?: string;
  key?: string;
  category?: string;
  type?: string;
  value?: Record<string, unknown> | { broken: boolean };
  metadata?: Record<string, unknown> | null | string;
  [key: string]: unknown;
}

interface ProductRecord {
  id?: string;
  workspaceId?: string;
  name?: string;
  active?: boolean;
  paymentLink?: string | null;
  [key: string]: unknown;
}

interface ExternalLinkRecord {
  id?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

interface ApprovalRecord {
  id?: string;
  workspaceId?: string;
  kind?: string;
  [key: string]: unknown;
}

interface InputSessionRecord {
  id?: string;
  workspaceId?: string;
  kind?: string;
  [key: string]: unknown;
}

interface WorkItemRecord {
  id?: string;
  workspaceId?: string;
  kind?: string;
  state?: string;
  [key: string]: unknown;
}

export type MockAgentEvents = { publish: jest.Mock };
export type MockPrisma = Record<string, Record<string, jest.Mock>>;

export interface AccountAgentMockStores {
  memoryStore: Map<string, MemoryRecord>;
  products: ProductRecord[];
  externalLinks: ExternalLinkRecord[];
  approvalRequests: Map<string, ApprovalRecord>;
  inputSessions: Map<string, InputSessionRecord>;
  workItems: Map<string, WorkItemRecord>;
}

export function createMockStores(): AccountAgentMockStores {
  return {
    memoryStore: new Map(),
    products: [],
    externalLinks: [],
    approvalRequests: new Map(),
    inputSessions: new Map(),
    workItems: new Map(),
  };
}

const memoryKey = (workspaceId: string, key: string) => `${workspaceId}:${key}`;

export function createMockPrisma(stores: AccountAgentMockStores): MockPrisma {
  const { memoryStore, products, externalLinks, approvalRequests, inputSessions, workItems } =
    stores;
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'ws-1',
        customDomain: null,
        providerSettings: { billingSuspended: false },
      }),
    },
    agent: { count: jest.fn().mockResolvedValue(0) },
    flow: { count: jest.fn().mockResolvedValue(0) },
    campaign: { count: jest.fn().mockResolvedValue(0) },
    apiKey: { count: jest.fn().mockResolvedValue(0) },
    webhookSubscription: { count: jest.fn().mockResolvedValue(0) },
    contact: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'contact-1', name: 'Mayk', phone: '5511999999999' }),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 'contact-1', name: 'Mayk', phone: '5511999999999' }),
    },
    product: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where?: { workspaceId?: string } } = {}) =>
          Promise.resolve(
            products.filter((product) =>
              where?.workspaceId ? product.workspaceId === where.workspaceId : true,
            ),
          ),
        ),
      count: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: { workspaceId?: string; active?: boolean } } = {}) =>
            Promise.resolve(
              products.filter((product) => {
                if (where?.workspaceId && product.workspaceId !== where.workspaceId) return false;
                if (typeof where?.active === 'boolean' && product.active !== where.active)
                  return false;
                return true;
              }).length,
            ),
        ),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const product = { id: `product-${products.length + 1}`, ...data };
        products.push(product);
        return Promise.resolve(product);
      }),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const idx = products.findIndex((product) => product.id === where.id);
            products[idx] = { ...products[idx], ...data };
            return Promise.resolve(products[idx]);
          },
        ),
    },
    kloelMemory: {
      findUnique: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { workspaceId_key: { workspaceId: string; key: string } } }) =>
            Promise.resolve(
              memoryStore.get(
                memoryKey(where.workspaceId_key.workspaceId, where.workspaceId_key.key),
              ) || null,
            ),
        ),
      findMany: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where?: {
            workspaceId?: string;
            category?: string;
            OR?: Array<{ type?: string; category?: string }>;
          };
        } = {}) => {
          const items = Array.from(memoryStore.values()).filter((item) => {
            if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
            if (where?.category && item.category !== where.category) return false;
            if (where?.OR) {
              return where.OR.some((entry) => {
                if (entry.type) return item.type === entry.type;
                if (entry.category) return item.category === entry.category;
                return false;
              });
            }
            return true;
          });
          return Promise.resolve(items);
        },
      ),
      upsert: jest
        .fn()
        .mockImplementation(
          ({
            where,
            create,
            update,
          }: {
            where: { workspaceId_key: { workspaceId: string; key: string } };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const key = memoryKey(where.workspaceId_key.workspaceId, where.workspaceId_key.key);
            const existing = memoryStore.get(key);
            const next = existing
              ? { ...existing, ...update, workspaceId: existing.workspaceId, key: existing.key }
              : { id: `memory-${memoryStore.size + 1}`, ...create };
            memoryStore.set(key, next);
            return Promise.resolve(next);
          },
        ),
      update: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { workspaceId_key: { workspaceId: string; key: string } };
            data: Record<string, unknown>;
          }) => {
            const key = memoryKey(where.workspaceId_key.workspaceId, where.workspaceId_key.key);
            const existing = memoryStore.get(key);
            const next = { ...existing, ...data };
            memoryStore.set(key, next);
            return Promise.resolve(next);
          },
        ),
    },
    externalPaymentLink: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const link = { id: `link-${externalLinks.length + 1}`, ...data };
        externalLinks.push(link);
        return Promise.resolve(link);
      }),
    },
    approvalRequest: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: { workspaceId?: string; kind?: string } } = {}) => {
            const items = Array.from(approvalRequests.values()).filter((item) => {
              if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
              if (where?.kind && item.kind !== where.kind) return false;
              return true;
            });
            return Promise.resolve(items);
          },
        ),
      upsert: jest
        .fn()
        .mockImplementation(
          ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = approvalRequests.get(where.id);
            const next = existing ? { ...existing, ...update } : { ...create };
            approvalRequests.set(where.id, next);
            return Promise.resolve(next);
          },
        ),
    },
    inputCollectionSession: {
      findMany: jest
        .fn()
        .mockImplementation(
          ({ where }: { where?: { workspaceId?: string; kind?: string } } = {}) => {
            const items = Array.from(inputSessions.values()).filter((item) => {
              if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
              if (where?.kind && item.kind !== where.kind) return false;
              return true;
            });
            return Promise.resolve(items);
          },
        ),
      upsert: jest
        .fn()
        .mockImplementation(
          ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = inputSessions.get(where.id);
            const next = existing ? { ...existing, ...update } : { ...create };
            inputSessions.set(where.id, next);
            return Promise.resolve(next);
          },
        ),
    },
    agentWorkItem: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where?: { workspaceId?: string } } = {}) => {
          const items = Array.from(workItems.values()).filter((item) => {
            if (where?.workspaceId && item.workspaceId !== where.workspaceId) return false;
            return true;
          });
          return Promise.resolve(items);
        }),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: { where?: { id: string } } = {}) =>
          Promise.resolve(workItems.get(where!.id) ?? null),
        ),
      findFirst: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { id?: string; workspaceId?: string } } = { where: {} }) => {
            if (!where.id) return Promise.resolve(null);
            const item = workItems.get(where.id);
            if (!item) return Promise.resolve(null);
            if (where.workspaceId && item.workspaceId !== where.workspaceId)
              return Promise.resolve(null);
            return Promise.resolve(item);
          },
        ),
      upsert: jest
        .fn()
        .mockImplementation(
          ({
            where,
            create,
            update,
          }: {
            where: { id: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = workItems.get(where.id);
            const next = existing ? { ...existing, ...update } : { ...create };
            workItems.set(where.id, next);
            return Promise.resolve(next);
          },
        ),
      create: jest.fn().mockImplementation(({ data }: { data: { id: string } }) => {
        const next = { ...data };
        workItems.set(data.id, next);
        return Promise.resolve(next);
      }),
      updateMany: jest
        .fn()
        .mockImplementation(
          ({
            where,
            data,
          }: {
            where: { id: string; workspaceId?: string };
            data: Record<string, unknown>;
          }) => {
            const existing = workItems.get(where.id);
            if (!existing) return Promise.resolve({ count: 0 });
            if (where.workspaceId && existing.workspaceId !== where.workspaceId)
              return Promise.resolve({ count: 0 });
            workItems.set(where.id, { ...existing, ...data });
            return Promise.resolve({ count: 1 });
          },
        ),
    },
  };
}
