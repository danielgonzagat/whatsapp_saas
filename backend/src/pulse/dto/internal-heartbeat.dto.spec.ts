import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { PulseInternalHeartbeatDto } from './internal-heartbeat.dto';

describe('PulseInternalHeartbeatDto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });

  const metadata: ArgumentMetadata = {
    type: 'body',
    metatype: PulseInternalHeartbeatDto,
    data: undefined,
  };

  it('accepts free-form runtime signals without tripping whitelist validation', async () => {
    await expect(
      pipe.transform(
        {
          nodeId: 'worker:test-replica',
          role: 'worker',
          status: 'UP',
          summary: 'Worker heartbeat healthy.',
          ttlMs: 45_000,
          critical: true,
          signals: {
            redisStatus: 'UP',
            autopilotWaiting: 3,
            workerRole: 'all',
            queueHealthy: true,
          },
        },
        metadata,
      ),
    ).resolves.toMatchObject({
      role: 'worker',
      status: 'UP',
      signals: {
        redisStatus: 'UP',
        autopilotWaiting: 3,
        workerRole: 'all',
        queueHealthy: true,
      },
    });
  });
});
