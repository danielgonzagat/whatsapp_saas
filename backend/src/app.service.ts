import { Injectable, Logger } from '@nestjs/common';

/** App service. */
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  /** Get hello. */
  getHello(): string {
    this.logger.log('AppService initialized');
    return 'Hello World!';
  }
}
