import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../auth/email.service';
import { WorkspaceService } from '../workspaces/workspace.service';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

/** Team module. */
// PrismaService intentionally NOT re-provided here — re-providing it creates a
// second PrismaClient (own connection pool) per module. The @Global PrismaModule
// supplies the singleton (issue #413: pool exhaustion).
@Module({
  controllers: [TeamController],
  providers: [TeamService, WorkspaceService, ConfigService, EmailService],
})
export class TeamModule {}
