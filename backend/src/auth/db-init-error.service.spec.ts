import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DbInitErrorService } from './db-init-error.service';

describe('DbInitErrorService', () => {
  describe('throwFriendlyDbInitError', () => {
    it('throws ServiceUnavailableException for P2021 schema mismatch', () => {
      const error = new Prisma.PrismaClientKnownRequestError('table does not exist', {
        code: 'P2021',
        clientVersion: '5.0.0',
      });

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException for P2022 schema mismatch', () => {
      const error = new Prisma.PrismaClientKnownRequestError('column does not exist', {
        code: 'P2022',
        clientVersion: '5.0.0',
      });

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException for P1001 connectivity error', () => {
      const error = new Prisma.PrismaClientKnownRequestError('cannot reach database', {
        code: 'P1001',
        clientVersion: '5.0.0',
      });

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException for P1002 connectivity error', () => {
      const error = new Prisma.PrismaClientKnownRequestError('connection timed out', {
        code: 'P1002',
        clientVersion: '5.0.0',
      });

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException for PrismaClientInitializationError', () => {
      const error = new Prisma.PrismaClientInitializationError(
        'connection pool exhausted',
        '5.0.0',
      );

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws ServiceUnavailableException for "database not initialized" message', () => {
      const error = new Error('database not initialized');

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(
        ServiceUnavailableException,
      );
    });

    it('re-throws unknown errors as-is', () => {
      const error = new TypeError('unexpected type');

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow(TypeError);
    });

    it('re-throws plain objects', () => {
      const error = { code: 'UNKNOWN' };

      expect(() => DbInitErrorService.throwFriendlyDbInitError(error)).toThrow();
    });
  });
});
