import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { captureException } from './sentry';

/**
 * Filtro global que reporta exceptions ao Sentry (se habilitado)
 * e delega a resposta padrão do Nest.
 */
@Catch()
export class SentryExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(private readonly adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: any, host: ArgumentsHost) {
    captureException(exception);
    super.catch(exception, host);
  }
}
