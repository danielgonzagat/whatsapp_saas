import { prisma } from "../db";

/**
 * CRM PROVIDER (WORKER-SIDE)
 * Integra com o schema Prisma para contatos, tags e atributos.
 * Algumas operações usam workspace "default" por enquanto.
 */
export const CRM = {
  async addContact(workspaceId: string, contact: any) {
    console.log("CRM add", contact);
    return prisma.contact.upsert({
      where: {
        workspaceId_phone: {
          workspaceId,
          phone: contact.phone,
        },
      },
      update: contact,
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

  async updateContact(workspaceId: string, phone: string, data: any) {
    console.log("CRM update", phone, data);
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
    if (!contact) return;

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
    if (!contact) return;

    const tag = await prisma.tag.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name: tagName,
        },
      },
    });
    if (!tag) return;

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

  async setAttribute(workspaceId: string, phone: string, key: string, value: any) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) return;

    const custom = (contact.customFields as any) || {};
    custom[key] = value;

    await prisma.contact.update({
      where: {
        workspaceId_phone: {
          workspaceId: contact.workspaceId,
          phone,
        },
      },
      data: {
        customFields: custom,
      },
    });
  },

  async getAttribute(workspaceId: string, phone: string, key: string) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) return null;
    const custom = (contact.customFields as any) || {};
    return custom[key] ?? null;
  },

  async saveContact(workspaceId: string, phone: string, vars: any) {
    const contact = await prisma.contact.findUnique({
      where: { workspaceId_phone: { workspaceId, phone } },
    });
    if (!contact) return;

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
        customFields: vars.customFields ?? contact.customFields,
      },
    });
  },
};
