import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class GroupService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
  ) {}

  async trackGroup(workspaceId: string, jid: string, name: string) {
    return this.prisma.monitoredGroup.upsert({
      where: { workspaceId_jid: { workspaceId, jid } },
      update: { name },
      create: {
        workspaceId,
        jid,
        name,
        settings: { autoBan: false, spyMode: true },
      },
    });
  }

  async addBannedKeyword(
    groupId: string,
    keyword: string,
    action: 'DELETE_MESSAGE' | 'BAN_USER',
  ) {
    return this.prisma.bannedKeyword.create({
      data: {
        groupId,
        keyword,
        action,
      },
    });
  }

  async checkMessage(
    workspaceId: string,
    groupId: string,
    content: string,
    sender: string,
  ) {
    // 1. Get rules
    const group = await this.prisma.monitoredGroup.findUnique({
      where: { id: groupId },
      include: { keywords: true },
    });

    if (!group) return;

    // 2. Check keywords
    for (const rule of group.keywords) {
      if (content.toLowerCase().includes(rule.keyword.toLowerCase())) {
        // Execute Action
        if (rule.action === 'BAN_USER') {
          // Call WhatsApp Service to Ban
          // await this.whatsapp.banUser(workspaceId, group.jid, sender);
          console.log(
            `[AUTO-BAN] User ${sender} banned for saying ${rule.keyword}`,
          );
        }
      }
    }
  }
}
