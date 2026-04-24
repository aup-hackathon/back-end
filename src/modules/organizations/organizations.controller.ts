import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { UserRole } from '../../database/enums';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { Roles } from '../../core/decorators/roles.decorator';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { OrgMemberGuard } from './org-member.guard';
import { OrganizationsService } from './organizations.service';
import { RequestUser } from './types/request-user.type';

@ApiTags('organizations')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('org')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post('invite')
  @ApiOperation({ summary: 'Invite a user to the caller organization' })
  @ApiResponse({ status: 201, description: 'Pending user invitation created' })
  invite(@Body() dto: InviteUserDto, @CurrentUser() caller: RequestUser) {
    return this.organizationsService.inviteUser(dto, caller);
  }

  @Patch('users/:id/role')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Update an organization user role' })
  @ApiResponse({ status: 200, description: 'User role updated' })
  updateRole(
    @Param('id') userId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() caller: RequestUser,
  ) {
    return this.organizationsService.updateUserRole(userId, dto, caller);
  }

  @Delete('users/:id')
  @UseGuards(OrgMemberGuard)
  @ApiOperation({ summary: 'Revoke an organization user' })
  @ApiResponse({ status: 200, description: 'User access revoked' })
  revoke(@Param('id') userId: string, @CurrentUser() caller: RequestUser) {
    return this.organizationsService.revokeUser(userId, caller);
  }
}
