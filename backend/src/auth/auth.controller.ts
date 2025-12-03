import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('check-email')
  async checkEmail(@Body() body: { email: string }) {
    return this.auth.checkEmail(body.email);
  }

  @Public()
  @Post('register')
  async register(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      workspaceName?: string;
    },
  ) {
    return this.auth.register({ ...body, ip: req.ip });
  }

  @Public()
  @Post('login')
  async login(
    @Req() req: any,
    @Body() body: { email: string; password: string },
  ) {
    return this.auth.login({ ...body, ip: req.ip });
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }
}
