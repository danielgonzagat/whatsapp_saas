import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedRequest } from '../common/interfaces';
import { AuthService } from './auth.service';

@Controller()
export class UserProfileController {
  constructor(private readonly auth: AuthService) {}

  @Get('user/google-profile-extended')
  async googleProfileExtended(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    const accessToken = req.headers['x-google-access-token'];
    return this.auth.getGoogleExtendedProfile(
      agentId,
      typeof accessToken === 'string' ? accessToken : '',
    );
  }
}
