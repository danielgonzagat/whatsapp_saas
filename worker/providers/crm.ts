import type { Prisma } from '@prisma/client';
import { prisma } from '../db';

interface ContactInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  customFields?: Prisma.InputJsonObject;
}

interface ContactSaveVars {
  name?: string | null;
  email?: string | null;
  customFields?: Prisma.InputJsonValue;
}

/**
 * CRM PROVIDER (WORKER-SIDE)
 * Integra com o schema Prisma para contatos, tags e atributos.
 * Algumas operações usam workspace "default" por enquanto.
 */
export const CRM = {
  async addContact(workspaceId: string, contact: ContactInput) {
    console.log('CRM add', contact);
    return prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone: contact.phone,
        },
      },
      update: {
        name: contact.name,
        email: contact.email,
        avatarUrl: contact.avatarUrl,
        customFields: contact.customFields ?? {},
      },
      create: {
        workspace: { connect: { id: workspaceId } },
        phone: contact.phone,
        name: contact.name,
        email: contact.email,
        avatarUrl: contact.avatarUrl,
        customFields: contact.customFields ?? {},
      },
    });
  },

  async updateContact(workspaceId: string, phone: string, data: Prisma.ContactUpdateInput) {
    console.log('CRM update', phone, data);
    return prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      data,
    });
  },

  async getContact(workspaceId: string, phone: string) {
    return prisma.contact.findUnique({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      include: {
        tags: true,
      },
    });
  },

  // ----------------------------------------------------------
  // APIs simplificadas por telefone (usadas pelo NodeExecutor)
  // ----------------------------------------------------------

  async addTag(workspaceId: string, phone: string, tagName: string) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) {
      return;
    }

    const tag = await prisma.tag.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: tagName,
        },
      },
      update: {},
      create: {
        workspace: { connect: { id: workspaceId } },
        name: tagName,
      },
    });

    await prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      data: {
        tags: {
          connect: { id: tag.id },
        },
      },
    });
  },

  async removeTag(workspaceId: string, phone: string, tagName: string) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) {
      return;
    }

    const tag = await prisma.tag.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: tagName,
        },
      },
    });
    if (!tag) {
      return;
    }

    await prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone,
        },
      },
      data: {
        tags: {
          disconnect: { id: tag.id },
        },
      },
    });
  },

  async setAttribute(
    workspaceId: string,
    phone: string,
    key: string,
    value: Prisma.InputJsonValue | null,
  ) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) {
      return;
    }

    const custom = ((contact.customFields as Prisma.InputJsonObject) || {}) as Record<
      string,
      Prisma.InputJsonValue | null
    >;
    custom[key] = value;

    await prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId: contact.workspaceId,
          phone,
        },
      },
      data: {
        customFields: custom as Prisma.InputJsonObject,
      },
    });
  },

  async getAttribute(workspaceId: string, phone: string, key: string) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) {
      return null;
    }
    const custom = (contact.customFields as Prisma.InputJsonObject) || {};
    return custom[key] ?? null;
  },

  async saveContact(workspaceId: string, phone: string, vars: ContactSaveVars) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) {
      return;
    }

    await prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId: contact.workspaceId,
          phone,
        },
      },
      data: {
        name: vars.name ?? contact.name,
        email: vars.email ?? contact.email,
        customFields: vars.customFields ?? (contact.customFields as Prisma.InputJsonValue) ?? {},
      },
    });
  },
};
