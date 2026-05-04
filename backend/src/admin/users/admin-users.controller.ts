import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAction, AdminModule, AdminRole } from '@prisma/client';
import { Public } from '../../auth/public.decorator';
import { Idempotent } from '../../common/idempotency.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { RequireAdminPermission } from '../auth/decorators/admin-permission.decorator';
import { RequireAdminRole } from '../auth/decorators/admin-role.decorator';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';
import { AdminPermissionGuard } from '../auth/guards/admin-permission.guard';
import { AdminRoleGuard } from '../auth/guards/admin-role.guard';
import type { AuthenticatedAdmin } from '../auth/admin-token.types';
import { AdminPermissionsService } from '../permissions/admin-permissions.service';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { SetPermissionsDto } from './dto/set-permissions.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

/** Admin users controller. */
@Public()
@Controller('admin/users')
@UseGuards(AdminAuthGuard, AdminRoleGuard, AdminPermissionGuard)
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly permissions: AdminPermissionsService,
  ) {}

  /** Me. */
  @Get('me')
  async me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.users.findMe(admin.id);
  }

  /** List. */
  @Get()
  @RequireAdminPermission(AdminModule.IAM, AdminAction.VIEW)
  async list() {
    return this.users.list();
  }

  /** Create. */
  @Post()
  @Idempotent()
  @RequireAdminPermission(AdminModule.IAM, AdminAction.CREATE)
  async create(@Body() dto: CreateAdminUserDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.users.create({
      name: dto.name,
      email: dto.email,
      temporaryPassword: dto.temporaryPassword,
      role: dto.role,
      createdById: admin.id,
      createdByRole: admin.role,
    });
  }

  /** Update. */
  @Patch(':id')
  @RequireAdminPermission(AdminModule.IAM, AdminAction.EDIT)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.users.update(id, {
      name: dto.name,
      role: dto.role,
      status: dto.status,
      actorRole: admin.role,
      actorId: admin.id,
    });
  }

  /** Set permissions. */
  @Put(':id/permissions')
  @RequireAdminRole(AdminRole.OWNER)
  async setPermissions(
    @Param('id') id: string,
    @Body() dto: SetPermissionsDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ) {
    return this.users.setPermissions(id, admin.id, dto.permissions);
  }

  /** Get permissions. */
  @Get(':id/permissions')
  @RequireAdminPermission(AdminModule.IAM, AdminAction.VIEW)
  async getPermissions(@Param('id') id: string) {
    return this.permissions.listFor(id);
  }
}
