import { HttpStatus, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

const MAX_BODY_SIZE = 10485760; // 10MB

@Injectable()
export class BodySizeMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const contentLength = req.headers['content-length'];

    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!isNaN(size) && size > MAX_BODY_SIZE) {
        res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
          statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
          message: 'Payload too large',
          maxSize: MAX_BODY_SIZE,
        });
        return;
      }
    }

    next();
  }
}
