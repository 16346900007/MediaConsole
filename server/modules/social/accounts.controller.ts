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
import type { SocialAccount } from '@shared/api.interface';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

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
}
