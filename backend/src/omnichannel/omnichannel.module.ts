import { Module } from '@nestjs/common';
import { ContactsModule } from '../contacts/contacts.module';
import { OmnichannelContactResolutionService } from './contact-resolution.service';

@Module({
  imports: [ContactsModule],
  providers: [OmnichannelContactResolutionService],
  exports: [OmnichannelContactResolutionService],
})
export class OmnichannelModule {}
