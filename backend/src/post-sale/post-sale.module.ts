import { Module } from '@nestjs/common';
import { PostSaleEventEmitterService } from '../kloel/post-sale-emitter/post-sale-event-emitter.service';
import { SpineModule } from '../kloel/spine/spine.module';

@Module({
  imports: [SpineModule],
  providers: [PostSaleEventEmitterService],
  exports: [PostSaleEventEmitterService],
})
export class PostSaleModule {}
