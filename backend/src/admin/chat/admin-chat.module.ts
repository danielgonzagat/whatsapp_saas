import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminChatController } from './admin-chat.controller';
import { AdminChatService } from './admin-chat.service';
import { ChatToolRegistry } from './chat-tool.registry';
import { searchWorkspacesTool } from './tools/search-workspaces.tool';

@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [AdminChatController],
  providers: [AdminChatService, ChatToolRegistry],
  exports: [AdminChatService, ChatToolRegistry],
})
export class AdminChatModule implements OnModuleInit {
  constructor(
    private readonly registry: ChatToolRegistry,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    // Bootstrap the built-in read tools. Domain modules can
    // register their own tools via ChatToolRegistry.register from
    // their own onModuleInit in follow-up PRs.
    this.registry.register(searchWorkspacesTool(this.prisma));
  }
}
