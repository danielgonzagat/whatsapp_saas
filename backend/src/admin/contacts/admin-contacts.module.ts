import { Module } from '@nestjs/common';
import { ContactsModule } from '../../contacts/contacts.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminContactVerifyController } from './admin-contact-verify.controller';

@Module({
  imports: [ContactsModule, PrismaModule],
  controllers: [AdminContactVerifyController],
})
export class AdminContactsModule {}
