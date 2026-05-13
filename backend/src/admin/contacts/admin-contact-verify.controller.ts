import { Body, Controller, HttpCode, HttpStatus, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { ChannelIdentifierService } from '../../contacts/channel-identifier.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyChannelDto {
  @ApiProperty({ enum: ['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'EMAIL', 'TIKTOK'] })
  @IsNotEmpty()
  @IsString()
  @IsIn(['WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'EMAIL', 'TIKTOK'])
  channel!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  value!: string;
}

@Public()
@Controller('admin/contacts')
@UseGuards(AdminAuthGuard, AdminPermissionGuard)
@RouteClass('mutate')
export class AdminContactVerifyController {
  constructor(
    private readonly channelIdentifier: ChannelIdentifierService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':contactId/verify-channel')
  @HttpCode(HttpStatus.OK)
  @RequireAdminPermission(AdminModule.CLIENTES, AdminAction.EDIT)
  async verifyChannel(
    @Param('contactId') contactId: string,
    @Body() body: VerifyChannelDto,
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, workspaceId: true },
    });

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    const result = await this.channelIdentifier.markVerified(
      contact.workspaceId,
      body.channel,
      body.value,
    );

    if (!result) {
      return {
        success: false,
        message: 'Channel identifier not found. Create it first via the contacts API.',
      };
    }

    return {
      success: true,
      channelIdentifier: {
        id: result.id,
        channel: result.channel,
        value: result.value,
        contactId: result.contactId,
        workspaceId: result.workspaceId,
        isPrimary: result.isPrimary,
      },
      message: `Channel ${result.channel}:${result.value} marked as verified.`,
    };
  }
}
