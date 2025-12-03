import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LaunchService {
  constructor(private prisma: PrismaService) {}

  async createLaunch(workspaceId: string, name: string) {
    // Create launch with unique redirect ID
    return this.prisma.groupLauncher.create({
      data: {
        workspaceId,
        name,
        slug: `launch-${Date.now()}`, // Unique slug
        status: 'ACTIVE',
      },
    });
  }

  async addGroup(launcherId: string, inviteLink: string) {
    return this.prisma.launchGroup.create({
      data: {
        launcherId,
        inviteLink,
        name: `Group ${Date.now()}`,
        capacity: 1024,
      },
    });
  }

  /**
   * Gets the next available group link for the Redirector.
   * Rotates automatically when a group is marked as full.
   */
  async getNextGroup(launcherId: string) {
    const group = await this.prisma.launchGroup.findFirst({
      where: {
        launcherId,
        isActive: true,
        current: { lt: 1024 }, // Less than capacity
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!group) return null; // Waitlist logic here

    return group.inviteLink;
  }
}
