import { Injectable, Logger } from '@nestjs/common';

/** App service. */
@Injectable()
export class AppService {
  /** Get hello. */
  getHello(): string {
    return 'Hello World!';
  }
}
