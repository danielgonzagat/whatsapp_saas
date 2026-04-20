import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { KYC_REQUIRED_KEY } from './kyc-approved.decorator';

@Injectable()
export class KycApprovedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kycRequired = this.reflector.getAllAndOverride<boolean>(KYC_REQUIRED_KEY, [
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
