import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { AccountGroup, SocialAccount } from '@shared/api.interface';
import { AccountsService } from './accounts.service';
import {
  AccountBatchMoveDto,
  CreateAccountDto,
  CreateGroupDto,
  UpdateAccountDto,
  UpdateGroupDto,
} from './accounts.dto';

@Controller('api/social/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  async listAccounts(
    @Query('platform') platform?: string,
    @Query('group') group?: string,
    @Query('status') status?: string,
  ): Promise<SocialAccount[]> {
    return this.accountsService.listAccounts({ platform, group, status });
  }

  @Get('groups')
  async listGroups(): Promise<AccountGroup[]> {
    return this.accountsService.listGroups();
  }

  @NeedLogin()
  @Post()
  async createAccount(
    @Body() dto: CreateAccountDto,
  ): Promise<SocialAccount> {
    return this.accountsService.createAccount(dto);
  }

  @NeedLogin()
  @Patch(':id')
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ): Promise<SocialAccount> {
    return this.accountsService.updateAccount(id, dto);
  }

  @NeedLogin()
  @Delete(':id')
  async deleteAccount(@Param('id') id: string): Promise<void> {
    return this.accountsService.deleteAccount(id);
  }

  @NeedLogin()
  @Get('verify/:id')
  async verifyAccount(@Param('id') id: string): Promise<SocialAccount> {
    return this.accountsService.verifyAccount(id);
  }

  @NeedLogin()
  @Post('batch-move')
  async batchMove(@Body() dto: AccountBatchMoveDto): Promise<void> {
    return this.accountsService.batchMove(dto);
  }

  @NeedLogin()
  @Post('groups')
  async createGroup(@Body() dto: CreateGroupDto): Promise<void> {
    return this.accountsService.createGroup(dto.name);
  }

  @NeedLogin()
  @Patch('groups/:name')
  async renameGroup(
    @Param('name') name: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<void> {
    return this.accountsService.renameGroup(name, dto.name);
  }

  @NeedLogin()
  @Delete('groups/:name')
  async deleteGroup(@Param('name') name: string): Promise<void> {
    return this.accountsService.deleteGroup(name);
  }
}
