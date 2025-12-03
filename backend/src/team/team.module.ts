import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../workspaces/workspace.service';

@Module({
  controllers: [TeamController],
  providers: [TeamService, PrismaService, WorkspaceService],
})
export class TeamModule {}
