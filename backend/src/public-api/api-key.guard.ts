import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../api-keys/api-keys.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API Key missing');
    }

    const keyRecord = await this.apiKeysService.validateKey(apiKey);

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid API Key');
    }

    request.user = { workspaceId: keyRecord.workspaceId };
    return true;
  }
}
