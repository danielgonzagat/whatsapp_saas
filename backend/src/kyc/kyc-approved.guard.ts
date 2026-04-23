import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { KYC_REQUIRED_METADATA } from './kyc-approved.decorator';

/** Kyc approved guard. */
@Injectable()
export class KycApprovedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /** Can activate. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kycRequired = this.reflector.getAllAndOverride<boolean>(KYC_REQUIRED_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!kycRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user?.sub) {
      return true;
    }

    const agent = await this.prisma.agent.findUnique({
      where: { id: user.sub },
      select: { kycStatus: true },
    });

    if (!agent || agent.kycStatus !== 'approved') {
      throw new ForbiddenException({
        error: 'kyc_not_approved',
        message: 'Complete seu cadastro para usar esta funcionalidade',
        kycStatus: agent?.kycStatus || 'unknown',
      });
    }

    return true;
  }
}
