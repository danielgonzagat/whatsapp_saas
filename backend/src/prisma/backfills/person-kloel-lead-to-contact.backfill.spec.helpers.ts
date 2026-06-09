/* eslint-disable @typescript-eslint/require-await */
import {
  type BackfillContact,
  type BackfillKloelLead,
  type BackfillPrismaClient,
} from './person-kloel-lead-to-contact.backfill.core';

export interface UpsertCall {
  readonly workspaceId: string;
  readonly phone: string;
  readonly create: Record<string, unknown>;
  readonly update: Record<string, unknown>;
}

export interface AuditRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly action: string;
  readonly resource: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
}

/**
 * An in-memory store that behaves like the slice of Prisma the backfill uses.
 * Contacts are keyed on `${workspaceId}::${phone}` so the unique
 * `(workspaceId, phone)` constraint and workspace isolation are both modeled.
 */
export class MockPrisma implements BackfillPrismaClient {
  private readonly workspaces: string[];
  private readonly leadsByWorkspace: Map<string, BackfillKloelLead[]>;
  private readonly contacts = new Map<string, BackfillContact>();
  private readonly audits: AuditRow[] = [];
  private contactSeq = 0;
  private auditSeq = 0;

  readonly upsertCalls: UpsertCall[] = [];

  constructor(input: {
    workspaces: string[];
    leads: BackfillKloelLead[];
    contacts?: BackfillContact[];
  }) {
    this.workspaces = [...input.workspaces].sort((a, b) => a.localeCompare(b));
    this.leadsByWorkspace = new Map();
    for (const lead of input.leads) {
      const list = this.leadsByWorkspace.get(lead.workspaceId) ?? [];
      list.push(lead);
      this.leadsByWorkspace.set(lead.workspaceId, list);
    }
    for (const list of this.leadsByWorkspace.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    for (const c of input.contacts ?? []) {
      this.contacts.set(`${c.workspaceId}::${c.phone}`, c);
    }
  }

  get auditCount(): number {
    return this.audits.length;
  }

  contactSnapshot(workspaceId: string, phone: string): BackfillContact | undefined {
    return this.contacts.get(`${workspaceId}::${phone}`);
  }

  readonly workspace = {
    findMany: async (args: {
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      take: number;
    }): Promise<{ id: string }[]> => {
      let start = 0;
      if (args.cursor) {
        const idx = this.workspaces.indexOf(args.cursor.id);
        start = idx >= 0 ? idx + (args.skip ?? 0) : this.workspaces.length;
      }
      return this.workspaces.slice(start, start + args.take).map((id) => ({ id }));
    },
  };

  readonly kloelLead = {
    findMany: async (args: {
      where: { workspaceId: string };
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      take: number;
    }): Promise<BackfillKloelLead[]> => {
      const all = this.leadsByWorkspace.get(args.where.workspaceId) ?? [];
      let start = 0;
      if (args.cursor) {
        const idx = all.findIndex((l) => l.id === args.cursor?.id);
        start = idx >= 0 ? idx + (args.skip ?? 0) : all.length;
      }
      return all.slice(start, start + args.take);
    },
  };

  readonly contact = {
    findUnique: async (args: {
      where: { workspaceId_phone: { workspaceId: string; phone: string } };
    }): Promise<BackfillContact | null> => {
      const { workspaceId, phone } = args.where.workspaceId_phone;
      return this.contacts.get(`${workspaceId}::${phone}`) ?? null;
    },
    upsert: async (args: {
      where: { workspaceId_phone: { workspaceId: string; phone: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string }> => {
      const { workspaceId, phone } = args.where.workspaceId_phone;
      this.upsertCalls.push({ workspaceId, phone, create: args.create, update: args.update });
      const key = `${workspaceId}::${phone}`;
      const existing = this.contacts.get(key);
      if (existing) {
        const merged: BackfillContact = {
          ...existing,
          ...(args.update as Partial<BackfillContact>),
        };
        this.contacts.set(key, merged);
        return { id: merged.id };
      }
      this.contactSeq += 1;
      const id = `contact-${this.contactSeq}`;
      const created: BackfillContact = {
        id,
        workspaceId,
        phone,
        kloelLeadId: (args.create.kloelLeadId as string | undefined) ?? null,
        leadStatus: (args.create.leadStatus as string | undefined) ?? null,
        leadStage: (args.create.leadStage as string | undefined) ?? null,
        lastMessage: (args.create.lastMessage as string | undefined) ?? null,
        lastIntent: (args.create.lastIntent as string | undefined) ?? null,
        totalMessages: (args.create.totalMessages as number | undefined) ?? 0,
      };
      this.contacts.set(key, created);
      return { id };
    },
  };

  readonly auditLog = {
    findFirst: async (args: {
      where: { workspaceId: string; action: string; resource: string; resourceId: string };
    }): Promise<{ id: string } | null> => {
      const match = this.audits.find(
        (a) =>
          a.workspaceId === args.where.workspaceId &&
          a.action === args.where.action &&
          a.resource === args.where.resource &&
          a.resourceId === args.where.resourceId,
      );
      return match ? { id: match.id } : null;
    },
    create: async (args: { data: Record<string, unknown> }): Promise<{ id: string }> => {
      this.auditSeq += 1;
      const id = `audit-${this.auditSeq}`;
      this.audits.push({
        id,
        workspaceId: args.data.workspaceId as string,
        action: args.data.action as string,
        resource: args.data.resource as string,
        resourceId: args.data.resourceId as string,
        details: args.data.details as Record<string, unknown>,
      });
      return { id };
    },
  };

  auditFor(contactId: string): AuditRow | undefined {
    return this.audits.find((a) => a.resourceId === contactId);
  }
}

export function makeLead(overrides: Partial<BackfillKloelLead> = {}): BackfillKloelLead {
  return {
    id: 'lead-1',
    workspaceId: 'ws-1',
    phone: '11987654321',
    name: 'João Silva',
    email: 'joao@test.com',
    status: 'hot',
    stage: 'negotiation',
    lastMessage: 'quero comprar',
    lastIntent: 'purchase',
    totalMessages: 7,
    ...overrides,
  };
}

export function makeContact(overrides: Partial<BackfillContact> = {}): BackfillContact {
  return {
    id: 'existing-contact',
    workspaceId: 'ws-1',
    phone: '5511987654321',
    kloelLeadId: null,
    leadStatus: null,
    leadStage: null,
    lastMessage: null,
    lastIntent: null,
    totalMessages: 0,
    ...overrides,
  };
}
