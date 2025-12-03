import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LaunchService {
  constructor(private prisma: PrismaService) {}

  async createLauncher(workspaceId: string, data: any) {
    return this.prisma.groupLauncher.create({
      data: {
        ...data,
        workspaceId,
        status: 'ACTIVE',
        slug: data.slug || data.name.toLowerCase().replace(/ /g, '-'),
      },
    });
  }

  async addGroup(workspaceId: string, launcherId: string, data: any) {
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

    return this.prisma.launchGroup.create({
      data: {
        ...data,
        launcherId,
      },
    });
  }

  async generateStartLink(
    workspaceId: string,
    flowId: string,
    customCommand?: string,
  ) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { providerSettings: true },
    });

    if (!workspace) throw new NotFoundException('Workspace not found');

    const settings = workspace.providerSettings as any;
    // Tenta pegar o telefone conectado. Se não tiver, usa placeholder.
    // No mundo real, precisaríamos armazenar o "phone" da sessão conectada.
    // Vamos assumir que o usuário salvou em settings ou usamos um domínio próprio.
    const phone = settings?.phone || '';

    // Command format: "start_flow_<flowId>" or custom
    const command = customCommand || `start_flow_${flowId}`;
    const encoded = encodeURIComponent(command);

    // Se tiver telefone, gera wa.me. Se não, gera link interno curto (redir).
    if (phone) {
      return `https://wa.me/${phone}?text=${encoded}`;
    } else {
      return `https://api.whatsapp.com/send?text=${encoded}`; // Link genérico que pede pra escolher o contato
    }
  }

  async trackClick(launcherId: string) {
    return this.prisma.groupLauncher.update({
      where: { id: launcherId },
      data: { clicks: { increment: 1 } },
    });
  }

  async getRedirectLink(slug: string) {
    const launcher = await this.prisma.groupLauncher.findUnique({
      where: { slug },
      include: { groups: true },
    });

    if (!launcher || launcher.status !== 'ACTIVE') {
      throw new NotFoundException('Launch not found or inactive');
    }

    // Logic: Find first group not full
    const group = launcher.groups.find(
      (g) => g.isActive && g.current < g.capacity,
    );

    if (!group) {
      // Fallback: Waiting list or last group
      return 'https://chat.whatsapp.com/waiting-list';
    }

    // Increment stats (async)
    await this.prisma.groupLauncher.update({
      where: { id: launcher.id },
      data: { clicks: { increment: 1 } },
    });

    return group.inviteLink;
  }
}
