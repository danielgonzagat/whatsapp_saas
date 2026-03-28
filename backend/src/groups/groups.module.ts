import { Module } from '@nestjs/common';
import { GroupService } from './groups.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, WhatsappModule],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupsModule {}
