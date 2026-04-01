import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TeamService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  async listMembers(workspaceId: string) {
    const [agents, invitations] = await Promise.all([
      this.prisma.agent.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isOnline: true,
          createdAt: true,
        },
        take: 100,
      }),
      this.prisma.invitation.findMany({
        where: { workspaceId },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          expiresAt: true,
        },
        take: 100,
      }),
    ]);

    return { agents, invitations };
  }

  async inviteMember(
    workspaceId: string,
    email: string,
    role: string,
    inviterId?: string,
  ) {
    // 1. Check if already member
    const existingMember = await this.prisma.agent.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
    });
    if (existingMember)
      throw new BadRequestException(
        'User is already a member of this workspace',
      );

    // 2. Check if already invited
    const existingInvite = await this.prisma.invitation.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
    });
    if (existingInvite) {
      // Renew invite? Or fail? Let's renew/update.
      // Actually, for simplicity, let's delete old and create new or just update.
      await this.prisma.invitation.delete({ where: { id: existingInvite.id } });
    }

    // 3. Create Invite
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invite = await this.prisma.invitation.create({
      data: {
        workspaceId,
        email,
        role,
        token,
        expiresAt,
      },
    });

    // 4. Send invite email
    const inviter = inviterId
      ? await this.prisma.agent.findUnique({
          where: { id: inviterId },
          select: { name: true },
        })
      : null;
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    await this.emailService.sendTeamInviteEmail(
      email,
      inviter?.name || 'Um membro',
      workspace?.name || 'Workspace',
      `${this.configService.get('FRONTEND_URL', 'http://localhost:3000')}/invite/accept?token=${token}`,
    );

    return invite;
  }

  async acceptInvite(token: string, name: string, password: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { token },
    });
    if (!invite || invite.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation');
    }

    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    // Create Agent
    const hashedPassword = await bcrypt.hash(password, 10);

    const agent = await this.prisma.agent.create({
      data: {
        workspaceId: invite.workspaceId,
        email: invite.email,
        name,
        password: hashedPassword,
        role: invite.role,
      },
    });

    // Delete invite
    await this.prisma.invitation.delete({ where: { id: invite.id } });

    return agent;
  }

  async revokeInvite(workspaceId: string, inviteId: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { id: inviteId },
    });
    if (!invite || invite.workspaceId !== workspaceId) {
      throw new NotFoundException('Invitation not found');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'Invitation',
      resourceId: inviteId,
      details: { deletedBy: 'user', email: invite.email },
    });
    return this.prisma.invitation.delete({ where: { id: inviteId } });
  }

  async removeMember(workspaceId: string, memberId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: memberId },
    });
    if (!agent || agent.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found');
    }

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'Agent',
      resourceId: memberId,
      details: { deletedBy: 'user', email: agent.email },
    });
    // Prevent removing self if only admin? Or enforce at least 1 admin?
    // For now, simple removal.
    return this.prisma.agent.delete({ where: { id: memberId } });
  }
}
