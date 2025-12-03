import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SystemHealthService {
  constructor(
    private prisma: PrismaService,
    @InjectRedis() private redis: Redis,
    private config: ConfigService,
  ) {}

  async check() {
    const status = {
      database: await this.checkDatabase(),
      redis: await this.checkRedis(),
      openai: this.checkOpenAI(),
      stripe: this.checkStripe(),
      version: '0.0.365', // From context
      timestamp: new Date().toISOString(),
    };

    const isHealthy = Object.values(status)
      .filter((s: any) => typeof s === 'object' && s && 'status' in s)
      .every((s: any) => s.status === 'UP' || s.status === 'CONFIGURED');
    return {
      status: isHealthy ? 'UP' : 'DEGRADED',
      details: status,
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'UP', latency: 'OK' };
    } catch (e) {
      return { status: 'DOWN', error: e.message };
    }
  }

  private async checkRedis() {
    try {
      await this.redis.ping();
      return { status: 'UP' };
    } catch (e) {
      return { status: 'DOWN', error: e.message };
    }
  }

  private checkOpenAI() {
    const key = this.config.get('OPENAI_API_KEY');
    return { status: key ? 'CONFIGURED' : 'MISSING' };
  }

  private checkStripe() {
    const key = this.config.get('STRIPE_SECRET_KEY');
    return { status: key ? 'CONFIGURED' : 'MISSING' };
  }
}
