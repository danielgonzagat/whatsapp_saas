import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { asProviderSettings } from '../whatsapp/provider-settings.types';

const PATTERN_RE = / /g;

function readWorkspacePhone(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type AddGroupInput = {
  name?: string;
  inviteLink?: string;
  groupLink?: string;
  groupId?: string;
  role?: string;
  capacity?: number;
  current?: number;
  isActive?: boolean;
};

function resolveLaunchInviteLink(data: AddGroupInput): string {
  const inviteLink = data.inviteLink || data.groupLink || data.groupId;
  if (!inviteLink) {
    throw new NotFoundException('Invite link do grupo é obrigatório');
  }
  return inviteLink;
}

/** Launch service. */
@Injectable()
export class LaunchService {
  constructor(private prisma: PrismaService) {}

  /** List launchers. */
  async listLaunchers(workspaceId: string) {
    return this.prisma.groupLauncher.findMany({
      where: { workspaceId },
      include: { groups: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create launcher. */
  async createLauncher(
    workspaceId: string,
    data: { name: string; slug?: string; [k: string]: unknown },
  ) {
    return this.prisma.groupLauncher.create({
      data: {
        ...data,
        workspaceId,
        status: 'ACTIVE',
        slug: data.slug || data.name.toLowerCase().replace(PATTERN_RE, '-'),
      } as Parameters<typeof this.prisma.groupLauncher.create>[0]['data'],
    });
  }

  /** Add group. */
  async addGroup(workspaceId: string, launcherId: string, data: AddGroupInput) {
    await this.ensureLauncherOwnedByWorkspace(launcherId, workspaceId);
    const inviteLink = resolveLaunchInviteLink(data);

    return this.prisma.launchGroup.create({
      data: {
        name: data.name || data.role || 'Grupo do lançamento',
        inviteLink,
        capacity: data.capacity,
        current: data.current,
        isActive: data.isActive,
        launcher: { connect: { id: launcherId } },
      },
    });
  }

  private async ensureLauncherOwnedByWorkspace(
    launcherId: string,
    workspaceId: string,
  ): Promise<void> {
    const launcher = await this.prisma.groupLauncher.findUnique({
      where: { id: launcherId },
      select: { id: true, workspaceId: true },
    });

    if (!launcher) {
      throw new NotFoundException('Launcher não encontrado');
    }

    if (launcher.workspaceId !== workspaceId) {
      throw new ForbiddenException('Launcher não pertence a este workspace');
    }
  }

  /** Generate start link. */
  async generateStartLink(workspaceId: string, flowId: string, customCommand?: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const settings = asProviderSettings(workspace.providerSettings);
    // Tenta pegar o telefone conectado. Se não tiver, usa placeholder.
    // No mundo real, precisaríamos armazenar o "phone" da sessão conectada.
    // Vamos assumir que o usuário salvou em settings ou usamos um domínio próprio.
    const phone = readWorkspacePhone(settings.phone);

    // Command format: "start_flow_<flowId>" or custom
    const command = customCommand || `start_flow_${flowId}`;
    const encoded = encodeURIComponent(command);

    // Se tiver telefone, gera wa.me. Se não, gera link interno curto (redir).
    if (phone) {
      return `https://wa.me/${phone}?text=${encoded}`;
    }
    return `https://api.whatsapp.com/send?text=${encoded}`; // Link genérico que pede pra escolher o contato
  }

  /** Track click. */
  async trackClick(launcherId: string) {
    return this.prisma.groupLauncher.update({
      where: { id: launcherId },
      data: { clicks: { increment: 1 } },
      select: { id: true, workspaceId: true, clicks: true },
    });
  }

  /** Get redirect link. */
  async getRedirectLink(slug: string) {
    const launcher = await this.prisma.groupLauncher.findUnique({
      where: { slug },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        groups: true,
      },
    });

    if (!launcher || launcher.status !== 'ACTIVE') {
      throw new NotFoundException('Launch not found or inactive');
    }

    // Logic: Find first group not full
    const group = launcher.groups.find((g) => g.isActive && g.current < g.capacity);

    if (!group) {
      // Fallback: Waiting list or last group
      return 'https://chat.whatsapp.com/waiting-list';
    }

    // Increment stats (async)
    await this.prisma.groupLauncher.update({
      where: { id: launcher.id },
      data: { clicks: { increment: 1 } },
      select: { id: true, workspaceId: true },
    });

    return group.inviteLink;
  }
}
