import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactDiscoveryService {
  private readonly logger = new Logger(ContactDiscoveryService.name);

  constructor(private prisma: PrismaService) {}

  async discoverContacts(workspaceId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId },
      include: {
        _count: { select: { messages: true } },
      },
    });

    const segments = {
      vip: [],
      interested: [],
      cold: [],
      inactive: [],
    };

    for (const c of contacts) {
      const msgCount = c._count.messages;
      if (msgCount > 50) segments.vip.push(c.id);
      else if (msgCount > 10) segments.interested.push(c.id);
      else if (msgCount > 0) segments.cold.push(c.id);
      else segments.inactive.push(c.id);
    }

    await this.tagContacts(workspaceId, segments.vip, 'VIP');
    await this.tagContacts(workspaceId, segments.interested, 'Interested');

    return {
      processed: contacts.length,
      segments: {
        vip: segments.vip.length,
        interested: segments.interested.length,
        cold: segments.cold.length,
        inactive: segments.inactive.length,
      },
    };
  }

  private async tagContacts(
    workspaceId: string,
    contactIds: string[],
    tagName: string,
  ) {
    if (contactIds.length === 0) return;

    let tag = await this.prisma.tag.findUnique({
      where: { workspaceId_name: { workspaceId, name: tagName } },
    });

    if (!tag) {
      tag = await this.prisma.tag.create({
        data: { workspaceId, name: tagName, color: '#FF0000' },
      });
    }

    this.logger.log(`Tagged ${contactIds.length} contacts as ${tagName}`);
  }
}
